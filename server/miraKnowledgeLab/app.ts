import express from "express";
import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { createCoachModel, parseCoachReply, CoachModelError, type CoachModelConfig } from "../miraCoach/model";
import { createLiveProviderGate } from "../miraCoach/liveProviderGate";
import { emptyKnowledgeGuidance } from "../../shared/miraKnowledgeRetrieval";
import { coachDraftSchema } from "../../shared/miraCoach";
import { conversationIssues, redactCredentials } from "../miraCoach/conversationRules";
import { clientConstraints } from '../miraCoach/conversationContext';
import { contentHash } from "../miraKnowledge/schema";
import { SCENARIOS, COMPARISON_JOURNEY, protocol, protocolHash, comparisonKey, engineProfiles, paidProposal, labVersionSchema, eligibility, localRetrieve, labMessages, feedbackSchema, feedbackRubric, type LabVersion, type LocalReference } from "./core";

const id = z.string().uuid(), engine = z.enum(["local", "openai"]);
type Turn = { id: string; requestId: string; kind: "retrieval_preview" | "generated_answer"; client: string; at: string; references: LocalReference; state: "preview" | "generating" | "completed" | "failed"; promptMessages: { role: string; content: string }[]; promptHash: string; answer: string | null; error: string | null; usage: unknown; providerResult?: unknown; requestContract?: unknown; durationMs?: number; memoryProposals?: unknown };
type Session = { id: string; createdAt: string; updatedAt: string; configurationId: string; configurationVersion: number; knowledgeHash: string; scenario: typeof SCENARIOS[number] | typeof COMPARISON_JOURNEY; engine: z.infer<typeof engine>; modelProfile: typeof engineProfiles[keyof typeof engineProfiles]; protocol: typeof protocol; protocolHash: string; comparisonKey: string; turns: Turn[]; feedback: (z.infer<typeof feedbackSchema> & { at: string })[] };
const registrySchema = z.object({ format: z.literal("mira-isolated-knowledge-lab-v1"), createdAt: z.string(), authority: z.string(), versions: z.array(labVersionSchema), withdrawnKeys: z.array(z.string()) }).strict();

