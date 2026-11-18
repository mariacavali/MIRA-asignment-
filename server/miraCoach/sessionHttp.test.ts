import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { TRPCError } from "@trpc/server";
import { registerSessionHttp } from "./sessionHttp";

function fixture() {
  const handlers = new Map<string, Function>(), middleware: Function[] = [];
  const app = { use: (_path: string, handler: Function) => middleware.push(handler), get: (path: string, handler: Function) => handlers.set(`GET ${path}`, handler), post: (path: string, handler: Function) => handlers.set(`POST ${path}`, handler) };
  const runtime = { readBrandContext: vi.fn(async () => ({})), remainingCallMs: vi.fn(async () => 50_000), readSpokenReply: vi.fn(async () => "A stored MIRA reply.") };
  const audio = { transcribe: vi.fn(async () => "Client words"), speak: vi.fn(async () => Buffer.from([1,2,3])) };
  const options = { enabled: vi.fn(() => true), context: vi.fn(async () => ({ user: { id: 1 } })), runtime: vi.fn(async () => runtime), references: null, audio, capabilities: async () => ({ text: true, voice: true }) };
  registerSessionHttp(app as never, options as never);
  async function invoke(path: string, body: unknown) {
    const req = Object.assign(new EventEmitter(), { body, method: "POST", headers: { host: "localhost:5183", origin: "http://localhost:5183" } });
    const res = Object.assign(new EventEmitter(), { headersSent: false, writableEnded: false, statusCode: 200, value: undefined as unknown,
      setHeader: vi.fn(), type() { return this; }, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.value = value; this.headersSent = true; }, send(value: unknown) { this.value = value; this.headersSent = true; } });
    await handlers.get(`POST /api/mira-session/${path}`)!(req, res); return { req, res };
  }
  return { invoke, options, runtime, audio };
}
const scope = { workspaceId: 2, conversationId: "78bb6712-910f-4b72-844e-fd6529fb3452", requestId: "1e892f71-7a37-4311-946f-5b1e09b3947c" };
describe("connected session HTTP boundaries", () => {
  it("blocks disabled and unauthenticated sessions before provider access", async () => {
    const f = fixture(); f.options.enabled.mockReturnValue(false);
    expect((await f.invoke("speak", { ...scope, sourceRequestId: null })).res.statusCode).toBe(404);
    expect(f.options.context).not.toHaveBeenCalled(); expect(f.audio.speak).not.toHaveBeenCalled();
    f.options.enabled.mockReturnValue(true); f.options.context.mockResolvedValue({ user: null } as never);
    expect((await f.invoke("speak", { ...scope, sourceRequestId: null })).res.statusCode).toBe(401); expect(f.audio.speak).not.toHaveBeenCalled();
  });
  it("only synthesises an owned saved response and refuses client supplied speech text", async () => {
    const f = fixture(); const result = await f.invoke("speak", { ...scope, sourceRequestId: null });
    expect(result.res.value).toEqual(Buffer.from([1,2,3]));
    expect(f.runtime.readSpokenReply).toHaveBeenCalledWith({ workspaceId: 2, conversationId: scope.conversationId, userId: 1 }, null);
    expect(f.audio.speak).toHaveBeenCalledWith("A stored MIRA reply.", expect.any(AbortSignal));
    expect(f.runtime.remainingCallMs).toHaveBeenCalledTimes(2);
    expect((await f.invoke("speak", { ...scope, sourceRequestId: null, text: "Untrusted arbitrary input" })).res.statusCode).toBe(400);
    expect(f.audio.speak).toHaveBeenCalledTimes(1);
  });
  it("refuses a paused or exhausted call before transcription and cancels disconnected audio", async () => {
    const f = fixture(); f.runtime.remainingCallMs.mockRejectedValueOnce(new TRPCError({ code: "CONFLICT", message: "Resume your call first." }));
    const body = { ...scope, mime: "audio/webm", base64: Buffer.from("test").toString("base64") };
    expect((await f.invoke("transcribe", body)).res.statusCode).toBe(409); expect(f.audio.transcribe).not.toHaveBeenCalled();
    const { res } = await f.invoke("transcribe", body); expect(res.value).toEqual({ text: "Client words" });
    const signal = (f.audio.transcribe.mock.calls[0] as unknown as [Buffer, string, AbortSignal])[2]; res.emit("close"); expect(signal.aborted).toBe(true);
  });
  it("does not spend the final local-trial requests on a voice exchange that cannot finish", async () => {
    const f = fixture();
    f.options.capabilities = async () => ({ text: true, voice: true, localReview: true,
      trial: { state: "active", maxRequests: 12, usedRequests: 10, remainingRequests: 2, expiresAt: new Date(Date.now() + 60_000).toISOString() } }) as never;
    const input = { ...scope, mime: "audio/webm", base64: Buffer.from("test").toString("base64") };
    const { res } = await f.invoke("transcribe", input);
    expect(res.statusCode).toBe(503); expect(res.value).toMatchObject({ error: expect.stringContaining("Continue with text") });
    expect(f.audio.transcribe).not.toHaveBeenCalled();
    // Speech completing an already-started exchange still needs just its own request.
    expect((await f.invoke("speak", { ...scope, sourceRequestId: null })).res.statusCode).toBe(200);
    expect(f.audio.speak).toHaveBeenCalledTimes(1);
  });
});
