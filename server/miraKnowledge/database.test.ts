import PDFDocument from "pdfkit";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalKnowledgeDocumentStorage } from "./documentStorage";
import { createPdfExtractor } from "./pdfExtraction";
import { createKnowledgeDocumentService } from "./documents";
import { createKnowledgeRouter } from "./router";
import type { TrpcContext } from "../_core/context";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createKnowledgeRepository } from "./repository";
import { syntheticKnowledgeBundle } from "./fixtures";
import type { KnowledgeBundle } from "../../shared/miraKnowledge";
import { preparePineconeSeedPlan } from "./pineconePlan";
import { createPineconeDocumentClient } from "./pineconeClient";
import { createLocalSeedJobStore, createSeedJobService, seedJobStatus } from "./seedJobs";
import { prepareFullBook } from "./fullBook";
import { createConfiguredKnowledgeRetriever } from "./configuredRetrieve";
import { prepareCheckedIncompleteBook } from "./checkedIncomplete";
import { contentHash } from "./schema";

describe.skipIf(process.env.RUN_MIRA_DB_TESTS !== "1")("shared knowledge SQL (disposable only)", () => {
  const name = `test_mira_knowledge_${randomUUID().replaceAll("-", "")}`;
  let admin: mysql.Connection | undefined, pool: mysql.Pool | undefined, created = false;
  let db: ReturnType<typeof drizzle>, repo: ReturnType<typeof createKnowledgeRepository>;
  beforeAll(async () => {
    const socketPath = process.env.MIRA_TEST_DB_SOCKET;
    if (!socketPath?.startsWith("/")) throw new Error("An isolated local socket is required.");
    admin = await mysql.createConnection({ socketPath, user: "root" });
    await admin.query(`CREATE DATABASE \`${name}\``); created = true;
    await admin.changeUser({ database: name });
    const sql = readFileSync(new URL("../../drizzle/0023_mira_knowledge_catalogue.sql", import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await admin.query(statement);
    pool = mysql.createPool({ socketPath, user: "root", database: name, connectionLimit: 4 }); db = drizzle(pool);
  }, 15_000);
  beforeEach(async () => {
    for (const table of ["mira_knowledge_catalogue", "mira_knowledge_releases", "mira_knowledge_versions", "mira_knowledge_withdrawals"]) await pool!.query(`DELETE FROM \`${table}\``);
    repo = createKnowledgeRepository(db);
  });
  afterAll(async () => {
    await pool?.end();
    try { if (admin && created) await admin.query(`DROP DATABASE \`${name}\``); }
    finally { await admin?.end(); }
  });
  async function importDraft(bundle = syntheticKnowledgeBundle()) {
    return repo.importDraft(1, bundle, (await repo.status()).revision);
  }
  async function approveEntries(releaseId: string, bundle: KnowledgeBundle) {
    for (const [kind, entry] of [...bundle.sources.map(s => ["source", s] as const), ...bundle.items.map(i => [i.kind, i] as const)]) {
      await repo.review(2, "Synthetic reviewer", { releaseId, expectedRevision: (await repo.status()).revision, kind, ref: { id: entry.id, version: entry.version }, approved: true,
        reason: "Synthetic review", evaluationCaseIds: kind === "source" ? [] : ["synthetic-evaluation-case"] });
    }
  }
  async function published() {
    const bundle = syntheticKnowledgeBundle(), imported = await importDraft(bundle);
    await approveEntries(imported.releaseId, bundle);
    await repo.publish(2, { expectedRevision: (await repo.status()).revision, expectedHash: imported.hash, releaseId: imported.releaseId });
    return { bundle, ...imported };
  }
  it("imports idempotently and keeps all drafts outside the runtime snapshot", async () => {
    const first = await importDraft();
    const repeat = await repo.importDraft(1, syntheticKnowledgeBundle(), 0);
    expect(repeat).toMatchObject({ releaseId: first.releaseId, hash: first.hash, repeated: true, revision: 1 });
    expect((await repo.publishedSnapshot()).items).toEqual([]);
    expect((await repo.listReleases()).releases).toMatchObject([{ id: first.releaseId, status: "draft" }]);
    expect((await repo.inspect(first.releaseId)).publicationProblems).toHaveLength(3);
    const changed = syntheticKnowledgeBundle(); changed.items[0].title = "Changed without version";
    await expect(importDraft(changed)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await repo.status()).revision).toBe(1);
  });
  it("stores more than 200 full-source passages without publishing OCR success", async () => {
    const bundle = prepareFullBook({ bookId: "synthetic-full-book", title: "Synthetic full book", author: "Test author", edition: "Test",
      sources: [{ part: 1, sha256: "a".repeat(64), physicalPages: 1 }], processedPages: [{ part: 1, physicalPage: 1 }], issues: [],
      units: [{ part: 1, sourceSha256: "a".repeat(64), physicalPage: 1, side: "single", artifact: "page.png", contentType: "ocr_text", text: "Exact full source text. ".repeat(10_000) }] });
    const imported = await importDraft(bundle), readback = await repo.inspect(imported.releaseId);
    expect(readback.release.bundle).toEqual(bundle); expect(readback.release.bundle.items.length).toBeGreaterThan(200);
    expect(readback.publicationProblems.some(p => p.includes("Passage quality not verified"))).toBe(true);
    await expect(repo.publish(1, { releaseId: imported.releaseId, expectedHash: imported.hash, expectedRevision: imported.revision })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await repo.publishedSnapshot()).items).toEqual([]);
  }, 15_000);
  it("retrieves an actually imported reviewed passage and removes it after source withdrawal", async () => {
    const bundle = prepareFullBook({ bookId: "synthetic-reviewed-book", title: "Synthetic reviewed book", author: "Test author", edition: "Test",
      sources: [{ part: 1, sha256: "b".repeat(64), physicalPages: 1 }], processedPages: [{ part: 1, physicalPage: 1 }], issues: [],
      units: [{ part: 1, sourceSha256: "b".repeat(64), physicalPage: 1, side: "single", artifact: "page.png", contentType: "ocr_text", text: "Brand equity combines brand awareness with brand associations." }] });
    bundle.sources[0].rightsBasis = "original"; bundle.sources[0].rightsEvidence = "Synthetic test text";
    Object.assign(bundle.sources[0].fullBookCoverage!, { status: "verified", visualReviewComplete: true });
    if (bundle.items[0].kind !== "passage") throw new Error("Expected passage");
    bundle.items[0].quality = "verified";
    const imported = await importDraft(bundle); await approveEntries(imported.releaseId, bundle);
    await repo.publish(1, { releaseId: imported.releaseId, expectedHash: imported.hash, expectedRevision: (await repo.status()).revision });
    const retrieve = createConfiguredKnowledgeRetriever({ enabled: true, env: {}, snapshot: () => repo.publishedSnapshot() });
    const result = await retrieve({ message: "brand awareness associations", segment: "personal_brand" });
    expect(result.status).toBe("matched"); expect(result.cards[0].item).toEqual(bundle.items[0]);
    expect(result.cards[0].citations[0].locator).toContain("physical PDF page 1");
    await repo.withdraw(1, { kind: "source", ref: { id: bundle.sources[0].id, version: bundle.sources[0].version }, expectedRevision: (await repo.status()).revision, reason: "Synthetic withdrawal test" });
    expect((await retrieve({ message: "brand awareness associations", segment: "personal_brand" })).cards).toEqual([]);
  });
  it("requires review, evaluation and source permissions before explicit publication", async () => {
    const bundle = syntheticKnowledgeBundle(); bundle.sources[0].rightsBasis = "pending";
    const imported = await importDraft(bundle);
    await expect(repo.publish(1, { releaseId: imported.releaseId, expectedHash: imported.hash, expectedRevision: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await approveEntries(imported.releaseId, bundle);
    await expect(repo.publish(1, { releaseId: imported.releaseId, expectedHash: imported.hash, expectedRevision: (await repo.status()).revision })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await repo.publishedSnapshot()).items).toEqual([]);
  });
  it("publishes an explicitly incomplete synthetic book and rejects withdrawn passages through the configured runtime", async () => {
    const hash="d".repeat(64);
    const original=prepareFullBook({bookId:"synthetic-incomplete",title:"Synthetic incomplete book",author:"Synthetic author",edition:"Test edition",
      sources:[{part:1,sha256:hash,physicalPages:1}],processedPages:[{part:1,physicalPage:1}],issues:["Synthetic missing printed page 2","Synthetic unreadable diagram fine print"],
      units:[
        {part:1,sourceSha256:hash,physicalPage:1,side:"single",artifact:"text.txt",contentType:"ocr_text",text:"Brand awareness and associations support customer brand equity."},
        {part:1,sourceSha256:hash,physicalPage:1,side:"single",artifact:"table.txt",contentType:"checked_table",text:"Extension ratings table: snack mixes = 9; plain nuts = 8. Scale maximum = 10."},
        {part:1,sourceSha256:hash,physicalPage:1,side:"single",artifact:"figure.txt",contentType:"figure_description",text:"Branding funnel diagram: awareness 90 percent; consideration 60 percent; preference 30 percent. Small footer is unreadable."},
      ]});
    original.sources[0].rightsBasis="original";original.sources[0].rightsEvidence="Synthetic fixture written for this test; not evidence for Keller.";
    for(const item of original.items)if(item.kind==="passage")item.quality="verified";
    const bundle=prepareCheckedIncompleteBook(original,{bundleHash:contentHash(original),actor:"Synthetic test user",at:"2026-10-31T12:00:00Z",reason:"Accept the exact synthetic gaps",evidence:"Synthetic acceptance",exclusionManifest:"synthetic-exclusions.json",exclusionSha256:"e".repeat(64)});
    const imported=await importDraft(bundle);await approveEntries(imported.releaseId,bundle);
    expect((await repo.inspect(imported.releaseId)).publicationProblems).toEqual([]);
    await repo.publish(2,{releaseId:imported.releaseId,expectedHash:imported.hash,expectedRevision:(await repo.status()).revision});
    const snapshot=await repo.publishedSnapshot();expect(snapshot.items).toEqual(bundle.items);
    expect(snapshot.sources[0].fullBookCoverage?.missingOrUnreadable).toEqual(original.sources[0].fullBookCoverage?.missingOrUnreadable);
    expect(snapshot.sources[0].fullBookCoverage?.status).toBe("pending");
    const retrieve=createConfiguredKnowledgeRetriever({enabled:true,env:{},snapshot:()=>repo.publishedSnapshot()});
    for(const [query,type] of [["awareness associations equity","ocr_text"],["extension ratings snack mixes","checked_table"],["funnel diagram consideration preference","figure_description"]]){
      const result=await retrieve({message:query,segment:"personal_brand"});
      expect(result.cards.some(c=>c.item.kind==="passage"&&c.item.contentType===type)).toBe(true);
      expect(result.cards.every(c=>c.item.limitations.includes("Incomplete source coverage; documented exclusions apply."))).toBe(true);
      expect(result.cards[0].citations[0].locator).toContain("physical PDF page 1");
    }
    const target={host:"https://synthetic.svc.test.pinecone.io",namespace:"mira-incomplete-test"};
    const before=preparePineconeSeedPlan(snapshot,target);expect(before.documents).toHaveLength(3);
    const withdrawn=bundle.items.find(i=>i.kind==="passage"&&i.contentType==="checked_table")!;
    await repo.withdraw(2,{kind:"passage",ref:{id:withdrawn.id,version:withdrawn.version},expectedRevision:(await repo.status()).revision,reason:"Synthetic table withdrawn"});
    const after=await repo.publishedSnapshot();expect(after.items.some(i=>i.id===withdrawn.id)).toBe(false);
    expect((await retrieve({message:"extension ratings snack mixes",segment:"personal_brand"})).cards.some(c=>c.item.id===withdrawn.id)).toBe(false);
    const afterPlan=preparePineconeSeedPlan(after,target);expect(afterPlan.documents).toHaveLength(2);expect(afterPlan.preview.target.namespace).not.toBe(before.preview.target.namespace);
    await repo.withdraw(2,{kind:"source",ref:{id:bundle.sources[0].id,version:bundle.sources[0].version},expectedRevision:(await repo.status()).revision,reason:"Synthetic source withdrawn"});
    expect((await repo.publishedSnapshot()).items).toEqual([]);
  });
  it("persists an immutable published release across restarts", async () => {
    const { releaseId, hash } = await published();
    const fresh = createKnowledgeRepository(db), snapshot = await fresh.publishedSnapshot();
    expect(snapshot).toMatchObject({ releaseId, hash }); expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.find(i => i.kind === "card")?.sourceRefs[0].locator).toContain("Page 7");
    await expect(fresh.review(2, "Reviewer", { releaseId, expectedRevision: snapshot.revision, kind: "card", ref: { id: "audience-before-style", version: 1 }, approved: false, reason: "Change", evaluationCaseIds: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await fresh.publish(2, { releaseId, expectedHash: hash, expectedRevision: 0 })).toMatchObject({ releaseId });
  });
  it("withdraws a source and its dependent cards without erasing historical citations", async () => {
    const { bundle, releaseId, hash } = await published(); const old = await repo.publishedSnapshot();
    await repo.withdraw(2, { expectedRevision: old.revision, kind: "source", ref: { id: bundle.sources[0].id, version: 1 }, reason: "Synthetic permission withdrawal" });
    const snapshot = await repo.publishedSnapshot();
    expect(snapshot.items.map(i => i.kind)).toEqual(["judgement"]); expect(snapshot.sources).toEqual([]);
    expect(snapshot.revision).toBeGreaterThan(old.revision); expect(snapshot.hash).toBe(hash);
    const historical = await repo.inspect(releaseId);
    expect(historical.release.bundle.items).toHaveLength(2);
    expect(historical.release.bundle.items.find(i => i.kind === "card")?.sourceRefs).toHaveLength(1);
    expect(historical.release.status).toBe("published");
  });
  it("allows one concurrent review and rejects stale publication", async () => {
    const { releaseId, hash } = await importDraft();
    const input = { releaseId, expectedRevision: 1, kind: "card" as const, ref: { id: "audience-before-style", version: 1 }, approved: true, reason: "Synthetic check", evaluationCaseIds: ["synthetic-case"] };
    const outcomes = await Promise.allSettled([repo.review(1, "One", input), repo.review(2, "Two", input)]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    await expect(repo.publish(1, { releaseId, expectedHash: hash, expectedRevision: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("shows removed and changed entries before replacing the active release", async () => {
    const first = await published();
    const changed = syntheticKnowledgeBundle(); changed.items = [changed.items[0]]; changed.items[0].version = 2; changed.items[0].title = "Revised synthetic principle";
    const second = await importDraft(changed), preview = await repo.inspect(second.releaseId);
    expect(preview.diff.changed).toEqual(["card:audience-before-style"]); expect(preview.diff.removed).toEqual(["judgement:metaphor-is-not-location"]);
    expect((await repo.publishedSnapshot()).releaseId).toBe(first.releaseId);
    await approveEntries(second.releaseId, changed);
    await repo.publish(2, { releaseId: second.releaseId, expectedHash: second.hash, expectedRevision: (await repo.status()).revision });
    expect((await repo.inspect(second.releaseId)).release.parentReleaseId).toBe(first.releaseId);
    expect((await repo.publishedSnapshot()).items).toHaveLength(1);
    expect((await repo.inspect(first.releaseId)).release.bundle.items).toHaveLength(2);
  });
  it("matches an approved prospective plan after SQL publication and persists mocked seed verification", async () => {
    const bundle = syntheticKnowledgeBundle(), imported = await importDraft(bundle);
    await approveEntries(imported.releaseId, bundle);
    const inspected = await repo.inspect(imported.releaseId), target = { host: "https://synthetic.svc.test.pinecone.io", namespace: "mira-sql-test" };
    const prospective = preparePineconeSeedPlan({ releaseId: imported.releaseId, hash: imported.hash, revision: inspected.revision + 1,
      items: inspected.release.bundle.items, sources: inspected.release.bundle.sources }, target);
    expect((await repo.publishedSnapshot()).items).toEqual([]);
    await repo.publish(2, { releaseId: imported.releaseId, expectedHash: imported.hash, expectedRevision: inspected.revision });
    expect(preparePineconeSeedPlan(await repo.publishedSnapshot(), target)).toEqual(prospective);
    const root = await mkdtemp(join(tmpdir(), "mira-seed-sql-")), remote = new Map<string, Record<string, unknown>>();
    let calls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      calls++; const body = JSON.parse(init?.body as string), namespace = prospective.preview.target.namespace;
      if (String(url).endsWith("/upsert")) { for (const document of body.documents) remote.set(document._id, document); return Response.json({ upserted_count: body.documents.length, usage: {} }); }
      if (String(url).endsWith("/fetch")) return Response.json({ namespace, documents: Object.fromEntries(body.ids.filter((id: string) => remote.has(id)).map((id: string) => [id, remote.get(id)])), usage: {} });
      if (String(url).endsWith("/search")) return Response.json({ namespace, matches: [...remote.values()].map(d => ({ ...d, _score: 0.9 })), usage: {} });
      throw new Error("Unexpected synthetic request");
    };
    try {
      const service = createSeedJobService({ store: createLocalSeedJobStore(root), target, snapshot: () => repo.publishedSnapshot(),
        client: createPineconeDocumentClient({ target, apiKey: "synthetic", seedEnabled: true, readEnabled: true, fetcher }) });
      const job = await service.prepare([{ itemId: "audience-before-style", query: "Understand an audience before choosing style" }]);
      const approval = { approved: true as const, actor: "Synthetic SQL reviewer", fingerprint: job.fingerprint, jobHash: job.jobHash,
        approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), maxRecords: job.recordCount, maxWriteRequests: job.batches.length, maxReadRequests: 3 };
      await service.execute(job.id, approval); await service.reconcile(job.id, approval);
      expect(seedJobStatus(await service.verifySearch(job.id, approval))).toMatchObject({ recordsVerified: true, searchVerified: true, writeRequests: 1, readRequests: 2 });
      expect(calls).toBe(3);
      await service.execute(job.id, approval); expect(calls).toBe(3);
      await repo.withdraw(2, { kind: "source", ref: { id: bundle.sources[0].id, version: 1 }, expectedRevision: (await repo.status()).revision, reason: "Synthetic withdrawal" });
      await expect(service.execute(job.id, approval)).rejects.toThrow("changed"); expect(calls).toBe(3);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.env.RUN_MIRA_PDF_TESTS !== "1")("uploads and reads a real PDF through the editor API, then saves only a cited draft", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mira-pdf-sql-test-"));
    try {
      const bytes = await new Promise<Buffer>((resolveBytes, reject) => {
        const pdf = new PDFDocument(); const chunks: Buffer[] = [];
        pdf.on("data", b => chunks.push(b)); pdf.on("error", reject); pdf.on("end", () => resolveBytes(Buffer.concat(chunks)));
        pdf.text("Synthetic marketing book page: understand the audience first."); pdf.end();
      });
      const documents = createKnowledgeDocumentService({ storage: createLocalKnowledgeDocumentStorage(folder), extract: createPdfExtractor({ python: process.env.MIRA_PDF_PYTHON || resolve(".mira-pdf-venv/bin/python") }) });
      const caller = createKnowledgeRouter({ enabled: () => true, repository: async () => repo, documents: () => documents }).createCaller({ user: { id: 7, role: "admin", name: "Synthetic editor" }, req: {}, res: {} } as TrpcContext);
      const uploaded = await caller.uploadPdf({ source: syntheticKnowledgeBundle().sources[0], originalName: "synthetic-book.pdf", pdfBase64: bytes.toString("base64"), extractionPermitted: true });
      expect(uploaded.document.extraction.pages[0].text).toContain("understand the audience");
      const { sourceRefs, authorship, authorName, ...card } = syntheticKnowledgeBundle().items[0];
      if (card.kind !== "card") throw new Error("Expected card");
      const draft = await caller.draftFromDocument({ documentId: uploaded.document.id, pages: [1], expectedRevision: 0, extractionReviewed: true, card });
      const saved = await repo.inspect(draft.releaseId);
      expect(saved.release.status).toBe("draft");
      expect(saved.release.bundle.items[0].sourceRefs[0].locator).toBe("PDF page 1");
      expect(saved.release.bundle.sources[0].assetReference).toBe(`knowledge-document:${uploaded.document.id}`);
      expect((await repo.publishedSnapshot()).items).toEqual([]);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

});
