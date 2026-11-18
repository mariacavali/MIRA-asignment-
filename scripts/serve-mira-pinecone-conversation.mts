import express from 'express';
import { readFile, writeFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import mysqlNative from 'mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { parse } from 'dotenv';
import { z } from 'zod';
import { createCoachStore } from '../server/miraCoach/store';
import { createCoachWorkflow } from '../server/miraCoach/graph';
import { createCoachModel, CoachModelError, coachReplyWireSchema, type CoachModelConfig } from '../server/miraCoach/model';
import { createKnowledgeRepository } from '../server/miraKnowledge/repository';
import { createConfiguredKnowledgeRetriever } from '../server/miraKnowledge/configuredRetrieve';
import { preparePineconeSeedPlan, pineconeTarget } from '../server/miraKnowledge/pineconePlan';
import { contentHash } from '../server/miraKnowledge/schema';
import { groundTestReplyRequest } from '../server/miraCoach/testReplyGrounding';
import { interactiveReplyInstructions, isRecoverableTestReplyFailure, unsupportedTestReplyDetails } from '../server/miraCoach/testReplySupport';
import { coachDraftSchema } from '../shared/miraCoach';

const work = resolve('../brands/mira/work/2026-11_conversation-and-library');
const seedWork = resolve('../brands/mira/work/2026-11_pinecone-readiness');
const root = resolve('.mira-local-data/pinecone-conversation');
const state = resolve('.mira-local-data/pinecone-nine-entry-test');
const database = 'mira_pinecone_nine_entry_test';
const host = '127.0.0.1:5188';
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const hashFile = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const atomic = async (path: string, value: unknown) => {
  const handle = await open(path + '.tmp', 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(path + '.tmp', path);
};
const measuredOrReservedUsd = (attempts: any[]) => Math.round(attempts
  .filter(attempt => attempt.type === 'generation')
  .reduce((sum, attempt) => sum + (typeof attempt.tokenDerivedUsd === 'number' ? attempt.tokenDerivedUsd : 0.0161), 0) * 1000000) / 1000000;
await mkdir(root, { recursive: true, mode: 0o700 });
await mkdir(work, { recursive: true });
const seed = await json(join(seedWork, 'release-and-seed-plan.json'));
const receipt = await json(join(seedWork, 'seed-receipt.json'));
let qualityRetestConfig: any = null, interactiveSessionConfig: any = null;
try {
  const candidate = await json(join(work, 'interactive-session-proposal.json'));
  if (['prepared_pending_approval', 'approved'].includes(candidate.status)) interactiveSessionConfig = candidate;
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
try {
  const candidate = await json(join(work, 'live-quality-retest-proposal.json'));
  if (!interactiveSessionConfig && ['approved_for_one_request', 'completed'].includes(candidate.status)) qualityRetestConfig = candidate;
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const retestMode = Boolean(qualityRetestConfig);
const interactiveMode = Boolean(interactiveSessionConfig);
if (!receipt.recordsVerified || !receipt.searchVerified || receipt.records !== 9) throw new Error('Exact existing seed verification required.');
const env = parse(await readFile(resolve('.env'), 'utf8'));
const target = pineconeTarget({ PINECONE_INDEX_HOST: env.PINECONE_INDEX_HOST, PINECONE_NAMESPACE: 'mira-nine-entry-test' });
const admin = await mysql.createConnection({ socketPath: join(state, 'db.sock'), user: 'root', database });
// Only conversation tables are added to this existing isolated database. The
// knowledge catalogue and its release/review/publication state are not edited.
await admin.query('CREATE TABLE IF NOT EXISTS users (id int PRIMARY KEY)');
await admin.query('INSERT IGNORE INTO users VALUES (1)');
await admin.query('CREATE TABLE IF NOT EXISTS pinecone_conversation_migrations (name varchar(100) PRIMARY KEY)');
for (const file of ['0019_mira_brand_workspaces.sql', '0020_mira_coach_conversations.sql', '0021_mira_coach_sources.sql',
  '0022_mira_brand_directions.sql', '0024_mira_coach_interviews.sql', '0025_mira_coach_call_clocks.sql']) {
  const [rows]: any = await admin.execute('SELECT name FROM pinecone_conversation_migrations WHERE name=?', [file]);
  if (rows.length) continue;
  for (const statement of (await readFile(resolve('drizzle', file), 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await admin.query(statement);
  await admin.execute('INSERT INTO pinecone_conversation_migrations VALUES (?)', [file]);
}
const pool = mysqlNative.createPool({ socketPath: join(state, 'db.sock'), user: 'root', database, connectionLimit: 4 });
const db = drizzle(pool), knowledge = createKnowledgeRepository(db);
const store = createCoachStore(db, () => new Date(), { interviewEnabled: true, callEnabled: false });
async function boundSnapshot() {
  const snapshot = await knowledge.publishedSnapshot(), plan = preparePineconeSeedPlan(snapshot, target);
  if (snapshot.releaseId !== seed.releaseId || snapshot.hash !== seed.bundleHash || snapshot.items.length !== 9
    || plan.preview.target.namespace !== receipt.namespace || plan.preview.fingerprint !== receipt.fingerprint
    || contentHash(plan.documents) !== contentHash(seed.plan.documents)) throw new Error('The exact seeded baseline binding changed.');
  return snapshot;
}
await boundSnapshot();
async function newSession(name: string) {
  const [created]: any = await admin.execute('INSERT INTO mira_brand_workspaces (ownerUserId,name) VALUES (1,?)', [name]);
  const workspaceId = created.insertId;
  await admin.execute("INSERT INTO mira_workspace_grants (workspaceId,capability,status,startsAt,sourceReference) VALUES (?,'brand_coaching','active','2026-01-01','isolated-pinecone-text-test')", [workspaceId]);
  const conversationId = await store.createConversation(1, workspaceId);
  await store.configureDirection(1, { workspaceId, conversationId, expectedRevision: 0, configuration: {
    segment: 'personal_brand', accessMethod: 'standalone_brand', discoveryDepth: 'deep', brandStage: 'unknown', shootId: null, shootFormat: null } });
  return { userId: 1, workspaceId, conversationId };
}
const sessionPath = join(root, interactiveMode ? 'interactive-session.json' : retestMode ? 'quality-retest-session.json' : 'session.json');
let session: Awaited<ReturnType<typeof newSession>>;
try { session = await json(sessionPath); await store.readBrandContext(session); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  session = await newSession(interactiveMode ? 'MIRA approved interactive test — isolated' : retestMode ? 'MIRA reply-support live retest — isolated' : 'Prepared Pinecone conversation — synthetic test');
  await atomic(sessionPath, session); }
const messages: string[] = interactiveMode ? [] : retestMode ? [qualityRetestConfig.testMessage]
  : (await json(join(seedWork, 'retrieval-probes.json'))).coach.map((p: any) => p.message);
const transcriptJsonPath = join(work, interactiveMode ? 'interactive-session-transcript.json' : retestMode ? 'live-quality-retest-transcript.json' : 'conversation-transcript.json');
const transcriptMarkdownPath = join(work, interactiveMode ? 'interactive-session-transcript.md' : retestMode ? 'live-quality-retest-transcript.md' : 'conversation-transcript.md');
const requestIds: string[] = [];
const requestIdsPath = join(root, interactiveMode ? 'interactive-session-request-ids.json' : retestMode ? 'quality-retest-request-ids.json' : 'request-ids.json');
try { requestIds.push(...await json(requestIdsPath)); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; requestIds.push(...messages.map(() => randomUUID())); await atomic(requestIdsPath, requestIds); }
const modelConfig: CoachModelConfig = { provider: 'openai', apiKey: env.OPENAI_API_KEY || 'generation-disabled', model: 'gpt-5-mini-2025-08-07',
  reasoningEffort: 'low', maxCompletionTokens: 1800, timeoutMs: 60000, oneQuestionAtATime: true, separateQuestionField: true };
const wireSchema = z.toJSONSchema(coachReplyWireSchema(modelConfig));
const schemaObjects: string[] = [];
function inspectWire(value: any, path = '$') {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object') {
    if (value.additionalProperties !== false || Object.keys(value.properties ?? {}).some(key => !value.required?.includes(key))) throw new Error('Full coach strict schema is incompatible.');
    schemaObjects.push(path);
  }
  for (const [key, child] of Object.entries(value)) if (Array.isArray(child)) child.forEach((entry, i) => inspectWire(entry, `${path}.${key}[${i}]`));
  else if (child && typeof child === 'object') inspectWire(child, `${path}.${key}`);
}
inspectWire(wireSchema);
await atomic(join(work, 'strict-schema-preflight.json'), { at: new Date().toISOString(), passed: true, objectPaths: schemaObjects,
  allObjectPropertiesRequired: true, additionalPropertiesDisabled: true, fullMemoryAndInterviewFieldsRetained: true, providerCalls: 0 });
const codeBindings: Record<string, string> = {};
for (const path of ['scripts/serve-mira-pinecone-conversation.mts', 'scripts/start-mira-pinecone-conversation.py',
  'server/miraCoach/graph.ts', 'server/miraCoach/model.ts', 'server/miraCoach/store.ts', 'server/miraCoach/policy.ts',
  'server/miraCoach/questionPlanner.ts', 'server/miraCoach/conversationContext.ts', 'server/miraCoach/conversationRules.ts',
  'server/miraKnowledge/configuredRetrieve.ts', 'server/miraKnowledge/pineconeRetrieve.ts', 'server/miraKnowledge/pineconePlan.ts',
  'server/miraKnowledge/pineconeClient.ts', 'server/miraKnowledge/repository.ts', 'shared/miraKnowledgeRetrieval.ts', 'shared/miraCoach.ts',
  'server/miraCoach/testReplyGrounding.ts', 'server/miraCoach/testReplySupport.ts']) codeBindings[path] = await hashFile(resolve(path));
const priorGenerationAttempts = interactiveMode ? interactiveSessionConfig.priorGenerationRequests : retestMode ? 7 : 6;
const priorPineconeSearches = interactiveMode ? interactiveSessionConfig.priorPineconeSearches : retestMode ? 7 : 6;
const priorTokenDerivedUsd = interactiveMode ? interactiveSessionConfig.priorTokenDerivedUsd : retestMode ? 0.019357 : 0.01485925;
const maxGenerationRequests = priorGenerationAttempts + (interactiveMode ? interactiveSessionConfig.additionalGenerationRequests : 1);
const maxPineconeReadRequests = priorPineconeSearches + (interactiveMode ? interactiveSessionConfig.additionalPineconeSearches : 1);
const maxAdditionalGenerationUsd = interactiveMode ? interactiveSessionConfig.maximumAdditionalGenerationUsd : 0.0161;
const maxTotalGenerationUsd = interactiveMode ? interactiveSessionConfig.maximumTotalGenerationUsd : 0.09;
const proposal = { scope: interactiveMode ? interactiveSessionConfig.scope : retestMode ? qualityRetestConfig.scope : 'mira-pinecone-five-turn-recovery-v2',
  interactive: interactiveMode, session, releaseId: seed.releaseId, bundleHash: seed.bundleHash,
  namespace: receipt.namespace, seedPacketHash: seed.packetHash, seededRecords: 9, messages, requestIds, codeBindings,
  model: modelConfig.model, reasoningEffort: 'low', maxCompletionTokens: 1800,
  replyContract: 'When key information is missing, ask one relevant clarification instead of guessing. Label optional ideas as suggestions. Keep suggestions out of client memory. Recover from validation rejections with clear user feedback and no automatic retry.',
  limits: { maxGenerationRequests, maxPineconeReadRequests, remainingGenerationAttempts: interactiveMode ? interactiveSessionConfig.additionalGenerationRequests : 1, priorGenerationAttempts, priorPineconeSearches,
    maxUploadRequests: 0, maxRequestBytes: 40000, inputTokenReservePerRequest: 50000, reservedCostPerAttemptUsd: 0.0161,
    conservativeRemainingReserveUsd: maxAdditionalGenerationUsd, priorTokenDerivedUsd,
    conservativeCumulativeUsd: priorTokenDerivedUsd + maxAdditionalGenerationUsd,
    maxAdditionalGenerationUsd, maxTotalGenerationUsd,
    monetaryScope: interactiveMode ? `${interactiveSessionConfig.additionalGenerationRequests} requests maximum, reserved at $0.0161 each; no more than $${maxAdditionalGenerationUsd.toFixed(4)} additional, within the $${maxTotalGenerationUsd.toFixed(2)} total cap.` : 'One request reserved at $0.0161, with cumulative exposure capped at $0.09 including all prior attempts.', maxDurationMinutes: 120 },
  pricing: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2, source: 'https://developers.openai.com/api/docs/models/gpt-5-mini',
    note: 'Conservative reserve is an estimate, not measured tokens. The exact model is marked deprecated; no automatic replacement.' },
  criteria: interactiveMode ? ['Interactive client messages ask for clarification when material facts are missing.',
    'Optional ideas are explicitly labeled and are not proposed as client memory.',
    'Validation rejection returns a recoverable, actionable message without an automatic retry.',
    'The exact existing release and namespace are used; no source or seed changes.']
    : retestMode ? ['One client message runs once through the real coach graph, or stops on validation failure.',
    'Unsupported offer lengths, invented audience examples and fabricated cases are withheld by the local support guard.',
    'Interview metadata is relevant to the current message.', 'The saved turn records the exact active release and selected item versions.',
    'No retry occurs; the existing five-turn baseline remains preserved.']
    : ['All five client turns complete and persist through the real coach graph.', 'Every turn records the exact active release and selected item versions.',
    'Discovery excludes visual/shoot guidance; the visual turn uses it.', 'Channel-management exclusion is respected in replies and later context.',
    'The unsupported sales forecast receives no invented reliable percentage.', 'Reload returns the saved messages; duplicate completed request IDs do not charge again.'],
  notIncluded: ['Voice, uploads, timer/call mode, Brand Book generation, source additions, publishing and production activation.'],
  approved: false, automaticRetries: false, modelSubstitution: false };
const proposalHash = contentHash(proposal);
await atomic(join(work, 'conversation-proposal.json'), { ...proposal, proposalHash });
const approvalSchema = z.object({ scope: z.literal(proposal.scope), approved: z.literal(true), proposalHash: z.literal(proposalHash),
  approvedAt: z.string().datetime(), expiresAt: z.string().datetime(), maxGenerationRequests: z.literal(maxGenerationRequests), maxPineconeReadRequests: z.literal(maxPineconeReadRequests),
  manuallyContinueAfterValidatedFix: z.literal(true), maximumAdditionalGenerationUsd: z.literal(maxAdditionalGenerationUsd), maximumAdditionalPineconeUsd: z.literal(0) }).strict();
const emptyLedger = () => ({ proposalHash, generationRequests: 0, pineconeReads: 0, reservedUsd: 0, attempts: [] as any[], stopped: false, completed: false });
// Carry forward the exact stopped run, without resetting counts, receipts or
// granting permission to continue. An explicit new approval is still required.
try {
  const previous = await json(join(root, 'usage.json'));
  if (previous.proposalHash !== proposalHash) {
    const firstStoppedRun = previous.proposalHash === '7f6e34b907d819f5b44099732f5c5f45d36e99bbf194c3d60de199da725043c6'
      && previous.generationRequests === 2 && previous.pineconeReads === 2;
    const oneValidatedRepairRun = previous.proposalHash === 'e7832e1fcb08334ce1f996354cba4cffa9c9bef1fa6c9a200b016911b95c6fb7'
      && previous.generationRequests === 5 && previous.pineconeReads === 5;
    const awaitingFinalTurn = previous.proposalHash === '2b45d73eaa68827fe8a398371b9a8e2d19a4d072859ea47fae14bbb4104b79ef'
      && previous.generationRequests === 6 && previous.pineconeReads === 6;
    const completedFiveTurnBaseline = previous.proposalHash === 'e04d391d24296efb08eacfc3795998d39e563dfccbfbfb15bf27dec83ca42851'
      && previous.generationRequests === 7 && previous.pineconeReads === 7 && previous.completed && previous.stopped;
    const completedLiveRetest = retestMode && previous.proposalHash === 'dc6d1f05810c1b7a29df760df29ceb8c34b10051e8f2ca0d573809076a5a1d78'
      && previous.generationRequests === 8 && previous.pineconeReads === 8 && previous.completed && previous.stopped;
    const completedInteractiveBaseline = interactiveMode && previous.proposalHash === interactiveSessionConfig.priorProposalHash
      && previous.generationRequests === interactiveSessionConfig.priorGenerationRequests
      && previous.pineconeReads === interactiveSessionConfig.priorPineconeSearches && previous.completed && previous.stopped;
    const preparedInteractivePending = interactiveMode && previous.proposalHash === 'e5e1b7b80831db9312156ebe4ac53ca538ca7bf3aad4f268819f7285715f78d7'
      && previous.generationRequests === interactiveSessionConfig.priorGenerationRequests
      && previous.pineconeReads === interactiveSessionConfig.priorPineconeSearches && !previous.completed && previous.stopped;
    const completedRun = previous.proposalHash === 'e791fec219e8610f979f26add9679a1662fa1e9884adbe4d5a57fa455bea9ece'
      && previous.generationRequests === 7 && previous.pineconeReads === 7 && previous.completed;
    const knownPrevious = firstStoppedRun || oneValidatedRepairRun || awaitingFinalTurn || completedFiveTurnBaseline || completedLiveRetest || completedInteractiveBaseline || preparedInteractivePending || completedRun;
    if (!knownPrevious || (!previous.stopped && !completedRun) || (previous.completed && !completedRun && !completedFiveTurnBaseline && !completedLiveRetest && !completedInteractiveBaseline)) throw new Error('Unexpected prior usage; inspect without resetting it.');
    await atomic(join(root, 'usage.json'), { ...previous, proposalHash, previousProposalHash: previous.proposalHash,
      ...(interactiveMode && (completedInteractiveBaseline || preparedInteractivePending) ? { stopped: false, completed: false } : {}),
      ...(retestMode && completedFiveTurnBaseline ? { stopped: true, completed: false } : {}),
      reservedUsd: measuredOrReservedUsd(previous.attempts),
      preparationNote: 'Local reply-support and interview-area guards prepared; prior requests and receipts preserved; any stopped/completed state remains unchanged.' });
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
let queue = Promise.resolve();
async function ledger() { try { const value = await json(join(root, 'usage.json')); if (value.proposalHash !== proposalHash) throw new Error('Conversation proposal changed with existing usage.'); return value; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyLedger(); throw error; } }
async function approval() {
  let raw: unknown;
  try { raw = await json(join(root, 'generation-approval.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('generation_approval_missing'); throw new Error('generation_approval_unreadable'); }
  const parsed = approvalSchema.safeParse(raw);
  if (!parsed.success) throw new Error('generation_approval_invalid_or_different_proposal');
  const value = parsed.data;
  const now = Date.now();
  if (Date.parse(value.approvedAt) > now || Date.parse(value.expiresAt) <= now || Date.parse(value.expiresAt) - Date.parse(value.approvedAt) > 120 * 60000) throw new Error('generation_approval_expired_or_invalid_window');
  for (const [path, hash] of Object.entries(codeBindings)) if (await hashFile(resolve(path)) !== hash) throw new Error('generation_code_binding_changed');
  await boundSnapshot();
  return value;
}
function usageNumbers(value: any) {
  return { inputTokens: typeof value?.prompt_tokens === 'number' ? value.prompt_tokens : null,
    outputTokens: typeof value?.completion_tokens === 'number' ? value.completion_tokens : null,
    reasoningTokens: typeof value?.completion_tokens_details?.reasoning_tokens === 'number' ? value.completion_tokens_details.reasoning_tokens : null };
}
const guardedFetch: typeof fetch = async (input, init) => {
  await approval(); const record = await ledger();
  if (record.stopped || record.completed) throw new Error('This generation test is closed.');
  const url = new URL(input instanceof Request ? input.url : String(input));
  const openai = url.origin === 'https://api.openai.com' && url.pathname === '/v1/chat/completions';
  const pinecone = url.origin === target.host && url.pathname === `/namespaces/${receipt.namespace}/documents/search`;
  if (init?.method !== 'POST' || (!openai && !pinecone) || typeof init.body !== 'string') throw new Error('Unapproved test transport.');
  const body = JSON.parse(init.body);
  let sentBody = init.body;
  if (openai) {
    const message = body.messages.at(-1)?.content;
    if (typeof message !== 'string') throw new Error('Current client message required.');
    const [interview, context] = await Promise.all([store.readInterview(session), store.readBrandContext(session)]);
    const confirmedMemoryIds = context.evidence.filter(item => item.confirmed && !item.provenance).map(item => item.id);
    sentBody = JSON.stringify(groundTestReplyRequest(body, message, interview.coverage?.areas ?? [], confirmedMemoryIds, { interactive: interactiveMode }));
  }
  const liability = record.attempts.filter((attempt: any) => attempt.type === 'generation')
    .reduce((sum: number, attempt: any) => sum + (typeof attempt.tokenDerivedUsd === 'number' ? attempt.tokenDerivedUsd : 0.0161), 0);
  const continuationLiability = record.attempts.filter((attempt: any) => attempt.type === 'generation')
    .slice(proposal.limits.priorGenerationAttempts)
    .reduce((sum: number, attempt: any) => sum + (typeof attempt.tokenDerivedUsd === 'number' ? attempt.tokenDerivedUsd : 0.0161), 0);
  if (openai && (body.model !== proposal.model || body.reasoning_effort !== 'low' || body.max_completion_tokens !== 1800
    || Buffer.byteLength(sentBody) > proposal.limits.maxRequestBytes || record.generationRequests >= proposal.limits.maxGenerationRequests
    || liability + 0.0161 > proposal.limits.maxTotalGenerationUsd
    || continuationLiability + 0.0161 > proposal.limits.maxAdditionalGenerationUsd)) throw new Error('Approved generation cap exceeded.');
  if (pinecone && record.pineconeReads >= proposal.limits.maxPineconeReadRequests) throw new Error('Approved Pinecone read cap exceeded.');
  const attempt: any = { type: openai ? 'generation' : 'pinecone_search', at: new Date().toISOString(), state: 'dispatching', usage: null };
  if (openai) record.generationRequests++;
  else record.pineconeReads++;
  record.attempts.push(attempt); record.reservedUsd = measuredOrReservedUsd(record.attempts); await atomic(join(root, 'usage.json'), record);
  try {
    const response = await fetch(input, { ...init, body: sentBody, redirect: 'error' });
    const bytes = await response.arrayBuffer(); if (bytes.byteLength > 1000000) throw new Error('Provider response too large.');
    let raw: any = null; try { raw = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch {}
    attempt.state = response.ok ? 'response_received' : 'provider_error'; attempt.httpStatus = response.status;
    attempt.usage = openai ? usageNumbers(raw?.usage) : raw?.usage ? Object.fromEntries(Object.entries(raw.usage).filter(([, value]) => typeof value === 'number')) : null;
    if (openai && raw?.choices?.[0]?.finish_reason) attempt.finishReason = raw.choices[0].finish_reason;
    if (openai && typeof raw?.choices?.[0]?.message?.content === 'string') attempt.unacceptedProviderText = raw.choices[0].message.content;
    if (openai && attempt.usage?.inputTokens !== null && attempt.usage?.outputTokens !== null) attempt.tokenDerivedUsd =
      (attempt.usage.inputTokens * .25 + attempt.usage.outputTokens * 2) / 1000000;
    record.reservedUsd = measuredOrReservedUsd(record.attempts);
    if (!response.ok) record.stopped = true;
    await atomic(join(root, 'usage.json'), record);
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch { attempt.state = 'uncertain'; record.stopped = true; await atomic(join(root, 'usage.json'), record); throw new Error('Provider attempt unconfirmed; no retry.'); }
};
const retrieval = createConfiguredKnowledgeRetriever({ enabled: true, env: { ...env, PINECONE_NAMESPACE: target.namespace,
  MIRA_COACH_KNOWLEDGE_BACKEND: 'pinecone', MIRA_PINECONE_READ_ENABLED: 'true', MIRA_COACH_KNOWLEDGE_LANGUAGE: 'en' },
  snapshot: boundSnapshot, fetcher: guardedFetch });
const model = createCoachModel(modelConfig, guardedFetch);
const workflow = createCoachWorkflow({ ...store,
  retrieveGuidance: async input => { const guidance = await retrieval(input); if (guidance.status === 'unavailable' || guidance.releaseId !== seed.releaseId) throw new Error('Bound Pinecone guidance unavailable.'); return guidance; },
  draftReply: async input => {
    const interactiveGuidance = '\n' + interactiveReplyInstructions;
    const standardGrounding = '\nFor this text test, keep the response concise, aiming for 80–120 words, and preserve the normal evidence and interview fields. Give general options without inventing an offer format, duration, target niche, sample size, guaranteed outcome, case study, testimonial or performance result. Never suggest a synthesized or fictional case for public-facing brand content. Treat unconfirmed model ideas as tentative and do not repeat them as established direction. Ask about the supplied situation before prescribing a new offer. Keep the one optional question separate. Interview metadata: use only areas allowed by the exact current schema. Leave state observations empty for unmentioned areas. Never put the same area in interviewStates and interviewProposals. Quote only the current client message, never history or placeholder text. A proposal may point only to an actually supplied confirmed memory or a valid zero-based entry in this reply memoryProposals; do not map your own invented advice as client evidence.';
    const draft = coachDraftSchema.parse(await model({ ...input, policy: input.policy + (interactiveMode ? interactiveGuidance : '') + standardGrounding }));
    const sourceTexts = [...input.messages.filter(message => message.role === 'client').map(message => message.content), input.message,
      ...input.evidence.filter(item => item.confirmed && !item.provenance).map(item => item.text)];
    const issues = unsupportedTestReplyDetails(draft, sourceTexts);
    if (issues.length) throw new Error(`Unsupported test reply details: ${issues.join(', ')}`);
    return draft;
  },
});
async function current() {
  const context = await store.readBrandContext(session), usage = await ledger();
  const [rows]: any = await admin.execute("SELECT requestId,result FROM mira_coach_turns WHERE conversationId=? AND status='complete' ORDER BY expectedRevision", [session.conversationId]);
  const turns = rows.map((r: any) => ({ requestId: r.requestId, result: typeof r.result === 'string' ? JSON.parse(r.result) : r.result }));
  const requestLimitReached = usage.generationRequests >= proposal.limits.maxGenerationRequests
    || usage.pineconeReads >= proposal.limits.maxPineconeReadRequests;
  let approved = false, blocker: string | null = null;
  try { await approval(); approved = !usage.stopped && !usage.completed && !requestLimitReached; } catch (error) {
    blocker = error instanceof Error && /^(generation_)/.test(error.message) ? error.message : 'seeded_release_binding_unavailable';
  }
  if (requestLimitReached) blocker = 'approved_request_limit_reached';
  else if (interactiveMode && !approved && !usage.completed) blocker = 'interactive_approval_required';
  else if (usage.stopped) blocker = 'prior_attempt_failed_test_stopped';
  if (usage.completed) blocker = interactiveMode ? 'interactive_session_limit_reached' : messages.length === 1 ? 'one_turn_retest_complete' : 'conversation_complete';
  await boundSnapshot();
  return { binding: { releaseId: seed.releaseId, namespace: receipt.namespace, bundleHash: seed.bundleHash, records: 9, verified: true },
    proposal: { ...proposal, proposalHash, codeBindings: undefined }, session, messages: context.messages, turns,
    generation: { approved, blocker, requests: usage.generationRequests, pineconeReads: usage.pineconeReads,
      generationRequestsRemaining: Math.max(0, proposal.limits.maxGenerationRequests - usage.generationRequests),
      pineconeSearchesRemaining: Math.max(0, proposal.limits.maxPineconeReadRequests - usage.pineconeReads),
      stopped: usage.stopped, completed: usage.completed,
      tokenDerivedUsd: usage.attempts.reduce((sum: number, a: any) => sum + (a.tokenDerivedUsd ?? 0), 0) },
    nextClientMessage: turns.length < messages.length ? messages[turns.length] : null, nextTurn: turns.length, paidGenerationPerformed: usage.generationRequests > 0 };
}
async function saveTranscript() {
  const status = await current();
  const transcript = { at: new Date().toISOString(), conversationId: session.conversationId, binding: status.binding,
    generation: status.generation, successfulReplies: status.turns.length, complete: interactiveMode ? status.generation.completed : status.turns.length === messages.length,
    mock: false, initialOpeningIsGeneratedReply: false, messages: status.messages, turns: status.turns };
  await atomic(transcriptJsonPath, transcript);
  const lines = ['# MIRA Pinecone conversation transcript', '', `Conversation: ${session.conversationId}`,
    `Release: ${seed.releaseId}`, `Namespace: ${receipt.namespace}`, `Successfully saved replies: ${status.turns.length} / ${messages.length}`,
    `Generation state: ${status.generation.blocker ?? 'authorised'}`, '',
    'The initial MIRA opening is application-provided. Only completed SQL turns count as generated replies.', ''];
  for (const message of status.messages) lines.push(`**${message.role === 'client' ? 'Client' : 'MIRA'}**`, '', message.content, '');
  await writeFile(transcriptMarkdownPath, lines.join('\n') + '\n', { mode: 0o600 });
  return transcript;
}
// Validate the real graph + SQL persistence using a separate, clearly labelled
// synthetic conversation and mocked provider transports. The review session
// stays empty; this cannot count as a successful paid/end-to-end conversation.
const mockSessionPath = join(root, 'mock-check.json');
try { await readFile(mockSessionPath); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  const mockSession = await newSession('MOCK ONLY — graph and SQL connection check');
  const snapshot = await boundSnapshot(), plan = preparePineconeSeedPlan(snapshot, target);
  let searchCalls = 0, modelCalls = 0;
  const fakeFetch: typeof fetch = async () => { searchCalls++; return Response.json({ namespace: receipt.namespace,
    matches: plan.documents.map(document => ({ ...document, _score: .85 })), usage: {} }); };
  const mockRetrieval = createConfiguredKnowledgeRetriever({ enabled: true, env: { MIRA_COACH_KNOWLEDGE_BACKEND: 'pinecone',
    MIRA_PINECONE_READ_ENABLED: 'true', PINECONE_INDEX_HOST: target.host, PINECONE_NAMESPACE: target.namespace, PINECONE_API_KEY: 'mock' }, snapshot: boundSnapshot, fetcher: fakeFetch });
  const mockGraph = createCoachWorkflow({ ...store, retrieveGuidance: mockRetrieval, draftReply: async () => {
    modelCalls++; return { response: 'Mock transport check only. No generated client advice.', memoryProposals: [], interviewProposals: [], interviewStates: [] }; } });
  const checks = [];
  for (const message of messages) {
    const input = { ...mockSession, requestId: randomUUID(), message };
    const { userId, ...turnInput } = input;
    const result = await mockGraph.run(userId, turnInput);
    const before = { searchCalls, modelCalls };
    const duplicate = await mockGraph.run(userId, turnInput);
    if (contentHash(result) !== contentHash(duplicate) || before.searchCalls !== searchCalls || before.modelCalls !== modelCalls
      || result.knowledgeTrace?.releaseId !== seed.releaseId) throw new Error('Mock graph persistence/idempotency check failed.');
    checks.push({ releaseId: result.knowledgeTrace?.releaseId, status: result.knowledgeTrace?.status,
      selected: result.knowledgeTrace?.selected, interviewPlannerUsed: !!result.interviewPlan, duplicateSkippedProviders: true });
  }
  const reloaded = await store.readBrandContext(mockSession);
  const [mockTurns]: any = await admin.execute("SELECT COUNT(*) AS count FROM mira_coach_turns WHERE conversationId=? AND status='complete'", [mockSession.conversationId]);
  const [realTurns]: any = await admin.execute("SELECT COUNT(*) AS count FROM mira_coach_turns WHERE conversationId=? AND status='complete'", [session.conversationId]);
  // The real coach supplies an opening prompt before the first client answer;
  // it is not a generated reply or a completed paid turn.
  if (mockTurns[0].count !== messages.length || reloaded.messages.filter(message => message.role === 'client').length !== messages.length || realTurns[0].count !== 0) throw new Error('Mock session isolation failed.');
  const value = { at: new Date().toISOString(), mockOnly: true, paidConversationTestPassed: false, checks, sqlMessagesReloaded: reloaded.messages.length,
    realConversationCompletedTurns: 0, realConversationInitialOpeningOnly: true, mockedSearches: searchCalls, mockedModels: modelCalls, realNetworkRequests: 0 };
  await atomic(mockSessionPath, value); await atomic(join(work, 'graph-sql-mock-verification.json'), value);
}
await atomic(join(work, 'app-binding-verification.json'), { at: new Date().toISOString(), ...await current(),
  oldLab: { url: 'http://127.0.0.1:5187', usesPinecone: false, status: 'Do not use the lexical lab to claim this seeded-path test.' },
  comparisonScope: interactiveMode ? 'Bounded interactive text session awaiting explicit generation budget approval.'
    : retestMode ? 'One approved reply-support validation turn through the existing text coach graph.' : 'Five-turn conversation through the existing text coach graph.' });
await saveTranscript();
const app = express(), cookieName = 'mira_pinecone_text_test', token = randomBytes(32).toString('hex');
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.status(403).json({ error: 'Loopback test only.' }); return; } next(); });
app.use(express.json({ limit: '8kb' }));
app.get('/', (_req, res) => { res.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', path: '/' }); res.sendFile(join(work, 'conversation-test.html')); });
app.get('/book-checklist', (_req, res) => res.sendFile(join(work, 'per-book-checklist.html')));
app.use('/api', (req, res, next) => { if (!req.headers.cookie?.split(';').some(v => v.trim() === `${cookieName}=${token}`)) { res.status(401).json({ error: 'Open the local test page first.' }); return; } next(); });
app.get('/api/status', async (_req, res) => { try { res.json(await current()); } catch { res.status(503).json({ error: 'Exact seeded baseline binding unavailable.' }); } });
app.get('/api/transcript.json', async (_req, res) => { try { res.json(await saveTranscript()); } catch { res.status(503).json({ error: 'Saved transcript unavailable.' }); } });
app.get('/api/transcript.md', async (_req, res) => { try { await saveTranscript(); res.type('text/markdown').send(await readFile(transcriptMarkdownPath, 'utf8')); } catch { res.status(503).json({ error: 'Saved transcript unavailable.' }); } });
class RecoverableReplyValidationError extends Error {
  readonly status = 422; readonly code = 'reply_validation_rejected'; readonly recoverable = true;
  constructor(message: string, readonly requestsRemaining: number) { super(message); }
}
app.post('/api/turn', (req, res) => {
  const run = queue.then(async () => {
    const input: any = interactiveMode
      ? z.object({ message: z.string().trim().min(1).max(4000) }).strict().parse(req.body)
      : z.object({ turn: z.number().int().min(0).max(messages.length - 1) }).strict().parse(req.body);
    const state = await current(); await approval();
    if (state.generation.stopped || state.generation.completed || (!interactiveMode && input.turn !== state.nextTurn)) throw new Error('This turn is not ready or the run is closed.');
    const lock = await open(join(root, 'generation.lock'), 'wx', 0o600);
    const userMessage = interactiveMode ? input.message : messages[input.turn];
    const requestId = interactiveMode ? randomUUID() : requestIds[input.turn];
    try {
      await workflow.run(1, { workspaceId: session.workspaceId, conversationId: session.conversationId, requestId, message: userMessage });
      const saved = await current();
      await atomic(join(work, 'conversation-progress.json'), saved);
      const used = await ledger();
      const interactiveLimitReached = interactiveMode && (used.generationRequests >= proposal.limits.maxGenerationRequests
        || used.pineconeReads >= proposal.limits.maxPineconeReadRequests);
      if (interactiveLimitReached || (!interactiveMode && saved.turns.length === messages.length)) { used.completed = true; used.stopped = true; await atomic(join(root, 'usage.json'), used);
        if (retestMode) await atomic(join(work, 'live-quality-retest-proposal.json'), { ...qualityRetestConfig, status: 'completed', retestCompletedAt: new Date().toISOString() }); }
      await saveTranscript();
      return await current();
    } catch (error) {
      const used = await ledger();
      const recoverableValidation = interactiveMode && isRecoverableTestReplyFailure(error);
      const hasRemainingRequests = used.generationRequests < proposal.limits.maxGenerationRequests
        && used.pineconeReads < proposal.limits.maxPineconeReadRequests;
      const canRecover = recoverableValidation && hasRemainingRequests;
      if (used.generationRequests || used.pineconeReads) { used.stopped = !canRecover; await atomic(join(root, 'usage.json'), used); }
      const requestsRemaining = Math.min(proposal.limits.maxGenerationRequests - used.generationRequests,
        proposal.limits.maxPineconeReadRequests - used.pineconeReads);
      await atomic(join(work, 'conversation-failure.json'), { at: new Date().toISOString(), requestId,
        category: error instanceof CoachModelError ? error.category : recoverableValidation ? 'reply_validation_rejected' : 'workflow_or_approval',
        recoverable: canRecover, generatedConversationPassed: false, automaticRetry: false, requestsRemaining });
      await saveTranscript().catch(() => undefined);
      if (canRecover) throw new RecoverableReplyValidationError(
        `MIRA’s draft did not pass the grounding and conversation checks, so it was not saved. No automatic retry was made. Clarify or rephrase your message and submit a new attempt; this failed attempt used one request. ${requestsRemaining} remain.`, requestsRemaining);
      throw error;
    } finally { await lock.close(); await unlink(join(root, 'generation.lock')); }
  });
  queue = run.then(() => undefined, () => undefined);
  void run.then(value => res.json(value), error => error instanceof RecoverableReplyValidationError
    ? res.status(error.status).json({ code: error.code, recoverable: true, error: error.message, requestsRemaining: error.requestsRemaining, automaticRetry: false })
    : res.status(409).json({ code: 'turn_not_completed', recoverable: false, error: 'The request could not be completed. Its allowance remains counted; no automatic retry was made.', automaticRetry: false }));
});
const server = app.listen(5188, '127.0.0.1', () => console.log('MIRA real-graph Pinecone text test: http://127.0.0.1:5188 — generation gated, no upload route.'));
server.on('error', () => { console.error('Test port unavailable.'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close(() => { void Promise.all([pool.promise().end(), admin.end()]).finally(() => process.exit(0)); }));