export function createKnowledgeLabApp(options: { root: string; openaiKey?: string; host?: string; fetcher?: typeof fetch; publicRoot?: string }) {
  const app = express(), root = resolve(options.root), host = options.host ?? "127.0.0.1:5185", origin = `http://${host}`;
  const fetcher = options.fetcher ?? fetch, gate = createLiveProviderGate(root, fetcher);
  let queue = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => { const p = queue.then(fn); queue = p.then(() => {}, () => {}); return p; };
  async function json(file: string) { return JSON.parse(await readFile(join(root, file), "utf8")); }
  async function save(file: string, value: unknown) {
    const path = join(root, file); await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
    const tmp = path + "." + randomUUID() + ".tmp"; await writeFile(tmp, redactCredentials(JSON.stringify(value, null, 2), options.openaiKey) + "\n", { mode: 0o600 }); await rename(tmp, path);
  }
  const sessionFile = (value: string) => `sessions/${id.parse(value)}.json`;
  const readSession = async (value: string): Promise<Session> => json(sessionFile(value));
  async function registry() { return registrySchema.parse(await json("registry.json")); }
  async function selected(configurationId: string, processing: "local" | "openai", hash?: string) {
    const r = await registry(), v = r.versions.find(v => v.id === configurationId);
    if (!v || (hash && hash !== contentHash(v))) throw new Error("This exact knowledge version changed or is unavailable. Start a new session after review.");
    const issues = eligibility(v, processing, new Set(r.withdrawnKeys));
    if (issues.length) throw new Error(issues.join(" "));
    for (const binding of v.artifactBindings) {
      const actual = createHash("sha256").update(await readFile(binding.path)).digest("hex");
      if (actual !== binding.sha256) throw new Error("A source artifact changed. Exact-version review is required before further testing.");
    }
    return { version: v, withdrawn: new Set(r.withdrawnKeys) };
  }
  let localStatus: { ready: boolean; reason: string; checkedAt: string | null } = { ready: false, reason: "Installed local service has not been checked by this test app.", checkedAt: null };
  async function checkLocal() {
    try {
      const res = await fetcher("http://127.0.0.1:11435/api/tags", { signal: AbortSignal.timeout(3500), redirect: "error" });
      if (!res.ok) throw new Error();
      const payload = await res.json(), profile = engineProfiles.local;
      const model = payload.models?.find((m: { name: string; model?: string }) => m.name === profile.model || m.model === profile.model);
      if (!model || ![profile.digest, profile.digest.replace("sha256:", "")].includes(model.digest)) throw new Error();
      localStatus = { ready: true, reason: "Installed local model and digest match the frozen profile.", checkedAt: new Date().toISOString() };
    } catch { localStatus = { ready: false, reason: "The installed Qwen service did not return the expected model/digest in time. Retrieval still works. No paid fallback.", checkedAt: new Date().toISOString() }; }
    return localStatus;
  }
  async function paidStatus(knowledgeHash?: string, sessionId?: string) {
    const status = await gate.status();
    try {
      const approval = await json("lab-paid-approval.json"), provider = await json("provider-approval.json");
      if (!options.openaiKey || approval.approved !== true || approval.protocolHash !== protocolHash || approval.proposalHash !== contentHash(paidProposal)
        || !Array.isArray(approval.allowedKnowledgeHashes) || !approval.allowedKnowledgeHashes.length
        || (knowledgeHash !== undefined && !approval.allowedKnowledgeHashes.includes(knowledgeHash))
        || !Array.isArray(approval.allowedSessionIds) || approval.allowedSessionIds.length !== 2
        || (sessionId !== undefined && !approval.allowedSessionIds.includes(sessionId))
        || approval.comparisonJourneyHash !== contentHash(COMPARISON_JOURNEY)
        || approval.budgetScope !== paidProposal.budgetScope || !Number.isFinite(approval.maximumUsd) || approval.maximumUsd<=0 || approval.maximumUsd > paidProposal.maximumProposedUsd || provider.maxRequests*0.0161>approval.maximumUsd || !approval.actor || Date.parse(approval.expiresAt) <= Date.now()
        || !Number.isFinite(Date.parse(approval.approvedAt)) || Date.parse(approval.approvedAt) > Date.now()
        || Date.parse(approval.expiresAt) <= Date.parse(approval.approvedAt) || Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt) > 7200000
        || approval.expiresAt !== provider.expiresAt || provider.maxRequests > 10 || provider.maxRequestBytes !== 40000 || provider.maxCompletionTokens !== 1800
        || (approval.singleDiagnostic && (provider.maxRequests !== 1 || approval.singleDiagnostic.maximumUsd !== 0.0161))
        || (approval.priorUsageBasedUsd !== undefined && (!Number.isFinite(approval.priorUsageBasedUsd) || approval.priorUsageBasedUsd < 0))
        || JSON.stringify(provider.allowedModels) !== JSON.stringify([engineProfiles.openai.model])) throw new Error();
      return { ...status, authorised: status.state === "active", allowedSessionIds: approval.allowedSessionIds, allowTypedReplies: approval.allowTypedReplies === true, maxTurnsPerSession: approval.maxTurnsPerSession ?? null };
    } catch { return { ...status, authorised: false }; }
  }
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer" });
    if (req.headers.host !== host) return res.status(403).json({ error: "This test app accepts its loopback host only." });
    if (req.method !== "GET" && (req.headers.origin !== origin || !req.is("application/json"))) return res.status(403).json({ error: "Use the local comparison page for changes." });
    next();
  });
  app.use(express.json({ limit: "160kb" }));
  const route = (fn: express.RequestHandler) => (req: express.Request, res: express.Response, next: express.NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
  app.get("/api/state", route(async (_req, res) => {
    const r = await registry();
    const files = await readdir(join(root, "sessions")).catch(() => []);
    const sessions = await Promise.all(files.filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).map(async file => {
      const s: Session = await json("sessions/" + file);
      return { id: s.id, createdAt: s.createdAt, updatedAt: s.updatedAt, configurationId: s.configurationId, knowledgeHash: s.knowledgeHash, scenarioId: s.scenario.id, engine: s.engine, comparisonKey: s.comparisonKey, turns: s.turns.length };
    }));
    res.json({ label: "Isolated local retrieval test — not published MIRA knowledge", versions: r.versions.map(v => ({ id: v.id, version: v.version, label: v.label, parent: v.parent, hash: contentHash(v), itemCount: v.bundle?.items.length ?? 0, sourceTitles: v.bundle?.sources.map(s => s.title) ?? [], issues: eligibility(v, "local", new Set(r.withdrawnKeys)), processing: v.processing, notes: v.notes })), scenarios: [...SCENARIOS, COMPARISON_JOURNEY], comparisonJourney: COMPARISON_JOURNEY, engines: engineProfiles, protocolHash, policyHash: protocol.policyHash, localStatus, paidStatus: await paidStatus(), paidProposal, feedbackRubric, sessions: sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), persistence: ".mira-local-data/knowledge-lab/sessions", pinecone: "Not connected; final Pinecone retrieval is a separate later test." });
  }));
  app.post("/api/local-health", route(async (_req, res) => res.json(await checkLocal())));
  app.post("/api/sessions", route(async (req, res) => {
    const body = z.object({ configurationId: z.string(), scenarioId: z.string(), engine }).strict().parse(req.body);
    const { version } = await selected(body.configurationId, "local");
    const scenario = [...SCENARIOS, COMPARISON_JOURNEY].find(s => s.id === body.scenarioId); if (!scenario) throw new Error("Select an available scenario.");
    const at = new Date().toISOString();
    const s: Session = { id: randomUUID(), createdAt: at, updatedAt: at, configurationId: version.id, configurationVersion: version.version, knowledgeHash: contentHash(version), scenario: structuredClone(scenario), engine: body.engine, modelProfile: engineProfiles[body.engine], protocol: structuredClone(protocol), protocolHash, comparisonKey: comparisonKey(scenario, body.engine), turns: [], feedback: [] };
    await serial(() => save(sessionFile(s.id), s)); res.json(s);
  }));
  app.get("/api/sessions/:id", route(async (req, res) => res.json(await readSession(req.params.id))));
  app.get("/api/sessions/:id/export", route(async (req, res) => {
    const s = await readSession(req.params.id);
    res.setHeader("Content-Disposition", `attachment; filename="mira-local-test-${s.id}.json"`);
    res.json({ label: "Unpublished local comparison; not Pinecone verification", session: s, feedbackRubric, warning: "Includes the saved client messages. Review before sharing; nothing is sent automatically." });
  }));
  app.post("/api/sessions/:id/feedback", route(async (req, res) => {
    const body = feedbackSchema.parse(req.body);
    const s = await serial(async () => {
      const s = await readSession(req.params.id);
      if (body.turnId && !s.turns.some(t => t.id === body.turnId)) throw new Error("Feedback turn not found in this session.");
      const rated = Object.entries(body).some(([key,value]) => key !== "turnId" && key !== "notes" && value !== null);
      if (rated && (!body.turnId || !s.turns.find(t => t.id === body.turnId)?.answer)) throw new Error("Answer-quality scores require a generated answer. Retrieval previews accept notes only.");
      s.feedback.push({ ...body, at: new Date().toISOString() }); s.updatedAt = new Date().toISOString(); await save(sessionFile(s.id), s); return s;
    }); res.json(s);
  }));
  app.post("/api/sessions/:id/turns", route(async (req, res) => {
    const body = z.object({ requestId: id, message: z.string().trim().min(1).max(4000), generate: z.boolean() }).strict().parse(req.body);
    if (redactCredentials(body.message, options.openaiKey) !== body.message) throw new Error("Remove credentials from the message before sending. No model request made.");
    const result = await serial(async () => {
      const s = await readSession(req.params.id);
      const existing = s.turns.find(t => t.requestId === body.requestId);
      if (existing) { if (existing.client !== body.message || (existing.kind === "generated_answer") !== body.generate) throw new Error("Request identifier reused for different input."); return s; }
      if (s.protocolHash !== protocolHash || contentHash(s.protocol) !== protocolHash) throw new Error("The comparison protocol changed. Old sessions remain saved; start a fresh session.");
      if (s.turns.length >= 60) throw new Error("This bounded test session has 60 turns; export it and start a fresh session.");
      const processing = body.generate && s.engine === "openai" ? "openai" : "local";
      const { version, withdrawn } = await selected(s.configurationId, processing, s.knowledgeHash);
      if (body.generate && s.engine === "openai") {
        if (!(await paidStatus(s.knowledgeHash, s.id)).authorised) throw new Error("Paid generation for this exact knowledge version/session is awaiting explicit bounded approval. Retrieval previews cost $0.");
        const approval = await json("lab-paid-approval.json");
        if (approval.singleDiagnostic && (approval.singleDiagnostic.sessionId !== s.id || approval.singleDiagnostic.requestId !== body.requestId || approval.singleDiagnostic.messageHash !== contentHash(body.message))) throw new Error("This approval covers one exact diagnostic request only. No provider request made.");
        const script = [COMPARISON_JOURNEY.opening, ...COMPARISON_JOURNEY.repeatableClientTurns], n = s.turns.filter(t => t.kind === 'generated_answer').length;
        if (!paidProposal.allowedConfigurationIds.includes(s.configurationId) || contentHash(s.scenario) !== contentHash(COMPARISON_JOURNEY) || (approval.allowTypedReplies !== true && body.message !== script[n])) throw new Error("This call is outside the approved comparison. No provider request made.");
        if (approval.maxTurnsPerSession !== undefined && n >= approval.maxTurnsPerSession) throw new Error("This session has completed its approved turns. No provider request made.");
      }
      if (body.generate && s.engine === "local" && !(await checkLocal()).ready) throw new Error(localStatus.reason);
      const history = s.turns.filter(t => t.kind === "generated_answer").flatMap(t => [
        { role: "client" as const, content: t.client },
        ...(t.state === "completed" && t.answer && !conversationIssues(t.answer).length ? [{ role: "assistant" as const, content: t.answer }] : []),
      ]);
      const constraints=clientConstraints([...history,{role:'client',content:body.message}]);
      const references = localRetrieve(version, body.message, processing, withdrawn,history);
      const messages = labMessages({ policy: s.protocol.policy, message: body.message, history, clientInfo: s.scenario.clientInfo, references });
      const turn: Turn = { id: randomUUID(), requestId: body.requestId, client: body.message, kind: body.generate ? "generated_answer" : "retrieval_preview", at: new Date().toISOString(), references, state: body.generate ? "generating" : "preview", promptMessages: messages, promptHash: contentHash(messages), answer: null, error: null, usage: null };
      s.turns.push(turn); s.updatedAt = new Date().toISOString(); await save(sessionFile(s.id), s);
      if (!body.generate) return s;
      const started = Date.now();
      try {
        // Recheck current clearance/withdrawal immediately before dispatch.
        await selected(s.configurationId, processing, s.knowledgeHash);
        const modelConfig: CoachModelConfig = { provider: "openai", apiKey: s.engine === "local" ? "local-adapter-no-external-key" : options.openaiKey!, model: s.modelProfile.model, timeoutMs: 90000, maxCompletionTokens: s.modelProfile.maxCompletionTokens, oneQuestionAtATime: true, emptyInterviewMetadata: true, compactReply:true, separateQuestionField: true, reasoningEffort: s.engine === "openai" ? engineProfiles.openai.reasoningEffort : undefined };
        let modelFetch: typeof fetch;
        if (s.engine === "local") {
          modelFetch = (async (_url, init) => {
            const wire = JSON.parse(init!.body as string);
            const response = await fetcher("http://127.0.0.1:11435/api/chat", { method: "POST", redirect: "error", signal: AbortSignal.timeout(90000), headers: { "content-type": "application/json" }, body: JSON.stringify({ model: engineProfiles.local.model, messages: wire.messages, stream: false, format: wire.response_format.json_schema.schema, options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 1200 }, keep_alive: "5m" }) });
            if (!response.ok) return new Response("", { status: 503 });
            const data = await response.json();
            turn.usage = { localPromptTokens: data.prompt_eval_count ?? null, localOutputTokens: data.eval_count ?? null, providerBilledTokens: 0, providerCostUsd: 0 };
            return new Response(JSON.stringify({ choices: [{ finish_reason: data.done_reason === "stop" ? "stop" : "length", message: { content: data.message?.content } }] }), { headers: { "content-type": "application/json" } });
          }) as typeof fetch;
        } else {
          modelFetch = (async (url, init) => {
            if (Buffer.byteLength(init!.body as string, "utf8") > 40000) throw new Error("Request exceeds the proposed byte budget; no call made.");
            const wire = JSON.parse(init!.body as string);
            turn.requestContract = { model: wire.model, reasoningEffort: wire.reasoning_effort ?? null, maxCompletionTokens: wire.max_completion_tokens, schemaHash: contentHash(wire.response_format), requestBytes: Buffer.byteLength(init!.body as string, "utf8") };
            const response = await gate.fetch(url, init);
            const data = await response.clone().json().catch(() => null);
            // Preserve successful provider output locally so application validation
            // failures can be diagnosed without paying to regenerate lost text.
            // Never retain raw provider error bodies (which can echo credentials).
            if (response.ok && data?.choices) {
              const choice = data.choices[0];
              let validation: unknown = { stage: "json", valid: false };
              try {
                parseCoachReply(modelConfig, JSON.parse(choice?.message?.content),constraints);
                validation = { stage: "wire_schema_coachDraftSchema_and_conversation", valid: true };
              } catch (error) {
                validation = error instanceof z.ZodError ? { stage: "response_schema", valid: false, issues: error.issues.map(i=>({path:i.path,code:i.code})) } : { stage:"conversation_or_json",valid:false, code: error instanceof CoachModelError?error.category:error instanceof Error&&error.message.startsWith('conversation_rules:')?error.message:'invalid_json_or_response' };
              }
              if(choice?.finish_reason==='length')validation={stage:'output_budget',valid:false,code:'output_limit',emptyContent:!choice?.message?.content};
              turn.providerResult = { id: data.id ?? null, model: data.model ?? null, finishReason: choice?.finish_reason ?? null, refused: !!choice?.message?.refusal, content: typeof choice?.message?.content === "string" ? redactCredentials(choice.message.content, options.openaiKey) : null, validation, status: "raw_provider_output_not_approved_answer" };
            }
            const diagnostic = { httpStatus: response.status, providerErrorCode: typeof data?.error?.code === "string" ? data.error.code.slice(0, 100) : null, providerErrorType: typeof data?.error?.type === "string" ? data.error.type.slice(0, 100) : null, finishReason: data?.choices?.[0]?.finish_reason ?? null, providerModel: data?.model ?? null, reasoningTokens: data?.usage?.completion_tokens_details?.reasoning_tokens ?? null };
            const cached = data?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
            turn.usage = data?.usage ? { ...diagnostic, providerPromptTokens: data.usage.prompt_tokens, providerCachedPromptTokens: cached, providerOutputTokens: data.usage.completion_tokens, estimatedCostFromMeasuredTokensUsd: ((data.usage.prompt_tokens - cached) * 0.25 + cached * 0.025 + data.usage.completion_tokens * 2) / 1e6, localModelTokens: 0 } : { ...diagnostic, status: "usage_unknown; reserved provider call may be billable" };
            await save(sessionFile(s.id), s); // Durable diagnostic before adapter validation.
            return response;
          }) as typeof fetch;
        }
        const reply = createCoachModel(modelConfig, modelFetch, () => messages);
        const draft = await reply({ policy: s.protocol.policy, policyVersion: s.protocol.policyVersion, message: body.message, messages: history, evidence: [], guidance: emptyKnowledgeGuidance("disabled", "personal_brand") }) as { response: string; memoryProposals: unknown };
        await selected(s.configurationId, processing, s.knowledgeHash);
        if (redactCredentials(draft.response, options.openaiKey) !== draft.response) throw new Error("credential_in_output");
        turn.answer = draft.response; turn.memoryProposals = draft.memoryProposals; turn.state = "completed";
      } catch (error) { turn.state = "failed"; turn.error = error instanceof CoachModelError&&error.category==='output_limit'?'MIRA reached the fixed output limit without a complete reply. No automatic retry was made.':error instanceof CoachModelError&&error.category==='client_boundary_conflict'?'MIRA proposed a service you excluded. The reply was withheld; no automatic retry was made.':error instanceof Error && error.name === "CoachModelError" ? error.message : "The bounded generation did not complete. No automatic retry or fallback. The saved request may have consumed allowance."; }
      turn.durationMs = Date.now() - started; s.updatedAt = new Date().toISOString(); await save(sessionFile(s.id), s); return s;
    }); res.json(result);
  }));
  const publicRoot = options.publicRoot ?? resolve("server/miraKnowledgeLab/public");
  app.get("/", (_req, res) => res.sendFile(join(publicRoot, "index.html")));
  app.get("/lab.js", (_req, res) => res.sendFile(join(publicRoot, "lab.js")));
  app.get("/lab.css", (_req, res) => res.sendFile(join(publicRoot, "lab.css")));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const safe = error instanceof z.ZodError ? "Invalid test input. Check the fields and limits." : error instanceof Error && !/ENOENT|EACCES|JSON|token|apiKey/i.test(error.message) ? error.message.slice(0, 900) : "This local test record could not be read. Existing data is preserved.";
    res.status(400).json({ error: safe });
  });
  return { app, checkLocal, root };
}
