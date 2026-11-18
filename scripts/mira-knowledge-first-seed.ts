import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { parse } from "dotenv";
import { z } from "zod";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";
import { normaliseBundle, contentHash, entryKey } from "../server/miraKnowledge/schema";
import { pineconeTarget, preparePineconeSeedPlan } from "../server/miraKnowledge/pineconePlan";
import { createPineconeDocumentClient } from "../server/miraKnowledge/pineconeClient";
import { createSeedJobService, createLocalSeedJobStore, seedApprovalSchema, seedJobStatus } from "../server/miraKnowledge/seedJobs";

// Intentionally limited to the existing socket-only local review catalogue.
// No DATABASE_URL, migrations, deployment, implicit publication or provider call.
const [command, workArg, approvalArg] = process.argv.slice(2);
if (!workArg || !["status", "stage", "plan", "release-and-seed", "reconcile", "verify-search"].includes(command)) throw new Error("Use status|stage|plan|release-and-seed|reconcile|verify-search and an explicit intake directory.");
const work = resolve(workArg), root = resolve(".mira-local-data/connected-review");
const readJson = async (name: string) => JSON.parse(await readFile(join(work, name), "utf8"));
if (["release-and-seed", "reconcile", "verify-search"].includes(command)) {
  const scope = await readJson("seed-scope.json").catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (scope?.currentScope === "full_books" && scope.notesOnlySeed === "on_hold") {
    console.error("This notes-only seed is on hold: Maria requested entire books, including an explicit image-handling plan. No publication or provider request was made.");
    process.exit(1);
  }
}
const bundle = normaliseBundle(await readJson("knowledge-bundle.json"));
const report = await readJson("preparation-report.json");
if (contentHash(bundle) !== report.bundleHash) throw new Error("The prepared bundle changed. Rebuild and review it first.");
if(command === "stage" && bundle.sources.some(source => source.rightsBasis === "pending" || !source.rightsEvidence.trim())) {
  throw new Error("Source permission evidence is unresolved. No draft import, source approval or provider request was made.");
}
const env = parse(await readFile(resolve(".env"), "utf8")), target = pineconeTarget(env);
const pool = mysql.createPool({ socketPath: join(root, "db.sock"), user: "root", database: "mira_connected_review", connectionLimit: 1, connectTimeout: 5000 });
const repo = createKnowledgeRepository(drizzle(pool));
const output = async (name: string, value: unknown) => writeFile(join(work, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
try {
  if (command === "status") {
    const status = await repo.status(), snapshot = await repo.publishedSnapshot();
    console.log(JSON.stringify({ ...status, activeItems: snapshot.items.length, target, providerRequests: 0 }));
  } else if (command === "stage") {
    const active = await repo.publishedSnapshot();
    if (active.items.length && active.hash !== report.bundleHash) throw new Error("An existing published corpus must be explicitly merged before staging a replacement.");
    const imported = await repo.importDraft(1, bundle, active.revision);
    let inspected = await repo.inspect(imported.releaseId);
    if (inspected.release.status !== "draft") throw new Error("This release is already published; staging cannot edit it.");
    const proposals = await readJson("review-proposals.json"), cases = await readJson("evaluation-cases.json"), evaluations = await readJson("offline-evaluation.json");
    for (const entry of [...bundle.sources.map(s => ({ kind: "source" as const, value: s })), ...bundle.items.map(value => ({ kind: value.kind, value }))]) {
      const proposed = proposals.find((p: any) => p.kind === entry.kind && p.ref.id === entry.value.id && p.ref.version === entry.value.version);
      if (!proposed) throw new Error("A source/item review proposal is missing.");
      if (entry.kind !== "source" && (!proposed.evaluationCaseIds.length || proposed.evaluationCaseIds.some((id: string) =>
        !cases.some((c: any) => c.id === id && c.itemId === entry.value.id) || !evaluations.some((e: any) => e.id === id && e.individualTitleContextAndCitation === "passed")))) throw new Error("A card lacks its actual offline evaluation record.");
      const existing = inspected.release.reviews[entryKey(entry.kind, entry.value)];
      if (existing?.approved) continue;
      await repo.review(1, "Codex editorial review", { releaseId: imported.releaseId, expectedRevision: inspected.revision,
        kind: entry.kind, ref: { id: entry.value.id, version: entry.value.version }, approved: true,
        reason: proposed.reason + " Offline checks cover schema, source/page references and bounded context. Live model answer quality and Pinecone relevance are not yet verified.",
        evaluationCaseIds: proposed.evaluationCaseIds });
      inspected = await repo.inspect(imported.releaseId);
    }
    const staged = { releaseId: imported.releaseId, bundleHash: imported.hash, revision: inspected.revision,
      state: inspected.release.status, publicationProblems: inspected.publicationProblems,
      reviewedBy: "Codex editorial review", humanPublicationApproval: false, seedWrites: 0 };
    await output("staged-release.json", staged); console.log(JSON.stringify(staged, null, 2));
  } else if (command === "plan") {
    const staged = await readJson("staged-release.json"), inspected = await repo.inspect(staged.releaseId);
    if (inspected.release.hash !== report.bundleHash || inspected.publicationProblems.length) throw new Error("The exact reviewed release is not ready for approval.");
    const snapshot = inspected.release.status === "draft"
      ? { releaseId: staged.releaseId, hash: report.bundleHash, revision: inspected.revision + 1, items: bundle.items, sources: bundle.sources }
      : await repo.publishedSnapshot();
    if (snapshot.releaseId !== staged.releaseId || snapshot.hash !== report.bundleHash) throw new Error("The release is no longer the active publication.");
    const plan = preparePineconeSeedPlan(snapshot, target), probes = await readJson("search-probes.json");
    const packet = { version: 1, scope: "mira-first-seed", localCatalogue: "mira_connected_review", releaseId: staged.releaseId,
      expectedRevision: inspected.revision, publicationState: inspected.release.status, bundleHash: report.bundleHash, plan, probes,
      jobHash: contentHash({ fingerprint: plan.preview.fingerprint, probes }),
      limits: { maxRecords: plan.documents.length, maxWriteRequests: plan.preview.batchCount, maxReadRequests: plan.preview.batchCount * 2 + probes.length * 2, maxDurationMinutes: 120 },
      state: "awaiting_human_publication_and_seed_approval", writesPerformed: 0 };
    const sealed = { ...packet, packetHash: contentHash(packet) }; await output("release-and-seed-plan.json", sealed);
    console.log(JSON.stringify({ fingerprint: plan.preview.fingerprint, target: plan.preview.target, corpus: plan.preview.corpus,
      itemCount: plan.preview.itemCount, recordCount: plan.preview.recordCount, batchCount: plan.preview.batchCount, recordBytes: plan.preview.recordBytes,
      packetHash: sealed.packetHash, jobHash: packet.jobHash, limits: packet.limits, state: packet.state }, null, 2));
  } else {
    if (!approvalArg) throw new Error("An explicit, current approval file is required. No provider request was made.");
    const envelope = z.object({ scope: z.literal("mira-first-seed"), packetHash: z.string(), approval: seedApprovalSchema }).strict()
      .parse(JSON.parse(await readFile(resolve(approvalArg), "utf8")));
    const { packetHash, ...packet } = await readJson("release-and-seed-plan.json");
    const permit = envelope.approval, time = Date.now();
    const expectedSnapshot = packet.publicationState === "draft"
      ? { releaseId: packet.releaseId, hash: packet.bundleHash, revision: packet.expectedRevision + 1, items: bundle.items, sources: bundle.sources }
      : await repo.publishedSnapshot();
    if (!["draft", "published"].includes(packet.publicationState) || contentHash(packet) !== packetHash || packetHash !== envelope.packetHash || permit.jobHash !== packet.jobHash
      || permit.fingerprint !== packet.plan.preview.fingerprint || packet.bundleHash !== report.bundleHash
      || contentHash(packet.plan) !== contentHash(preparePineconeSeedPlan(expectedSnapshot, target))
      || permit.maxRecords !== packet.limits.maxRecords || permit.maxWriteRequests !== packet.limits.maxWriteRequests
      || permit.maxReadRequests > packet.limits.maxReadRequests || Date.parse(permit.approvedAt) > time || Date.parse(permit.expiresAt) <= time
      || Date.parse(permit.expiresAt) - Date.parse(permit.approvedAt) > 120 * 60_000) throw new Error("Approval does not match the exact current publication and seed packet.");
    if (command === "release-and-seed") {
      if (!env.PINECONE_API_KEY?.trim()) throw new Error("The Pinecone key is not configured. No publication or provider request was made.");
      await repo.publish(1, { releaseId: packet.releaseId, expectedRevision: packet.expectedRevision, expectedHash: packet.bundleHash });
    }
    const service = createSeedJobService({ store: createLocalSeedJobStore(resolve(".mira-local-data/knowledge-seed-jobs")),
      snapshot: () => repo.publishedSnapshot(), target,
      client: createPineconeDocumentClient({ target, apiKey: env.PINECONE_API_KEY || "", readEnabled: true, seedEnabled: command === "release-and-seed", timeoutMs: 30_000 }) });
    const job = await service.prepare(packet.probes);
    if (job.fingerprint !== permit.fingerprint || job.jobHash !== permit.jobHash) throw new Error("The published snapshot changed. No remote request was made.");
    const result = command === "release-and-seed" ? await service.execute(job.id, permit)
      : command === "reconcile" ? await service.reconcile(job.id, permit) : await service.verifySearch(job.id, permit);
    const receipt = seedJobStatus(result); await output("seed-receipt.json", receipt); console.log(JSON.stringify(receipt, null, 2));
  }
} catch (error) {
  if (error instanceof z.ZodError) console.error("First seed stopped: invalid local input or approval.");
  else if (error instanceof Error && /^(The |An |A |This |Approval |Seed |There |Existing |Invalid |Use |Pass |Verify )/.test(error.message)) console.error(error.message);
  else {
    const code = (error as NodeJS.ErrnoException)?.code;
    console.error("First seed stopped. Check the private local input or database connection; no automatic retry was made."
      + (code && /^[A-Z_0-9]{1,60}$/.test(code) ? ` Error code: ${code}.` : ""));
  }
  process.exitCode = 1;
} finally { await pool.end(); }
