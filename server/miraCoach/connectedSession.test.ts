import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createReferenceAssets } from "./referenceAssets";
import { createLiveProviderGate } from "./liveProviderGate";
import { createSessionAudio } from "./audio";
import { createReferenceObserver } from "./referenceObserver";
import { localProviderTrialSchema } from "../../shared/miraSession";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function root() { const path = await mkdtemp(join(tmpdir(), "mira-session-test-")); temporary.push(path); return path; }
const scope = { userId: 1, workspaceId: 2, conversationId: "78bb6712-910f-4b72-844e-fd6529fb3452" };
function store() {
  let revision = 0;
  return { readBrandContext: vi.fn(async (value: typeof scope) => { if (value.userId !== 1) throw new Error("Private scope"); return { revision }; }),
    addSource: vi.fn(async (_userId: number, _input: { source: { text: string } }) => { revision++; return { sourceId: randomUUID() }; }), withdrawSource: vi.fn(async () => { revision++; }) };
}
function upload(text = "A synthetic reference used only for connection testing.") { return { workspaceId: scope.workspaceId, conversationId: scope.conversationId,
  requestId: randomUUID(), name: "connection-test.txt", mime: "text/plain" as const, base64: Buffer.from(text).toString("base64"), approvedForCoaching: true as const, description: "" }; }

