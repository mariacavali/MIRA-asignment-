import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticKnowledgeBundle } from "./fixtures";
import { contentHash } from "./schema";
import { preparePineconeSeedPlan } from "./pineconePlan";
import { createLocalSeedJobStore, createSeedJobService, seedJobStatus, type SeedApproval, type SeedJob, type SeedJobStore } from "./seedJobs";

const target = { host: "https://synthetic.svc.test.pinecone.io", namespace: "mira-test" };
const time = new Date("2026-10-29T10:00:00Z");
function fixture() {
  const bundle = syntheticKnowledgeBundle();
  const snapshot = { releaseId: "c030dd28-c3ee-471f-8bf3-c50a4a3a48fa", hash: contentHash(bundle), revision: 3, ...bundle };
  const { formatVersion: _, ...corpus } = snapshot;
  let saved: SeedJob | null = null, locked = false;
  const store: SeedJobStore = {
    async locked(run) { if (locked) throw new Error("locked"); locked = true; try { return await run(); } finally { locked = false; } },
    async get() { return structuredClone(saved); }, async save(job) { saved = structuredClone(job); },
  };
  const snapshotRead = vi.fn(async () => structuredClone(corpus));
  const client = { writeBatch: vi.fn(async (plan, i) => ({ batchIndex: i, fingerprint: plan.preview.fingerprint, acceptedRecords: plan.documents.slice(i * 32, (i + 1) * 32).length })),
    fetchBatch: vi.fn(async () => Object.fromEntries(preparePineconeSeedPlan(corpus, target).documents.map(d => [d._id, d]))),
    search: vi.fn(async () => preparePineconeSeedPlan(corpus, target).documents.map(d => ({ ...d, _score: 0.9 }))),
  };
  const service = createSeedJobService({ target, store, snapshot: snapshotRead, client, now: () => time });
  const probes = [{ itemId: "audience-before-style", query: "Who benefits from this offer?" }];
  const permit = (job: SeedJob): SeedApproval => ({ approved: true, actor: "Synthetic test editor", fingerprint: job.fingerprint, jobHash: job.jobHash,
    approvedAt: time.toISOString(), expiresAt: new Date(time.getTime() + 60_000).toISOString(), maxRecords: job.recordCount, maxWriteRequests: job.batches.length, maxReadRequests: 10 });
  return { corpus, service, store, client, snapshotRead, probes, permit, saved: () => structuredClone(saved!) };
}

