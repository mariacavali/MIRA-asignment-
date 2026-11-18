import { readFile, writeFile, mkdir, open, rename, lstat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import mysqlNative from 'mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { parse } from 'dotenv';
import { z } from 'zod';
import { createKnowledgeRepository } from '../server/miraKnowledge/repository';
import { normaliseBundle, contentHash, entryKey } from '../server/miraKnowledge/schema';
import { pineconeTarget, preparePineconeSeedPlan } from '../server/miraKnowledge/pineconePlan';
import { createPineconeDocumentClient } from '../server/miraKnowledge/pineconeClient';
import { createSeedJobService, createLocalSeedJobStore, seedApprovalSchema, seedJobStatus } from '../server/miraKnowledge/seedJobs';
import { createConfiguredKnowledgeRetriever } from '../server/miraKnowledge/configuredRetrieve';
import { conversationRetrieval } from '../server/miraCoach/conversationContext';

// A separate socket-only server and database. Never reads DATABASE_URL or the
// connected-review socket. Remote paths require an exact human approval file.
const [command, workArg, approvalArg] = process.argv.slice(2);
if (!workArg || !['prepare', 'status', 'approved-seed', 'reconcile', 'verify'].includes(command)) throw new Error('Invalid isolated test command.');
const project = resolve('.'), work = resolve(workArg), state = resolve('.mira-local-data/pinecone-nine-entry-test');
const database = 'mira_pinecone_nine_entry_test';
const scope = 'mira-nine-entry-pinecone-test-v1';
const sourceDir = resolve('../brands/mira/work/2026-11_cleared-knowledge');
const expectedIds = ['gds-cleared-analysis', 'gds-cleared-interview', 'gds-cleared-needs', 'mira-cleared-behaviour',
  'mira-cleared-evidence', 'mira-cleared-opening', 'mira-cleared-shots', 'mira-cleared-stage', 'mira-cleared-visuals'];
const expectedFileHash = 'a5efcab452f4a2eb200388e0a34ed61f9b5c43238d502ee4bdba6229538a646a';
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const atomic = async (path: string, value: unknown) => {
  const temporary = path + '.tmp'; const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
  const dir = await open(resolve(path, '..'), 'r'); try { await dir.sync(); } finally { await dir.close(); }
};
await mkdir(work, { recursive: true }); await mkdir(state, { recursive: true, mode: 0o700 });
const sourceBytes = await readFile(join(sourceDir, 'eligible-knowledge-bundle.json'));
if (sha(sourceBytes) !== expectedFileHash) throw new Error('The exact reviewed nine-entry source file changed.');
const bundle = normaliseBundle(JSON.parse(sourceBytes.toString('utf8')));
if (bundle.sources.length !== 5 || contentHash(bundle.items.map(item => item.id)) !== contentHash(expectedIds)) throw new Error('The exact nine-entry scope changed.');
const sourceReview = await json(join(work, 'hosted-source-review.json'));
const frozen = await json(join(sourceDir, 'exact-reviews.json'));
const evidencePaths = ['eligible-knowledge-bundle.json', 'exact-reviews.json', 'exclusion-manifest.json',
  'evidence/mira-method.json', 'evidence/mira-questions.json', 'evidence/provenance-register.json', 'evidence/licence-verification.json'];
const bindings: Record<string, string> = {};
for (const path of evidencePaths) bindings[join(sourceDir, path)] = sha(await readFile(join(sourceDir, path)));
for (const name of ['hosted-source-review.json', 'pinecone-account-preflight.json', 'retrieval-probes.json']) bindings[join(work, name)] = sha(await readFile(join(work, name)));
for (const path of ['scripts/mira-pinecone-isolated-test.mts', 'scripts/mira-pinecone-test-db.py', 'server/miraKnowledge/repository.ts',
  'server/miraKnowledge/schema.ts', 'server/miraKnowledge/publish.ts', 'server/miraKnowledge/pineconePlan.ts', 'server/miraKnowledge/pineconeClient.ts',
  'server/miraKnowledge/seedJobs.ts', 'server/miraKnowledge/pineconeRetrieve.ts', 'server/miraKnowledge/configuredRetrieve.ts',
  'server/miraKnowledge/retrieve.ts', 'server/miraCoach/conversationContext.ts', 'shared/miraKnowledge.ts', 'shared/miraKnowledgeRetrieval.ts',
  'shared/miraPinecone.ts', 'drizzle/schema.ts', 'drizzle/0023_mira_knowledge_catalogue.sql', 'pnpm-lock.yaml']) bindings[join(project, path)] = sha(await readFile(path));
const entries = [...bundle.sources.map(value => ({ kind: 'source' as const, value })), ...bundle.items.map(value => ({ kind: value.kind, value }))];
for (const { kind, value } of entries) {
  const key = entryKey(kind, value), reviewed = sourceReview.entries[key];
  if (!frozen.reviews[key]?.approved || frozen.reviewedEntryHashes[key] !== contentHash(value)
    || reviewed?.contentHash !== contentHash(value) || reviewed.hostedAssessment !== 'eligible_for_exact_test_subject_to_user_release_approval'
    || !reviewed.reason?.trim()) throw new Error('Missing exact hosted source/item assessment.');
}
const preflight = await json(join(work, 'pinecone-account-preflight.json'));
if (preflight.plan !== 'Starter' || preflight.index.recordCount !== 0 || preflight.usage.embeddingUsed !== 0
  || preflight.controlPlaneCheck?.success !== true || preflight.controlPlaneCheck?.hostMatchesConfigured !== true
  || preflight.controlPlaneCheck?.ready !== true || preflight.controlPlaneCheck?.model !== 'llama-text-embed-v2') throw new Error('Review the current Pinecone plan/quota and read-only key check before preparing a new seed.');
const env = parse(await readFile(resolve('.env'), 'utf8'));
const target = pineconeTarget({ PINECONE_INDEX_HOST: env.PINECONE_INDEX_HOST, PINECONE_NAMESPACE: 'mira-nine-entry-test' });
if (target.host !== preflight.index.host) throw new Error('Configured Pinecone host differs from the inspected index.');
const probes = await json(join(work, 'retrieval-probes.json'));
if (probes.positive.length !== 9 || new Set(probes.positive.map((p: any) => p.itemId)).size !== 9
  || probes.positive.some((p: any) => !expectedIds.includes(p.itemId)) || probes.coach.length !== 5) throw new Error('Invalid exact verification scope.');

// Preparation can create only the dedicated database and its four catalogue
// tables. Existing catalogue identities/content are never replaced or cleared.
const admin = await mysql.createConnection({ socketPath: join(state, 'db.sock'), user: 'root', connectTimeout: 5000 });
let pool: ReturnType<typeof mysqlNative.createPool> | undefined;
try {
  const [dbRows]: any = await admin.query('SHOW DATABASES LIKE ?', [database]);
  if (!dbRows.length) {
    if (command !== 'prepare') throw new Error('Prepare the dedicated test catalogue first.');
    await admin.query(`CREATE DATABASE \`${database}\``);
    await admin.changeUser({ database });
    for (const statement of (await readFile('drizzle/0023_mira_knowledge_catalogue.sql', 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await admin.query(statement);
  }
  pool = mysqlNative.createPool({ socketPath: join(state, 'db.sock'), user: 'root', database, connectionLimit: 1, connectTimeout: 5000 });
  const repo = createKnowledgeRepository(drizzle(pool));
  if (command === 'status') {
    const status = await repo.status(), active = await repo.publishedSnapshot();
    console.log(JSON.stringify({ database, ...status, publishedItems: active.items.length, remoteRequests: 0 }));
  } else if (command === 'prepare') {
    const active = await repo.publishedSnapshot();
    if (active.releaseId) throw new Error('A test release is already published. Do not replace or regenerate its approval packet.');
    const imported = await repo.importDraft(1, bundle, active.revision);
    let inspected = await repo.inspect(imported.releaseId);
    if (inspected.release.status !== 'draft') throw new Error('The exact test release is not a draft.');
    for (const { kind, value } of entries) {
      const key = entryKey(kind, value), assessment = sourceReview.entries[key];
      if (inspected.release.reviews[key]?.approved) continue;
      await repo.review(1, 'Codex hosted-source/editorial assessment; human release approval pending', {
        releaseId: imported.releaseId, expectedRevision: inspected.revision, kind, ref: { id: value.id, version: value.version }, approved: true,
        reason: assessment.reason + ' This is an editorial assessment for the exact isolated hosted test. It records no human publication or seed approval.',
        evaluationCaseIds: kind === 'source' ? [] : frozen.reviews[key].evaluationCaseIds,
      });
      inspected = await repo.inspect(imported.releaseId);
    }
    if (contentHash(inspected.release.bundle) !== contentHash(bundle) || inspected.publicationProblems.length) throw new Error('Resolve the exact draft readback/publication problems.');
    const prospective = { releaseId: imported.releaseId, hash: imported.hash, revision: inspected.revision + 1, items: bundle.items, sources: bundle.sources };
    const plan = preparePineconeSeedPlan(prospective, target);
    if (plan.documents.length !== 9 || plan.preview.batchCount !== 1 || plan.preview.items.some(item => item.records !== 1)) throw new Error('Reviewed record layout changed.');
    const mockCases = [];
    // Explicitly prospective local fixture. It is never returned by the live
    // repository, published, seeded, or installed in a running coach.
    for (const probe of [...probes.coach, ...probes.localOnly]) {
      let requests = 0;
      const fetcher: typeof fetch = async () => { requests++; return Response.json({ namespace: plan.preview.target.namespace,
        matches: plan.documents.map(document => ({ ...document, _score: 0.85 })), usage: {} }); };
      const retriever = createConfiguredKnowledgeRetriever({ enabled: true, env: { MIRA_COACH_KNOWLEDGE_BACKEND: 'pinecone',
        MIRA_PINECONE_READ_ENABLED: 'true', MIRA_COACH_KNOWLEDGE_LANGUAGE: probe.language ?? 'en',
        PINECONE_INDEX_HOST: target.host, PINECONE_NAMESPACE: target.namespace, PINECONE_API_KEY: 'mock-only-never-sent' }, snapshot: async () => prospective, fetcher });
      const routing = conversationRetrieval(probe.message);
      const result = await retriever({ message: routing.query, stage: routing.stage, segment: probe.segment ?? 'personal_brand' });
      const selected = result.cards.map(card => card.item.id);
      const passed = probe.expectEmpty ? result.cards.length === 0 : result.status === 'matched' && result.cards.every(card => probe.allowedCategories.includes(card.item.kind === 'card' ? card.item.category : ''));
      mockCases.push({ id: probe.id, stage: routing.stage, status: result.status, selected, mockedRequests: requests, passed });
    }
    if (mockCases.some(result => !result.passed)) throw new Error('A local prospective configured-retriever check failed.');
    const inactive = await repo.publishedSnapshot();
    if (inactive.items.length || inactive.releaseId) throw new Error('Preparation must leave the actual runtime snapshot empty.');
    const packet = { version: 1, scope, database, stateRoot: state, sourceDir, sourceFileSha256: expectedFileHash,
      releaseId: imported.releaseId, expectedRevision: inspected.revision, publicationState: 'draft', bundleHash: imported.hash,
      target, plan, probes, bindings, jobHash: contentHash({ fingerprint: plan.preview.fingerprint, probes: probes.positive }),
      limits: { maxRecords: 9, maxWriteRequests: 1, maxReadRequests: 16, maxDurationMinutes: 120, answerModelRequests: 0, maxAdditionalUsd: 0 },
      costBasis: 'Inspected Starter plan with unused included allowances. Stop on quota/plan change; no upgrade or paid fallback authorised.',
      status: 'awaiting_explicit_user_test_publication_and_seed_approval', humanPublicationApproval: false, seedApproval: false };
    const sealed = { ...packet, packetHash: contentHash(packet) };
    await atomic(join(work, 'release-and-seed-plan.json'), sealed);
    await atomic(join(work, 'preparation-verification.json'), { at: new Date().toISOString(), database, releaseId: imported.releaseId,
      revision: inspected.revision, exactSqlReadback: true, publicationProblems: [], actualPublishedSnapshot: inactive,
      prospectiveMockCases: mockCases, remoteRequests: 0, modelRequests: 0, secretPresentInPacket: JSON.stringify(sealed).includes(env.PINECONE_API_KEY || '\u0000') });
    console.log(JSON.stringify({ packetHash: sealed.packetHash, releaseId: packet.releaseId, revision: packet.expectedRevision,
      namespace: plan.preview.target.namespace, items: plan.preview.itemCount, records: plan.preview.recordCount, recordBytes: plan.preview.recordBytes,
      limits: packet.limits, publicationState: 'draft', remoteRequests: 0, localMockCasesPassed: mockCases.length }));
  } else {
    // Deliberately fail before publication, SDK construction, or requests when
    // the required explicit human approval envelope is absent.
    if (!approvalArg) throw new Error('Explicit approval file required. No publication or remote request was made.');
    const approvalStat = await lstat(resolve(approvalArg));
    if (!approvalStat.isFile() || approvalStat.isSymbolicLink() || (approvalStat.mode & 0o077)) throw new Error('Approval file must be private.');
    const envelope = z.object({ scope: z.literal(scope), packetHash: z.string(), hostedProcessingApproved: z.literal(true),
      testPublicationApproved: z.literal(true), maximumAdditionalUsd: z.literal(0), approval: seedApprovalSchema }).strict().parse(await json(resolve(approvalArg)));
    const { packetHash, ...packet } = await json(join(work, 'release-and-seed-plan.json'));
    const permit = envelope.approval, now = Date.now();
    if (packet.scope !== scope || contentHash(packet) !== packetHash || envelope.packetHash !== packetHash
      || contentHash(packet.bindings) !== contentHash(bindings) || packet.bundleHash !== contentHash(bundle) || contentHash(packet.target) !== contentHash(target)
      || packet.jobHash !== permit.jobHash || packet.plan.preview.fingerprint !== permit.fingerprint || permit.maxRecords !== 9
      || permit.maxWriteRequests !== 1 || permit.maxReadRequests > 16 || Date.parse(permit.approvedAt) > now || Date.parse(permit.expiresAt) <= now
      || Date.parse(permit.expiresAt) - Date.parse(permit.approvedAt) > 120 * 60_000 || now - Date.parse(preflight.at) > 24 * 60 * 60_000) throw new Error('Exact current packet, bindings, preflight and bounded approval required.');
    if (!env.PINECONE_API_KEY?.trim()) throw new Error('Pinecone key missing. No publication or remote request made.');
    const inspected = await repo.inspect(packet.releaseId);
    const snapshot = inspected.release.status === 'draft' ? { releaseId: packet.releaseId, hash: packet.bundleHash,
      revision: inspected.revision + 1, items: bundle.items, sources: bundle.sources } : await repo.publishedSnapshot();
    if (snapshot.releaseId !== packet.releaseId || snapshot.hash !== packet.bundleHash || contentHash(preparePineconeSeedPlan(snapshot, target)) !== contentHash(packet.plan)
      || inspected.publicationProblems.length || (inspected.release.status === 'draft' && inspected.revision !== packet.expectedRevision)) throw new Error('The prepared isolated release changed.');
    const operationLock = await open(join(state, 'execution.lock'), 'wx', 0o600);
    try {
      const usagePath = join(state, 'transport-ledger.json');
      const ledger = await json(usagePath).catch(error => { if (error.code === 'ENOENT') return { packetHash, writes: 0, reads: 0, attempts: [] }; throw error; });
      if (ledger.packetHash !== packetHash) throw new Error('Existing transport ledger belongs to another packet.');
      const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const write = url.pathname.endsWith('/documents/upsert'), read = /\/documents\/(fetch|search)$/.test(url.pathname);
        if (Date.now() >= Date.parse(permit.expiresAt) || url.origin !== target.host || init?.method !== 'POST' || (!write && !read)
          || !url.pathname.startsWith(`/namespaces/${packet.plan.preview.target.namespace}/documents/`)
          || ledger[write ? 'writes' : 'reads'] >= (write ? permit.maxWriteRequests : permit.maxReadRequests)) throw new Error('Approved transport scope or cumulative allowance exhausted.');
        const attempt: any = { operation: write ? 'upsert' : url.pathname.endsWith('/fetch') ? 'fetch' : 'search', at: new Date().toISOString(), state: 'dispatching', usage: null };
        ledger[write ? 'writes' : 'reads']++; ledger.attempts.push(attempt); await atomic(usagePath, ledger);
        try {
          const response = await fetch(input, init);
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > 1_000_000) throw new Error('Provider response exceeded the transport bound.');
          let usage: any = null; try { const raw = JSON.parse(Buffer.from(bytes).toString('utf8')); usage = raw.usage ?? null; } catch {}
          // Store only numeric provider usage, never bodies, credentials or text.
          if (usage && typeof usage === 'object') attempt.usage = Object.fromEntries(Object.entries(usage).filter(([key, value]) => /^[a-zA-Z_]+$/.test(key) && typeof value === 'number' && Number.isFinite(value)));
          attempt.state = response.ok ? 'response_received' : 'provider_error'; attempt.httpStatus = response.status;
          await atomic(usagePath, ledger);
          return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
        } catch { attempt.state = 'uncertain'; await atomic(usagePath, ledger); throw new Error('Unconfirmed provider response. No automatic retry.'); }
      };
      if (command === 'approved-seed' && inspected.release.status === 'draft') await repo.publish(1, {
        releaseId: packet.releaseId, expectedRevision: packet.expectedRevision, expectedHash: packet.bundleHash });
      const client = createPineconeDocumentClient({ target, apiKey: env.PINECONE_API_KEY, readEnabled: true,
        seedEnabled: command === 'approved-seed', fetcher, timeoutMs: 30_000 });
      const service = createSeedJobService({ store: createLocalSeedJobStore(join(state, 'seed-jobs')), target, client, snapshot: () => repo.publishedSnapshot() });
      let job = await service.prepare(packet.probes.positive);
      if (job.fingerprint !== permit.fingerprint || job.jobHash !== permit.jobHash) throw new Error('The seed job changed.');
      if (command === 'approved-seed') job = await service.execute(job.id, permit);
      if (command === 'approved-seed' || command === 'reconcile') job = await service.reconcile(job.id, permit);
      if (command !== 'reconcile') {
        job = await service.verifySearch(job.id, permit);
        if (!seedJobStatus(job).searchVerified) throw new Error('Positive raw retrieval is not verified; no automatic retry or conversation call.');
        const resultPath = join(work, 'live-configured-retrieval.json');
        const prior = await json(resultPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (prior && prior.packetHash !== packetHash) throw new Error('Existing configured-retrieval receipt belongs to a different packet.');
        const results: any[] = prior?.results ?? [];
        for (const probe of [...packet.probes.coach, ...packet.probes.localOnly]) {
          if (results.some(result => result.id === probe.id && result.passed)) continue;
          const retrieve = createConfiguredKnowledgeRetriever({ enabled: true, env: { ...env, PINECONE_NAMESPACE: target.namespace,
            MIRA_COACH_KNOWLEDGE_BACKEND: 'pinecone', MIRA_PINECONE_READ_ENABLED: 'true', MIRA_COACH_KNOWLEDGE_LANGUAGE: probe.language ?? 'en' },
            snapshot: () => repo.publishedSnapshot(), fetcher });
          const routing = conversationRetrieval(probe.message);
          const result = await retrieve({ message: routing.query, stage: routing.stage, segment: probe.segment ?? 'personal_brand' });
          const passed = probe.expectEmpty ? result.status === 'no_match' && result.cards.length === 0 : result.status === 'matched'
            && result.cards.every(card => probe.allowedCategories.includes(card.item.kind === 'card' ? card.item.category : ''));
          const index = results.findIndex(result => result.id === probe.id);
          const observed = { id: probe.id, stage: routing.stage, status: result.status, selected: result.cards.map(card => card.item.id), passed };
          if (index < 0) results.push(observed); else results[index] = observed;
          await atomic(resultPath, { packetHash, at: new Date().toISOString(), results, complete: results.length === 7,
            passed: results.length === 7 && results.every(result => result.passed), modelRequests: 0 });
        }
        if (results.length !== 7 || results.some(result => !result.passed)) process.exitCode = 1;
      }
      await atomic(join(work, 'seed-receipt.json'), { ...seedJobStatus(job), transportWrites: ledger.writes, transportReads: ledger.reads, modelRequests: 0 });
      console.log(JSON.stringify({ ...seedJobStatus(job), transportWrites: ledger.writes, transportReads: ledger.reads, modelRequests: 0 }));
    } finally { await operationLock.close(); await unlink(join(state, 'execution.lock')); }
  }
} catch (error) {
  // Errors from database/network/provider can contain private configuration.
  const message = error instanceof Error ? error.message : '';
  console.error(/^(Explicit approval|The exact|Exact current|The prepared|Approval file|Pinecone key|A test release|A local prospective|Resolve the exact|Positive raw|Approved transport|Existing transport|The seed job|The dedicated)/.test(message)
    ? message : 'Isolated Pinecone test stopped. Inspect the local preparation and receipts; no automatic retry was made.');
  process.exitCode = 1;
} finally { await pool?.promise().end(); await admin.end(); }
