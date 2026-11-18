import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { LocalProviderTrial } from "../../shared/miraSession";

const approvalSchema = z.object({ scope: z.literal("local-mira-review"), approved: z.literal(true), maxRequests: z.number().int().min(1).max(12),
  expiresAt: z.string().datetime(), allowedModels: z.array(z.string().min(1).max(100)).min(1).max(3), allowImageObservation: z.literal(true).optional(),
  maxRequestBytes: z.number().int().positive().max(100_000).optional(),
  maxCompletionTokens: z.number().int().positive().max(1800).optional() }).strict();
// Local review only: no silent spend, fallback, retry or unlimited provider loop.
export function createLiveProviderGate(root: string, fetcher: typeof fetch = fetch) {
  let queue = Promise.resolve();
  async function settings() {
    try { return approvalSchema.parse(JSON.parse(await readFile(join(root, "provider-approval.json"), "utf8"))); }
    catch { return null; }
  }
  async function usage() { try { return z.object({ count: z.number().int().nonnegative(), expiresAt: z.string() }).parse(JSON.parse(await readFile(join(root, "provider-usage.json"), "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { count: 0, expiresAt: "" }; throw error; } }
  async function status(): Promise<LocalProviderTrial> {
    await queue;
    const approval = await settings();
    if (!approval) return { state: "not_authorised", maxRequests: 0, usedRequests: 0, remainingRequests: 0, expiresAt: null };
    const used = await usage(), usedRequests = Math.min(approval.maxRequests, used.expiresAt === approval.expiresAt ? used.count : 0);
    const state = Date.parse(approval.expiresAt) <= Date.now() ? "expired" : usedRequests >= approval.maxRequests ? "exhausted" : "active";
    return { state, maxRequests: approval.maxRequests, usedRequests, remainingRequests: state === "active" ? approval.maxRequests - usedRequests : 0, expiresAt: approval.expiresAt };
  }
  return {
    status,
    async enabled() { return (await status()).state === "active"; },
    async imageEnabled() { return !!(await settings())?.allowImageObservation && (await status()).state === "active"; },
    fetch: (async (url, init) => {
      const target = new URL(String(url));
      if (target.origin !== "https://api.openai.com" || init?.method !== "POST") throw new Error("Provider endpoint is not allowed");
      const reserve = queue.then(async () => {
        const approval = await settings(); if (!approval || Date.parse(approval.expiresAt) <= Date.now()) throw new Error("A bounded live test has not been authorised");
        if(approval.maxRequestBytes!==undefined && (typeof init.body!=="string" || Buffer.byteLength(init.body,"utf8")>approval.maxRequestBytes))throw new Error("Approved request byte limit exceeded");
        if(approval.maxCompletionTokens!==undefined){
          const limit=typeof init.body==="string"?JSON.parse(init.body).max_completion_tokens:undefined;
          if(!Number.isInteger(limit)||limit<1||limit>approval.maxCompletionTokens)throw new Error("Approved completion token limit exceeded");
        }
        const model = typeof init.body === "string" ? JSON.parse(init.body).model : init.body instanceof FormData ? init.body.get("model") : null;
        if (typeof model !== "string" || !approval.allowedModels.includes(model)) throw new Error("Provider model is not allowed");
        if (typeof init.body === "string" && JSON.stringify(JSON.parse(init.body).messages ?? []).includes('"type":"image_url"') && !approval.allowImageObservation) throw new Error("Image observation has not been authorised");
        const used = await usage(), count = used.expiresAt === approval.expiresAt ? used.count : 0;
        if (count >= approval.maxRequests) throw new Error("Local review request limit reached");
        await mkdir(root, { recursive: true, mode: 0o700 });
        const path = join(root, "provider-usage.json"), temporary = path + ".tmp";
        await writeFile(temporary, JSON.stringify({ count: count + 1, expiresAt: approval.expiresAt }), { mode: 0o600 }); await rename(temporary, path);
      });
      queue = reserve.catch(() => {}); await reserve;
      return fetcher(url, init);
    }) as typeof fetch,
  };
}
