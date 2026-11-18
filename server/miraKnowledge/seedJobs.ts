import { randomUUID } from "node:crypto";
import { mkdir, open, lstat, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import type { PublishedKnowledgeSnapshot } from "../../shared/miraKnowledgeRetrieval";
import { contentHash } from "./schema";
import { preparePineconeSeedPlan, PINECONE_BATCH_SIZE, type PineconeTarget, type PineconeSeedPlan } from "./pineconePlan";
import type { createPineconeDocumentClient } from "./pineconeClient";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const seedApprovalSchema = z.object({
  approved: z.literal(true), actor: z.string().trim().min(1).max(200),
  fingerprint: hash, jobHash: hash, approvedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  maxRecords: z.number().int().positive().max(6400),
  maxWriteRequests: z.number().int().positive().max(200),
  maxReadRequests: z.number().int().nonnegative().max(400),
}).strict();
export type SeedApproval = z.infer<typeof seedApprovalSchema>;
const probeSchema = z.object({ itemId: z.string().min(1).max(80), query: z.string().trim().min(1).max(8000) }).strict();
const batchSchema = z.object({ state: z.enum(["pending", "dispatching", "accepted", "uncertain", "verified"]),
  ids: z.array(z.string()).min(1).max(PINECONE_BATCH_SIZE), acceptedRecords: z.number().int().nonnegative(),
  lastEventAt: z.string().datetime().nullable() }).strict();
const jobSchema = z.object({ version: z.literal(1), id: hash, jobHash: hash, fingerprint: hash, namespace: z.string(),
  recordCount: z.number().int().positive().max(6400), createdAt: z.string().datetime(),
  batches: z.array(batchSchema).min(1).max(200), probes: z.array(probeSchema).min(1).max(10),
  searchChecks: z.array(z.object({ itemId: z.string(), passed: z.boolean(), at: z.string().datetime() }).strict()).max(10),
  writeRequests: z.number().int().nonnegative(), readRequests: z.number().int().nonnegative(),
  approvals: z.array(seedApprovalSchema).max(50),
}).strict();
export type SeedJob = z.infer<typeof jobSchema>;
type Client = Pick<ReturnType<typeof createPineconeDocumentClient>, "writeBatch" | "fetchBatch" | "search">;
export type SeedJobStore = { locked<T>(run: () => Promise<T>): Promise<T>; get(id: string): Promise<SeedJob | null>; save(job: SeedJob): Promise<void> };

// Private single-host store, deliberately separate from application/client data.
// A crash leaves its exclusive lock in place: inspect it before manual recovery.
// There is no unsafe stale-lock timeout or automatic recovery write.
export function createLocalSeedJobStore(root: string): SeedJobStore {
  if (!isAbsolute(root)) throw new Error("Seed job storage requires an absolute private root.");
  async function directory() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await lstat(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077)) throw new Error("Seed job storage must be private.");
  }
  const path = (id: string) => join(root, `${hash.parse(id)}.json`);
  async function syncDirectory() { const handle = await open(root, "r"); try { await handle.sync(); } finally { await handle.close(); } }
  return {
    async locked(run) {
      await directory(); const lockPath = join(root, "operation.lock");
      let lock;
      try { lock = await open(lockPath, "wx", 0o600); } catch { throw new Error("A seed operation or unresolved crash lock already exists. Inspect the local job before recovery."); }
      try {
        await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); await lock.sync(); await syncDirectory();
        return await run();
      } finally { await lock.close(); await unlink(lockPath); await syncDirectory(); }
    },
    async get(id) {
      await directory();
      let stat; try { stat = await lstat(path(id)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000 || (stat.mode & 0o077)) throw new Error("Invalid seed job file.");
      return jobSchema.parse(JSON.parse(await readFile(path(id), "utf8")));
    },
    async save(raw) {
      await directory(); const job = jobSchema.parse(raw), temporary = join(root, `${job.id}.${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(job, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, path(job.id)); await syncDirectory();
    },
  };
}

function jobIdentity(plan: PineconeSeedPlan, probes: SeedJob["probes"]) {
  return contentHash({ fingerprint: plan.preview.fingerprint, probes });
}
function jobId(plan: PineconeSeedPlan) { return contentHash({ host: plan.preview.target.host, namespace: plan.preview.target.namespace }); }
export function seedJobStatus(job: SeedJob) {
  return { id: job.id, jobHash: job.jobHash, fingerprint: job.fingerprint, namespace: job.namespace,
    records: job.recordCount, batches: job.batches.length, writeRequests: job.writeRequests, readRequests: job.readRequests,
    recordsVerified: job.batches.every(batch => batch.state === "verified"),
    searchVerified: job.searchChecks.length === job.probes.length && job.searchChecks.every(check => check.passed),
    uncertainBatches: job.batches.flatMap((batch, i) => ["dispatching", "uncertain"].includes(batch.state) ? [i] : []),
    batchStates: job.batches.map(batch => batch.state) };
}

// A job can only be prepared from the authoritative published catalogue. A
// candidate preview never grants publication, source permission or write access.
export function createSeedJobService(options: { store: SeedJobStore; snapshot: () => Promise<PublishedKnowledgeSnapshot>;
  target: PineconeTarget; client: Client; now?: () => Date }) {
  const now = options.now ?? (() => new Date());
  const plan = async () => preparePineconeSeedPlan(await options.snapshot(), options.target);
  async function current(job: SeedJob) {
    const active = await plan();
    if (active.preview.fingerprint !== job.fingerprint || jobId(active) !== job.id
      || job.jobHash !== jobIdentity(active, job.probes) || active.documents.length !== job.recordCount
      || active.preview.batchCount !== job.batches.length || job.batches.some((batch, i) =>
        contentHash(batch.ids) !== contentHash(active.documents.slice(i * PINECONE_BATCH_SIZE, (i + 1) * PINECONE_BATCH_SIZE).map(d => d._id)))) {
      throw new Error("The approved catalogue, destination or job changed. Prepare and review a current plan before continuing.");
    }
    return active;
  }
  function approval(job: SeedJob, raw: SeedApproval) {
    const value = seedApprovalSchema.parse(raw), time = now().getTime(), start = Date.parse(value.approvedAt), end = Date.parse(value.expiresAt);
    if (start > time || end <= time || end - start > 2 * 60 * 60_000 || end <= start
      || value.fingerprint !== job.fingerprint || value.jobHash !== job.jobHash || value.maxRecords !== job.recordCount
      || value.maxWriteRequests > job.batches.length || job.writeRequests > value.maxWriteRequests || job.readRequests > value.maxReadRequests) {
      throw new Error("A current bounded approval for this exact seed job is required.");
    }
    return value;
  }
  async function load(id: string, permit: SeedApproval) {
    const job = await options.store.get(id); if (!job) throw new Error("Seed job not found.");
    await current(job); const checked = approval(job, permit);
    if (!job.approvals.some(old => contentHash(old) === contentHash(checked))) { job.approvals.push(checked); await options.store.save(job); }
    return job;
  }
  async function reserve(job: SeedJob, permit: SeedApproval, kind: "readRequests" | "writeRequests") {
    approval(job, permit); await current(job);
    if (job[kind] >= permit[kind === "readRequests" ? "maxReadRequests" : "maxWriteRequests"]) throw new Error("Seed request allowance exhausted.");
    job[kind] += 1;
    // Persist before dispatch. Even ambiguous failures consume the allowance.
    await options.store.save(job);
  }
  async function verifyBatch(job: SeedJob, index: number, permit: SeedApproval) {
    const active = await current(job), batch = job.batches[index];
    await reserve(job, permit, "readRequests");
    const found = await options.client.fetchBatch(job.namespace, batch.ids);
    await current(job);
    const expected = active.documents.slice(index * PINECONE_BATCH_SIZE, (index + 1) * PINECONE_BATCH_SIZE);
    const complete = expected.every(document => {
      const record = found[document._id];
      return record && Object.keys(document).every(key => Object.hasOwn(record, key) && contentHash(record[key]) === contentHash(document[key as keyof typeof document]));
    });
    batch.lastEventAt = now().toISOString();
    if (complete) { batch.state = "verified"; batch.acceptedRecords = batch.ids.length; }
    else if (batch.state === "dispatching") batch.state = "uncertain";
    await options.store.save(job);
  }
  return {
    async prepare(probes: SeedJob["probes"]) {
      return options.store.locked(async () => {
        const active = await plan(), parsed = z.array(probeSchema).min(1).max(10).parse(probes);
        if (!active.documents.length || !active.preview.corpus.releaseId) throw new Error("There is no published knowledge to seed.");
        if (new Set(parsed.map(p => p.itemId)).size !== parsed.length || parsed.some(probe => !active.preview.items.some(item => item.id === probe.itemId))) throw new Error("Invalid verification probes.");
        const id = jobId(active), prior = await options.store.get(id);
        if (prior) {
          if (contentHash(prior.probes) !== contentHash(parsed)) throw new Error("Existing job uses different verification probes.");
          // Unrelated draft/review activity can change the preview fingerprint
          // without changing any active content or its namespace. Rebind the
          // local approval scope, retaining all request counts and receipts.
          if (prior.fingerprint !== active.preview.fingerprint) {
            const rebound = { ...prior, fingerprint: active.preview.fingerprint, jobHash: jobIdentity(active, parsed) };
            await current(rebound); await options.store.save(rebound); return rebound;
          }
          await current(prior); return prior;
        }
        const job: SeedJob = { version: 1, id, jobHash: jobIdentity(active, parsed), fingerprint: active.preview.fingerprint,
          namespace: active.preview.target.namespace, recordCount: active.documents.length, createdAt: now().toISOString(),
          batches: Array.from({ length: active.preview.batchCount }, (_, i) => ({ state: "pending", acceptedRecords: 0, lastEventAt: null,
            ids: active.documents.slice(i * PINECONE_BATCH_SIZE, (i + 1) * PINECONE_BATCH_SIZE).map(d => d._id) })),
          probes: parsed, searchChecks: [], writeRequests: 0, readRequests: 0, approvals: [] };
        await options.store.save(job); return job;
      });
    },
    async execute(id: string, permit: SeedApproval) {
      return options.store.locked(async () => {
        const job = await load(id, permit);
        for (let i = 0; i < job.batches.length; i++) {
          const batch = job.batches[i];
          if (["dispatching", "uncertain"].includes(batch.state)) throw new Error("An ambiguous batch must be reconciled by reading before any further write. No retry was made.");
          if (batch.state !== "pending") continue;
          const active = await current(job);
          batch.state = "dispatching"; batch.lastEventAt = now().toISOString();
          // The state and request reservation are committed in the same save.
          await reserve(job, permit, "writeRequests");
          try {
            const receipt = await options.client.writeBatch(active, i, permit);
            if (receipt.acceptedRecords !== batch.ids.length || receipt.fingerprint !== job.fingerprint) throw new Error("Unconfirmed seed response.");
            batch.state = "accepted"; batch.acceptedRecords = receipt.acceptedRecords;
          } catch {
            batch.state = "uncertain"; batch.lastEventAt = now().toISOString(); await options.store.save(job);
            throw new Error("Seed batch result is unconfirmed. Read reconciliation is required; no retry was made.");
          }
          batch.lastEventAt = now().toISOString(); await options.store.save(job);
          await current(job);
        }
        return job;
      });
    },
    async reconcile(id: string, permit: SeedApproval) {
      return options.store.locked(async () => {
        const job = await load(id, permit);
        for (let i = 0; i < job.batches.length; i++) {
          if (job.batches[i].state !== "pending" && job.batches[i].state !== "verified") await verifyBatch(job, i, permit);
        }
        // Missing records after an ambiguous write are never automatically
        // rewritten: eventual consistency can make a successful write look absent.
        return job;
      });
    },
    async verifySearch(id: string, permit: SeedApproval) {
      return options.store.locked(async () => {
        const job = await load(id, permit);
        if (!job.batches.every(batch => batch.state === "verified")) throw new Error("Verify all record contents before checking search readiness.");
        for (const probe of job.probes) {
          if (job.searchChecks.some(check => check.itemId === probe.itemId && check.passed)) continue;
          const active = await current(job);
          await reserve(job, permit, "readRequests");
          const matches = await options.client.search({ namespace: job.namespace, query: probe.query,
            filter: { mira_scope: { $eq: "published-expertise-v1" }, mira_corpus: { $eq: active.documents[0].mira_corpus } }, signal: new AbortController().signal });
          await current(job);
          const passed = matches.some(match => match.mira_item === probe.itemId && match._score !== null && match._score >= 0.25
            && active.documents.some(document => document._id === match._id && document.mira_item_hash === match.mira_item_hash
              && document.mira_version === match.mira_version && document.mira_corpus === match.mira_corpus && document.mira_kind === match.mira_kind && document.mira_item === match.mira_item));
          job.searchChecks = [...job.searchChecks.filter(check => check.itemId !== probe.itemId), { itemId: probe.itemId, passed, at: now().toISOString() }];
          await options.store.save(job);
        }
        return job;
      });
    },
  };
}