describe("private connected reference intake", () => {
  it("saves actual bytes, deduplicates concurrent intake, and withdraws the source", async () => {
    const db = store(), assets = createReferenceAssets({ root: await root(), store: db as never });
    const [a, b] = await Promise.all([assets.upload(1, upload()), assets.upload(1, upload())]);
    expect(a.id).toBe(b.id); expect(db.addSource).toHaveBeenCalledTimes(1);
    expect((await assets.get(scope, a.id)).bytes.toString()).toContain("synthetic reference");
    await expect(assets.get({ ...scope, userId: 99 }, a.id)).rejects.toThrow("Private scope");
    await assets.withdraw(scope, a.id);
    expect(await assets.list(scope)).toEqual([]); expect(db.withdrawSource).toHaveBeenCalledTimes(1);
    await expect(assets.get(scope, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects mismatched file signatures and unsafe storage before adding a source", async () => {
    const db = store(), path = await root(), assets = createReferenceAssets({ root: path, store: db as never });
    await expect(assets.upload(1, { ...upload(), mime: "image/png" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await chmod(path, 0o755);
    await expect(assets.upload(1, upload())).rejects.toThrow("must be private"); expect(db.addSource).not.toHaveBeenCalled();
  });
  it("refuses a symlinked private root", async () => {
    const path = await root(), linked = join(await root(), "linked"); await symlink(path, linked);
    const assets = createReferenceAssets({ root: linked, store: store() as never });
    await expect(assets.list(scope)).rejects.toThrow("must be private");
  });
  it("keeps image observations provisional, serialises repeated analysis, and withdraws them", async () => {
    const db = store(), observeImage = vi.fn(async () => "Unreviewed AI observations: muted green background."), assets = createReferenceAssets({ root: await root(), store: db as never, observeImage });
    const image = await assets.upload(1, { ...upload(), name: "test.png", mime: "image/png", base64: Buffer.from([137,80,78,71,13,10,26,10]).toString("base64") });
    expect(image.status).toBe("needs_description"); expect(db.addSource).not.toHaveBeenCalled();
    await Promise.all([assets.analyse(scope, image.id), assets.analyse(scope, image.id)]);
    expect(observeImage).toHaveBeenCalledTimes(1); expect(db.addSource).toHaveBeenCalledTimes(1);
    expect(db.addSource.mock.calls[0][1].source.text).toContain("Unreviewed AI observations");
    await assets.withdraw(scope, image.id); expect(db.withdrawSource).toHaveBeenCalledTimes(1);
  });
});

describe("bounded local provider access", () => {
  it("reports a private, persistent trial allowance without dispatching a request", async () => {
    const path = await root(), fetcher = vi.fn(async () => Response.json({})), gate = createLiveProviderGate(path, fetcher);
    expect(await gate.status()).toEqual({ state: "not_authorised", maxRequests: 0, usedRequests: 0, remainingRequests: 0, expiresAt: null });
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await writeFile(join(path, "provider-approval.json"), JSON.stringify({ scope: "local-mira-review", approved: true, maxRequests: 2, expiresAt, allowedModels: ["test-model"] }));
    expect(localProviderTrialSchema.parse(await gate.status())).toEqual({ state: "active", maxRequests: 2, usedRequests: 0, remainingRequests: 2, expiresAt });
    expect(fetcher).not.toHaveBeenCalled();
    const request = () => gate.fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test-model" }) });
    await request();
    expect(await createLiveProviderGate(path).status()).toMatchObject({ state: "active", usedRequests: 1, remainingRequests: 1 });
    await request();
    expect(await gate.status()).toMatchObject({ state: "exhausted", usedRequests: 2, remainingRequests: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retains expired-trial usage without treating an old allowance as available", async () => {
    const path = await root(), fetcher = vi.fn(), expiresAt = "2020-01-01T00:00:00.000Z";
    await writeFile(join(path, "provider-approval.json"), JSON.stringify({ scope: "local-mira-review", approved: true, maxRequests: 12, expiresAt, allowedModels: ["test-model"] }));
    await writeFile(join(path, "provider-usage.json"), JSON.stringify({ count: 4, expiresAt }));
    const gate = createLiveProviderGate(path, fetcher);
    expect(localProviderTrialSchema.parse(await gate.status())).toEqual({ state: "expired", maxRequests: 12, usedRequests: 4, remainingRequests: 0, expiresAt });
    await expect(gate.fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test-model" }) })).rejects.toThrow("not been authorised");
    expect(fetcher).not.toHaveBeenCalled();
    await writeFile(join(path, "provider-approval.json"), "invalid json");
    expect(await gate.status()).toMatchObject({ state: "not_authorised", remainingRequests: 0 });
  });
  it("makes no request without approval or with expired approval", async () => {
    const path = await root(), fetcher = vi.fn(), gate = createLiveProviderGate(path, fetcher);
    const request = () => gate.fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test-model" }) });
    await expect(request()).rejects.toThrow("not been authorised");
    await writeFile(join(path, "provider-approval.json"), JSON.stringify({ scope: "local-mira-review", approved: true, maxRequests: 2, expiresAt: "2020-01-01T00:00:00.000Z", allowedModels: ["test-model"] }));
    expect(await gate.enabled()).toBe(false); await expect(request()).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("reserves before dispatch, caps concurrent calls, and persists ambiguous failures", async () => {
    const path = await root(); await writeFile(join(path, "provider-approval.json"), JSON.stringify({ scope: "local-mira-review", approved: true, maxRequests: 2, expiresAt: new Date(Date.now() + 60_000).toISOString(), allowedModels: ["test-model"] }));
    const fetcher = vi.fn(async () => { throw new Error("Connection lost after dispatch"); }), gate = createLiveProviderGate(path, fetcher);
    expect(await gate.imageEnabled()).toBe(false);
    await expect(gate.fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,eA==" } }] }] }) })).rejects.toThrow("Image observation has not been authorised");
    const request = () => gate.fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test-model" }) });
    await expect(gate.fetch("https://other.example/v1/chat", { method: "POST" })).rejects.toThrow("not allowed");
    const results = await Promise.allSettled([request(), request(), request()]);
    expect(results.every(value => value.status === "rejected")).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await gate.enabled()).toBe(false); expect(await createLiveProviderGate(path).enabled()).toBe(false);
    expect(JSON.parse(await readFile(join(path, "provider-usage.json"), "utf8")).count).toBe(2);
  });
});

describe("voice and image provider contracts without paid calls", () => {
  it("uses bounded transcription files and server speech text without automatic retries", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => url.endsWith("transcriptions") ? Response.json({ text: "A client answer." }) : new Response(new Uint8Array([1,2,3]), { headers: { "content-type": "audio/mpeg" } }));
    const audio = createSessionAudio({ apiKey: "test-only", fetch: fetcher as typeof fetch });
    expect(await audio.transcribe(Buffer.from("synthetic audio"), "audio/webm")).toBe("A client answer.");
    const form = fetcher.mock.calls[0][1].body as FormData; expect(form.get("model")).toBe("gpt-transcribe"); expect((form.get("file") as Blob).type).toBe("audio/webm");
    expect(await audio.speak("A saved MIRA reply.")).toEqual(Buffer.from([1,2,3]));
    expect(JSON.parse(fetcher.mock.calls[1][1].body as string)).toMatchObject({ input: "A saved MIRA reply.", voice: "marin" });
    await expect(audio.transcribe(Buffer.alloc(2 * 1024 * 1024 + 1), "audio/webm")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const failed = vi.fn(async () => new Response("private provider error", { status: 500 }));
    await expect(createSessionAudio({ apiKey: "test-only", fetch: failed }).speak("Reply")).rejects.toThrow("No automatic retry"); expect(failed).toHaveBeenCalledTimes(1);
  });
  it("does not promote image observations into client facts", async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "Soft side light and a green wall." } }] }));
    const observe = createReferenceObserver({ apiKey: "test-only", model: "test-model", fetch: fetcher });
    expect(await observe(Buffer.from("synthetic image"), "image/png")).toContain("not client facts or preferences");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain("untrusted reference material"); expect(body.messages[1].content[1].image_url.detail).toBe("low");
  });
});
