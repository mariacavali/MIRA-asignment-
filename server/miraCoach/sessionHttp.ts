import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { coachConversationInputSchema } from "../../shared/miraCoach";
import { uploadSessionReferenceSchema, type SessionCapabilities } from "../../shared/miraSession";
import type { TrpcContext } from "../_core/context";
import type { CoachRuntime } from "./runtime";
import type { createReferenceAssets } from "./referenceAssets";
import type { createSessionAudio } from "./audio";

export function registerSessionHttp(app: Express, options: { context: (req: Request, res: Response) => Promise<TrpcContext>; runtime: () => Promise<CoachRuntime>;
  references: ReturnType<typeof createReferenceAssets> | null; audio: ReturnType<typeof createSessionAudio> | null; capabilities: () => Promise<SessionCapabilities>; enabled?: () => boolean }) {
  app.use("/api/mira-session", (req, res, next) => {
    if (req.method === "POST" && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) { res.status(403).json({ error: "Open this action from your MIRA session." }); return; } }
      catch { res.status(403).end(); return; }
    }
    next();
  });
  const action = (run: (req: Request, res: Response, userId: number, runtime: CoachRuntime) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (options.enabled && !options.enabled()) throw new TRPCError({ code: "NOT_FOUND", message: "MIRA sessions are not enabled here yet." });
      const context = await options.context(req, res);
      if (!context.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to open your private MIRA session." });
      const value = await run(req, res, context.user.id, await options.runtime());
      if (!res.headersSent) res.json(value);
    } catch (error) {
      if (res.headersSent) return;
      const code = error instanceof TRPCError ? error.code : error instanceof z.ZodError ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR";
      const status = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, BAD_REQUEST: 400, CONFLICT: 409 }[code as "UNAUTHORIZED"] ?? 503;
      res.status(status).json({ error: error instanceof TRPCError ? error.message : "This action could not be completed. Your saved session is still available." });
    }
  };
  const scope = (req: Request, userId: number) => ({ ...coachConversationInputSchema.parse(req.method === "GET" ? { workspaceId: Number(req.query.workspaceId), conversationId: req.query.conversationId } : req.body), userId });
  const disconnectSignal = (req: Request, res: Response) => {
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    res.once("close", () => { if (!res.writableEnded) controller.abort(); });
    return controller.signal;
  };
  app.get("/api/mira-session/capabilities", action(async (req, _res, userId, runtime) => { await runtime.readBrandContext(scope(req, userId)); return options.capabilities(); }));
  app.get("/api/mira-session/references", action(async (req, _res, userId) => options.references ? options.references.list(scope(req, userId)) : []));
  app.post("/api/mira-session/references", action(async (req, _res, userId) => {
    if (!options.references) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Reference upload storage is not connected yet." });
    return options.references.upload(userId, uploadSessionReferenceSchema.parse(req.body));
  }));
  app.get("/api/mira-session/references/:id", action(async (req, res, userId) => {
    if (!options.references) throw new TRPCError({ code: "NOT_FOUND" });
    const { record, bytes } = await options.references.get(scope(req, userId), z.string().uuid().parse(req.params.id));
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.type(record.mime); res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(record.name)}`); res.send(bytes);
  }));
  app.post("/api/mira-session/references/:id/withdraw", action(async (req, _res, userId) => {
    if (!options.references) throw new TRPCError({ code: "NOT_FOUND" });
    await options.references.withdraw(scope(req, userId), z.string().uuid().parse(req.params.id)); return { ok: true };
  }));
  app.post("/api/mira-session/references/:id/analyse", action(async (req, _res, userId) => {
    if (!options.references || !(await options.capabilities()).vision) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Image observation is not enabled yet." });
    return options.references.analyse(scope(req, userId), z.string().uuid().parse(req.params.id));
  }));
  app.post("/api/mira-session/transcribe", action(async (req, res, userId, runtime) => {
    const input = coachConversationInputSchema.extend({ requestId: z.string().uuid(), mime: z.enum(["audio/webm", "audio/mp4", "audio/wav"]), base64: z.string().max(2_800_000) }).strict().parse(req.body);
    const capabilities = await options.capabilities();
    if (!options.audio || !capabilities.voice) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Voice is not enabled for this session yet." });
    if (capabilities.localReview && capabilities.trial && capabilities.trial.remainingRequests < 3) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "This trial has too few requests left for a new voice exchange. Continue with text instead." });
    }
    await runtime.remainingCallMs({ workspaceId: input.workspaceId, conversationId: input.conversationId, userId });
    const text = await options.audio.transcribe(Buffer.from(input.base64, "base64"), input.mime, disconnectSignal(req, res));
    await runtime.remainingCallMs({ workspaceId: input.workspaceId, conversationId: input.conversationId, userId });
    return { text };
  }));
  app.post("/api/mira-session/speak", action(async (req, res, userId, runtime) => {
    const input = coachConversationInputSchema.extend({ requestId: z.string().uuid(), sourceRequestId: z.string().uuid().nullable() }).strict().parse(req.body);
    if (!options.audio || !(await options.capabilities()).voice) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Voice is not enabled for this session yet." });
    const privateScope = { workspaceId: input.workspaceId, conversationId: input.conversationId, userId };
    await runtime.remainingCallMs(privateScope);
    const text = await runtime.readSpokenReply(privateScope, input.sourceRequestId);
    const bytes = await options.audio.speak(text, disconnectSignal(req, res));
    await runtime.remainingCallMs(privateScope);
    res.type("audio/mpeg").send(bytes);
  }));
}
