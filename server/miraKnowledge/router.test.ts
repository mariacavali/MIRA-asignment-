import { describe, expect, it, vi } from "vitest";
import { createKnowledgeRouter } from "./router";
import type { KnowledgeDocumentService } from "./documents";
import type { KnowledgeDocument } from "../../shared/miraKnowledgeDocuments";
import type { createKnowledgeRepository } from "./repository";
import type { TrpcContext } from "../_core/context";
import { syntheticKnowledgeBundle } from "./fixtures";

const releaseId = "c030dd28-c3ee-471f-8bf3-c50a4a3a48fa";
function fixture(role: "admin" | "user" | null = "admin", enabled = true) {
  const document: KnowledgeDocument = { id: releaseId, source: { ...syntheticKnowledgeBundle().sources[0], assetReference: `knowledge-document:${releaseId}` }, originalName: "synthetic.pdf", fileHash: "a".repeat(64), byteSize: 20, uploadedByUserId: 7, createdAt: "2026-10-23T12:00:00.000Z", extractionPermitted: true, status: "extracted_draft", extraction: { pageCount: 2, pages: [{ page: 1, text: "Synthetic principle", status: "extracted" }, { page: 2, text: "", status: "no_text" }] } };
  const docs = { list: vi.fn(async () => []), get: vi.fn(async () => document), upload: vi.fn(async () => ({ document, repeated: false })) } as unknown as KnowledgeDocumentService;
  const documents = vi.fn(() => docs);
  const service = {
    publishedSnapshot: vi.fn(async () => ({ revision: 0, releaseId: null, hash: null, items: [], sources: [] })),
    listReleases: vi.fn(async () => ({ releases: [], nextCursor: null })),
    status: vi.fn(async () => ({ revision: 0, activeReleaseId: null })),
    importDraft: vi.fn(async () => ({ revision: 1, releaseId, hash: "a".repeat(64), repeated: false })),
    inspect: vi.fn(), review: vi.fn(async () => ({ revision: 2 })),
    publish: vi.fn(async () => ({ revision: 3, releaseId })), withdraw: vi.fn(async () => ({ revision: 4 })),
  };
  const repository = vi.fn(async () => service as unknown as ReturnType<typeof createKnowledgeRepository>);
  const caller = createKnowledgeRouter({ enabled: () => enabled, repository, documents,
    seedTarget: () => ({ host: "https://synthetic.svc.test.pinecone.io", namespace: "mira-test" }) }).createCaller({ user: role ? { id: 7, role, name: "Maria (synthetic)" } : null, req: {}, res: {} } as TrpcContext);
  return { service, repository, caller, docs, documents };
}
describe("shared knowledge editorial API", () => {
  it.each([[null, true, "FORBIDDEN"], ["user", true, "FORBIDDEN"], ["admin", false, "NOT_FOUND"]] as const)("blocks role %s enabled %s before database use", async (role, enabled, code) => {
    const { caller, repository, documents } = fixture(role, enabled);
    const ref = { id: "test-card", version: 1 };
    for (const call of [() => caller.previewPineconeSeed(), () => caller.listDocuments(), () => caller.getDocument({ documentId: releaseId }),
      () => caller.uploadPdf({ source: syntheticKnowledgeBundle().sources[0], originalName: "synthetic.pdf", pdfBase64: "JVBERi0xLjQK", extractionPermitted: true }),
      () => caller.listReleases(), () => caller.status(), () => caller.inspect({ releaseId }),
      () => caller.importDraft({ format: "json", content: JSON.stringify(syntheticKnowledgeBundle()), expectedRevision: 0 }),
      () => caller.review({ releaseId, expectedRevision: 0, kind: "card", ref, approved: true, reason: "Test", evaluationCaseIds: ["test-case"] }),
      () => caller.publish({ releaseId, expectedRevision: 0, expectedHash: "a".repeat(64) }),
      () => caller.withdraw({ expectedRevision: 0, kind: "card", ref, reason: "Test" })]) await expect(call()).rejects.toMatchObject({ code });
    expect(repository).not.toHaveBeenCalled(); expect(documents).not.toHaveBeenCalled();
  });
  it("uses authenticated editor identity and rejects uploaded approval claims", async () => {
    const { caller, service } = fixture(); const bundle = syntheticKnowledgeBundle();
    await caller.importDraft({ format: "json", content: JSON.stringify(bundle), expectedRevision: 0 });
    expect(service.importDraft).toHaveBeenCalledWith(7, expect.objectContaining({ formatVersion: 1 }), 0);
    const review = { releaseId, expectedRevision: 1, kind: "card" as const, ref: { id: "audience-before-style", version: 1 }, approved: true, reason: "Reviewed", evaluationCaseIds: ["test-case"] };
    await caller.review(review); expect(service.review).toHaveBeenCalledWith(7, "Maria (synthetic)", review);
    await caller.publish({ releaseId, expectedRevision: 2, expectedHash: "a".repeat(64) });
    expect(service.publish).toHaveBeenCalledWith(7, expect.objectContaining({ releaseId }));
    await expect(caller.importDraft({ format: "json", content: JSON.stringify({ ...bundle, published: true }), expectedRevision: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.importDraft).toHaveBeenCalledTimes(1);
  });
  it("previews only the current published snapshot with no publication or seed side effect", async () => {
    const { caller, service } = fixture();
    expect(await caller.previewPineconeSeed()).toMatchObject({ state: "no_published_knowledge", writesPerformed: 0, recordCount: 0 });
    expect(service.publishedSnapshot).toHaveBeenCalledTimes(1);
    expect(service.publish).not.toHaveBeenCalled(); expect(service.importDraft).not.toHaveBeenCalled();
  });
  it("hides underlying database errors", async () => {
    const { caller, repository } = fixture(); repository.mockRejectedValue(new Error("Private database failure details"));
    await expect(caller.status()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "Knowledge editing is temporarily unavailable." });
  });
  it("creates only a draft note with server-owned document/page provenance", async () => {
    const { caller, service, docs } = fixture();
    const { sourceRefs, authorship, authorName, ...card } = syntheticKnowledgeBundle().items[0];
    if (card.kind !== "card") throw new Error("Expected card fixture");
    await caller.draftFromDocument({ documentId: releaseId, pages: [1, 1], expectedRevision: 0, extractionReviewed: true, card });
    expect(docs.get).toHaveBeenCalledWith(releaseId);
    expect(service.importDraft).toHaveBeenCalledWith(7, expect.objectContaining({ items: [expect.objectContaining({ authorship: "source_summary", authorName: "Maria (synthetic)", sourceRefs: [{ id: "synthetic-marketing-pdf", version: 1, locator: "PDF page 1" }] })] }), 0);
    expect(service.publish).not.toHaveBeenCalled();
    await expect(caller.draftFromDocument({ documentId: releaseId, pages: [2], expectedRevision: 0, extractionReviewed: true, card })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.importDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps earlier draft notes when adding another document note", async () => {
    const { caller, service } = fixture();
    service.inspect.mockResolvedValue({ revision: 0, release: { status: "draft", bundle: syntheticKnowledgeBundle() } });
    const { sourceRefs, authorship, authorName, ...card } = syntheticKnowledgeBundle().items[0];
    if (card.kind !== "card") throw new Error("Expected card fixture");
    await caller.draftFromDocument({ documentId: releaseId, baseDraftId: releaseId, pages: [1], expectedRevision: 0, extractionReviewed: true, card: { ...card, id: "another-principle" } });
    expect(service.importDraft).toHaveBeenCalledWith(7, expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ id: "audience-before-style" }), expect.objectContaining({ id: "metaphor-is-not-location" }), expect.objectContaining({ id: "another-principle" })]) }), 0);
    expect(service.publish).not.toHaveBeenCalled();
  });

});
