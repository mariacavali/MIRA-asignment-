import express from "express";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { z } from "zod";
import { createCoachStore } from "../server/miraCoach/store";
import { createCoachRouter } from "../server/miraCoach/router";
import { createCoachWorkflow } from "../server/miraCoach/graph";
import { createCoachModel } from "../server/miraCoach/model";
import { router, protectedProcedure } from "../server/_core/trpc";
import type { TrpcContext } from "../server/_core/context";
import { registerSessionHttp } from "../server/miraCoach/sessionHttp";
import { createReferenceAssets } from "../server/miraCoach/referenceAssets";
import { createPdfExtractor } from "../server/miraKnowledge/pdfExtraction";
import { createReferenceObserver } from "../server/miraCoach/referenceObserver";
import { createSessionAudio } from "../server/miraCoach/audio";
import { createLiveProviderGate } from "../server/miraCoach/liveProviderGate";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";
import { createConfiguredKnowledgeRetriever } from "../server/miraKnowledge/configuredRetrieve";

const root = resolve(".mira-local-data/connected-review"), socket = process.env.MIRA_REVIEW_DB_SOCKET;
if (!socket || !socket.startsWith(root + "/")) throw new Error("A dedicated connected-review database socket is required");
await mkdir(root, { recursive: true, mode: 0o700 });
const admin = await mysql.createConnection({ socketPath: socket, user: "root" });
await admin.query("CREATE DATABASE IF NOT EXISTS mira_connected_review"); await admin.changeUser({ database: "mira_connected_review" });
await admin.query("CREATE TABLE IF NOT EXISTS users (id int PRIMARY KEY)"); await admin.query("INSERT IGNORE INTO users VALUES (1)");
await admin.query("CREATE TABLE IF NOT EXISTS local_review_migrations (name varchar(100) PRIMARY KEY)");
for (const file of ["0019_mira_brand_workspaces.sql", "0020_mira_coach_conversations.sql", "0021_mira_coach_sources.sql", "0022_mira_brand_directions.sql", "0023_mira_knowledge_catalogue.sql", "0024_mira_coach_interviews.sql", "0025_mira_coach_call_clocks.sql"]) {
  const [rows] = await admin.execute<mysql.RowDataPacket[]>("SELECT name FROM local_review_migrations WHERE name=?", [file]);
  if (rows.length) continue;
  const sql = await readFile(resolve("drizzle", file), "utf8");
  for (const statement of sql.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) await admin.query(statement);
  await admin.execute("INSERT INTO local_review_migrations VALUES (?)", [file]);
}
const pool = mysql.createPool({ socketPath: socket, user: "root", database: "mira_connected_review", connectionLimit: 4 }), db = drizzle(pool);
const store = createCoachStore(db, () => new Date(), { interviewEnabled: true, callEnabled: true });
let saved: { workspaceId: number; conversationId: string };
try { saved = z.object({ workspaceId: z.number().int().positive(), conversationId: z.string().uuid() }).parse(JSON.parse(await readFile(join(root, "session.json"), "utf8"))); await store.readBrandContext({ ...saved, userId: 1 }); }
catch {
  const [created] = await admin.execute<mysql.ResultSetHeader>("INSERT INTO mira_brand_workspaces (ownerUserId,name) VALUES (1,'MIRA local review')");
  const workspaceId = created.insertId;
  await admin.execute("INSERT INTO mira_workspace_grants (workspaceId,capability,status,startsAt,sourceReference) VALUES (?,'brand_coaching','active','2026-01-01','local-review-only')", [workspaceId]);
  const conversationId = await store.createConversation(1, workspaceId);
  await store.configureDirection(1, { workspaceId, conversationId, expectedRevision: 0, configuration: { segment: "personal_brand", accessMethod: "standalone_brand", discoveryDepth: "deep", brandStage: "unknown", shootId: null, shootFormat: null } });
  saved = { workspaceId, conversationId }; await writeFile(join(root, "session.json"), JSON.stringify(saved), { mode: 0o600 });
}
await admin.end();
let env: Record<string, string> = {}; try { env = parse(await readFile(resolve(".env"))); } catch {}
const apiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || "", gate = createLiveProviderGate(root);
const model = createCoachModel({ provider: "openai", apiKey: apiKey || "disabled-local-review", model: env.MIRA_COACH_MODEL || "gpt-5-mini", maxCompletionTokens: 1800 }, gate.fetch);
const knowledge = createKnowledgeRepository(db), retrieveGuidance = createConfiguredKnowledgeRetriever({ enabled: true, env, snapshot: () => knowledge.publishedSnapshot() });
const draftReply: typeof model = async input => { if (!apiKey || !await gate.enabled()) throw new Error("Live AI is not enabled"); return model(input); };
const call = createCoachWorkflow({ ...store, draftReply, retrieveGuidance, remainingInterviewMs: store.remainingCallMs }, undefined, { call: true });
const runtime = { ...store, ...createCoachWorkflow({ ...store, draftReply, retrieveGuidance }), runCall: call.run };
const references = createReferenceAssets({ root: join(root, "references"), store, observeImage: async (bytes, mime) => { if (!await gate.imageEnabled()) throw new Error("A live image test is not enabled"); return createReferenceObserver({ apiKey, model: env.MIRA_COACH_MODEL || "gpt-5-mini", fetch: gate.fetch })(bytes, mime); }, extractPdf: createPdfExtractor({ python: resolve(".mira-pdf-venv/bin/python") }) });
const audio = createSessionAudio({ apiKey, fetch: gate.fetch });
const app = express(), cookieName = "mira_connected_review", token = randomBytes(32).toString("hex");
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.headers.host || !["127.0.0.1:5183", "127.0.0.1:5184", "localhost:5183"].includes(req.headers.host)
    || (req.headers.origin && !["http://127.0.0.1:5183", "http://localhost:5183"].includes(req.headers.origin))) { res.status(403).json({ error: "This review is available only on this computer." }); return; }
  next();
});
app.use(express.json({ limit: "16mb" }));
app.get("/api/mira-session/bootstrap", (_req, res) => { res.cookie(cookieName, token, { httpOnly: true, sameSite: "strict", path: "/" }); res.json({ ...saved, localReview: true }); });
const user = { id: 1, openId: "isolated-mira-review", name: "Local MIRA review", email: null, loginMethod: "local-review", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const context = async (req: express.Request, res: express.Response): Promise<TrpcContext> => ({ req, res, user: req.headers.cookie?.split(";").some(value => value.trim() === `${cookieName}=${token}`) ? user : null });
const localRouter = router({ miraCoach: createCoachRouter({ enabled: () => true, runtime: async () => runtime }), auth: router({ me: protectedProcedure.query(({ ctx }) => ctx.user) }) });
app.use("/api/trpc", createExpressMiddleware({ router: localRouter, createContext: ({ req, res }) => context(req, res) }));
registerSessionHttp(app, { context, runtime: async () => runtime, references, audio, capabilities: async () => {
  const trial = await gate.status(), enabled = !!apiKey && trial.state === "active";
  return { localReview: true, text: enabled, vision: enabled && await gate.imageEnabled(), voice: enabled, uploads: true, trial,
    publishedKnowledge: !!(await knowledge.publishedSnapshot()).items.length,
    providerMessage: !apiKey ? "Add an OpenAI key to connect MIRA’s AI."
      : trial.state === "expired" ? "This local trial has expired. Your saved session and remaining call time are preserved."
      : trial.state === "exhausted" ? "This local trial has used its request allowance. Your saved session and remaining call time are preserved."
      : enabled ? "AI is enabled for this bounded local test."
      : "The local services are connected. Live AI and voice are waiting for a bounded test to be enabled." };
} });
app.listen(5184, "127.0.0.1", () => console.log("MIRA connected review API ready on 127.0.0.1:5184; provider requests remain gated."));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void pool.end().finally(() => process.exit(0)); });