describe("durable bounded seed execution", () => {
  it("prepares without provider calls and requires exact current approval before dispatch", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes);
    expect(seedJobStatus(job)).toMatchObject({ recordsVerified: false, searchVerified: false, writeRequests: 0, readRequests: 0 });
    for (const patch of [{ approved: false }, { fingerprint: "0".repeat(64) }, { jobHash: "0".repeat(64) },
      { expiresAt: time.toISOString() }, { expiresAt: new Date(time.getTime() + 3 * 60 * 60_000).toISOString() }, { maxRecords: job.recordCount + 1 }]) {
      await expect(f.service.execute(job.id, { ...f.permit(job), ...patch } as SeedApproval)).rejects.toThrow();
    }
    expect(f.client.writeBatch).not.toHaveBeenCalled(); expect(f.client.fetchBatch).not.toHaveBeenCalled(); expect(f.client.search).not.toHaveBeenCalled();
  });
  it("persists before sending, resumes accepted batches without re-embedding, and separately checks fetch and search", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    f.client.writeBatch.mockImplementationOnce(async plan => {
      expect(f.saved()).toMatchObject({ writeRequests: 1, batches: [{ state: "dispatching" }] });
      return { batchIndex: 0, fingerprint: plan.preview.fingerprint, acceptedRecords: plan.documents.length };
    });
    expect(seedJobStatus(await f.service.execute(job.id, approval))).toMatchObject({ recordsVerified: false, searchVerified: false, batchStates: ["accepted"] });
    await f.service.execute(job.id, approval); expect(f.client.writeBatch).toHaveBeenCalledTimes(1);
    await expect(f.service.verifySearch(job.id, approval)).rejects.toThrow("Verify all");
    expect(seedJobStatus(await f.service.reconcile(job.id, approval))).toMatchObject({ recordsVerified: true, searchVerified: false });
    expect(seedJobStatus(await f.service.verifySearch(job.id, approval))).toMatchObject({ recordsVerified: true, searchVerified: true, readRequests: 2 });
    await f.service.verifySearch(job.id, approval); expect(f.client.search).toHaveBeenCalledTimes(1);
  });
  it("counts ambiguous failures, never retries a write, and reconciles only exact fetched content", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    f.client.writeBatch.mockRejectedValueOnce(new Error("secret provider detail"));
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("unconfirmed");
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("ambiguous");
    f.client.fetchBatch.mockResolvedValueOnce({});
    expect(seedJobStatus(await f.service.reconcile(job.id, approval))).toMatchObject({ uncertainBatches: [0], writeRequests: 1, readRequests: 1 });
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("ambiguous");
    expect(seedJobStatus(await f.service.reconcile(job.id, approval))).toMatchObject({ recordsVerified: true, writeRequests: 1, readRequests: 2 });
    expect(f.client.writeBatch).toHaveBeenCalledTimes(1);
  });
  it("leaves altered or incompletely returned documents unverified", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    await f.service.execute(job.id, approval);
    const documents = preparePineconeSeedPlan(f.corpus, target).documents;
    f.client.fetchBatch.mockResolvedValueOnce(Object.fromEntries(documents.map(d => [d._id, { ...d, chunk_text: "changed" }])));
    expect(seedJobStatus(await f.service.reconcile(job.id, approval)).recordsVerified).toBe(false);
    f.client.fetchBatch.mockResolvedValueOnce(Object.fromEntries(documents.map(d => [d._id, { _id: d._id } as typeof d])));
    expect(seedJobStatus(await f.service.reconcile(job.id, approval)).recordsVerified).toBe(false);
  });
  it("stops a multi-batch run at an ambiguous response and blocks concurrent dispatch", async () => {
    const f = fixture(), original = f.corpus.items[0];
    f.corpus.items = Array.from({ length: 40 }, (_, i) => ({ ...structuredClone(original), id: `card-${i}` }));
    f.probes[0].itemId = "card-0";
    const job = await f.service.prepare(f.probes), approval = f.permit(job);
    expect(job.batches.length).toBe(2);
    f.client.writeBatch.mockImplementationOnce(async (plan, i) => {
      await expect(f.service.execute(job.id, approval)).rejects.toThrow("locked");
      return { batchIndex: i, fingerprint: plan.preview.fingerprint, acceptedRecords: 32 };
    }).mockRejectedValueOnce(new Error("ambiguous second response"));
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("unconfirmed");
    expect(f.saved().batches.map(b => b.state)).toEqual(["accepted", "uncertain"]);
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("ambiguous");
    expect(f.client.writeBatch).toHaveBeenCalledTimes(2);
    expect(seedJobStatus(await f.service.reconcile(job.id, approval))).toMatchObject({ recordsVerified: true, writeRequests: 2, readRequests: 2 });
  });
  it("recovers a persisted dispatching state only through readback", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    job.batches[0].state = "dispatching"; job.writeRequests = 1; await f.store.save(job);
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("ambiguous");
    expect(seedJobStatus(await f.service.reconcile(job.id, approval)).recordsVerified).toBe(true);
    expect(f.client.writeBatch).not.toHaveBeenCalled();
  });
  it("blocks stale catalogue/withdrawal and allows refreshed approval without repeating completed writes", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    await f.service.execute(job.id, approval);
    f.corpus.revision++;
    await expect(f.service.reconcile(job.id, approval)).rejects.toThrow("changed");
    const refreshed = await f.service.prepare(f.probes);
    expect(refreshed.id).toBe(job.id); expect(refreshed.fingerprint).not.toBe(job.fingerprint); expect(refreshed.writeRequests).toBe(1);
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("approval");
    await f.service.execute(job.id, f.permit(refreshed)); expect(f.client.writeBatch).toHaveBeenCalledTimes(1);
    f.corpus.items = [];
    await expect(f.service.reconcile(job.id, f.permit(refreshed))).rejects.toThrow("changed");
  });
  it("stops when content changes during a request and consumes failed read allowance", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    f.client.writeBatch.mockImplementationOnce(async plan => { f.corpus.items = []; return { batchIndex: 0, fingerprint: plan.preview.fingerprint, acceptedRecords: plan.documents.length }; });
    await expect(f.service.execute(job.id, approval)).rejects.toThrow("changed");
    expect(f.saved().batches[0].state).toBe("accepted");
    const g = fixture(), other = await g.service.prepare(g.probes), oneRead = { ...g.permit(other), maxReadRequests: 1 };
    await g.service.execute(other.id, oneRead); g.client.fetchBatch.mockRejectedValueOnce(new Error("synthetic timeout"));
    await expect(g.service.reconcile(other.id, oneRead)).rejects.toThrow("timeout");
    await expect(g.service.reconcile(other.id, oneRead)).rejects.toThrow("allowance");
    expect(g.client.fetchBatch).toHaveBeenCalledTimes(1); expect(g.saved().readRequests).toBe(1);
  });
  it("does not accept wrong-hash, foreign, or low-score search results as readiness", async () => {
    const f = fixture(), job = await f.service.prepare(f.probes), approval = f.permit(job);
    await f.service.execute(job.id, approval); await f.service.reconcile(job.id, approval);
    const found = await f.client.search();
    for (const patch of [{ mira_item_hash: "0".repeat(64) }, { _id: "foreign" }, { _score: 0.1 }]) {
      f.client.search.mockResolvedValueOnce(found.map(d => ({ ...d, ...patch })));
      expect(seedJobStatus(await f.service.verifySearch(job.id, approval)).searchVerified).toBe(false);
    }
  });
  it("rejects empty corpora and unknown probes", async () => {
    const f = fixture();
    await expect(f.service.prepare([{ itemId: "unknown", query: "test" }])).rejects.toThrow("probes");
    f.corpus.items = []; await expect(f.service.prepare(f.probes)).rejects.toThrow("no published");
  });
});

describe("private local job persistence", () => {
  it("persists across store instances and rejects concurrent operations", async () => {
    const root = await mkdtemp(join(tmpdir(), "mira-seed-test-")), store = createLocalSeedJobStore(root);
    try {
      const f = fixture(), job = await f.service.prepare(f.probes);
      await store.locked(async () => {
        await store.save(job);
        expect(await createLocalSeedJobStore(root).get(job.id)).toEqual(job);
        await expect(createLocalSeedJobStore(root).locked(async () => {})).rejects.toThrow("lock");
      });
      expect(await readdir(root)).toEqual([job.id + ".json"]);
      expect(JSON.parse(await readFile(join(root, job.id + ".json"), "utf8"))).not.toHaveProperty("apiKey");
      await expect(store.get("../outside")).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("refuses public directories and symlink roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "mira-seed-test-"));
    try {
      await chmod(root, 0o755); await expect(createLocalSeedJobStore(root).locked(async () => {})).rejects.toThrow("private");
      await chmod(root, 0o700); await symlink(root, join(root, "alias"));
      await expect(createLocalSeedJobStore(join(root, "alias")).locked(async () => {})).rejects.toThrow("private");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
