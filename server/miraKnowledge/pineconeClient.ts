import { z } from "zod";
import type { SearchDocumentsOptions } from "@pinecone-database/pinecone";
import { contentHash } from "./schema";
import { PINECONE_BATCH_SIZE, pineconeTarget, type PineconeSeedPlan, type PineconeTarget } from "./pineconePlan";

const matchSchema = z.object({ _id: z.string().max(128), _score: z.number().finite().nullable(), mira_corpus: z.string(),
  mira_item: z.string(), mira_version: z.number().int().positive(), mira_kind: z.enum(["card", "judgement", "passage"]), mira_item_hash: z.string() });
export type PineconeMatch = z.infer<typeof matchSchema>;
export type PineconeSearch = (input: { namespace: string; query: string; filter: object; signal: AbortSignal }) => Promise<PineconeMatch[]>;

// No SDK construction or request at import/startup. The host is explicit, so the
// SDK does not perform control-plane index discovery. Never log SDK errors.
export function createPineconeDocumentClient(options: { target: PineconeTarget; apiKey: string; readEnabled: boolean; seedEnabled: boolean; fetcher?: typeof fetch; timeoutMs?: number }) {
  const target = pineconeTarget({ PINECONE_INDEX_HOST: options.target.host, PINECONE_NAMESPACE: options.target.namespace });
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("Invalid Pinecone deadline.");
  async function documents(namespace: string, signal?: AbortSignal) {
    if (!options.apiKey.trim()) throw new Error("Pinecone credentials are not configured.");
    if (!namespace.startsWith(`${target.namespace}-`) || !/^[A-Za-z0-9_-]{1,200}$/.test(namespace)) throw new Error("Invalid expertise namespace.");
    const { Pinecone } = await import("@pinecone-database/pinecone");
    signal?.throwIfAborted();
    const fetchApi: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== target.host || init?.method !== "POST" || !url.pathname.includes("/documents/")) throw new Error("Unexpected Pinecone operation.");
      const response = await (options.fetcher ?? fetch)(input, { ...init, redirect: "error",
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : []), ...(init?.signal ? [init.signal] : [])]) });
      // Bound response bytes before the SDK parses JSON, including error bodies.
      const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 1_000_000) { await reader.cancel(); throw new Error("Pinecone response exceeds limit."); }
        chunks.push(part.value);
      }
      return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
    };
    return new Pinecone({ apiKey: options.apiKey, maxRetries: 0, fetchApi }).index({ host: target.host, namespace }).documents;
  }
  return {
    // ID-only selection, bounded to one seed batch. Fetch does not embed text.
    // Callers still reserve their approved read budget before dispatch.
    async fetchBatch(namespace: string, ids: string[]) {
      if (!options.readEnabled) throw new Error("Pinecone reads are disabled.");
      if (!ids.length || ids.length > PINECONE_BATCH_SIZE || new Set(ids).size !== ids.length
        || ids.some(id => !/^mira-[a-f0-9]{64}$/.test(id))) throw new Error("Invalid seed verification selection.");
      try {
        const api = await documents(namespace);
        const response = await api.fetch({ ids, includeFields: ["title", "chunk_text", "mira_scope", "mira_corpus", "mira_item", "mira_version",
          "mira_kind", "mira_item_hash", "mira_segments", "mira_language", "mira_dimensions", "mira_chunk"] });
        if (response.namespace !== namespace || Object.keys(response.documents).some(id => !ids.includes(id))) throw new Error("Unexpected verification response.");
        return response.documents as Record<string, Record<string, unknown>>;
      } catch { throw new Error("Seed verification is unavailable. No write or retry was made."); }
    },
    search: (async ({ namespace, query, filter, signal }) => {
      if (!options.readEnabled) throw new Error("Pinecone reads are disabled.");
      if (!query.trim() || query.length > 8000) throw new Error("Invalid expertise query.");
      try {
        const api = await documents(namespace, signal);
        const input: SearchDocumentsOptions = { scoreBy: [{ type: "embed", field: "chunk_text", query }], topK: 32, filter,
          includeFields: ["mira_corpus", "mira_item", "mira_version", "mira_kind", "mira_item_hash"] };
        const response = await api.search(input);
        if (response.namespace !== namespace) throw new Error("Namespace mismatch.");
        return z.array(matchSchema).max(32).parse(response.matches);
      } catch { throw new Error("Shared expertise search is unavailable."); }
    }) as PineconeSearch,
    // Internal primitive only, deliberately not exposed through an HTTP route
    // or CLI. A durable seed job/approval receipt is required before live use.
    async writeBatch(plan: PineconeSeedPlan, batchIndex: number, permit: { approved: true; fingerprint: string; maxRecords: number; expiresAt: string }) {
      if (!options.seedEnabled || permit.approved !== true) throw new Error("Pinecone seeding is disabled.");
      const { fingerprint, ...metadata } = plan.preview;
      const expires = Date.parse(permit.expiresAt), now = Date.now();
      if (!Number.isFinite(expires) || expires <= now || expires > now + 2 * 60 * 60_000 || permit.fingerprint !== fingerprint
        || fingerprint !== contentHash({ ...metadata, documents: plan.documents }) || plan.preview.target.host !== target.host
        || !Number.isInteger(permit.maxRecords) || permit.maxRecords < plan.documents.length || permit.maxRecords > 6400
        || !plan.documents.length || !Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= plan.preview.batchCount) {
        throw new Error("A current bounded seed approval is required.");
      }
      const batch = plan.documents.slice(batchIndex * PINECONE_BATCH_SIZE, (batchIndex + 1) * PINECONE_BATCH_SIZE);
      if (Buffer.byteLength(JSON.stringify({ documents: batch })) > 1_900_000) throw new Error("Seed batch exceeds limit.");
      try {
        const api = await documents(plan.preview.target.namespace);
        const result = await api.upsert({ documents: batch });
        if (result.upsertedCount !== batch.length) throw new Error("Partial seed response.");
        return { batchIndex, acceptedRecords: result.upsertedCount, fingerprint };
      } catch { throw new Error("Seed result is unconfirmed. No retry was made; reconcile before trying again."); }
    },
  };
}
