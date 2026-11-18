import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalKnowledgeDocumentStorage } from "./documentStorage";
import { createKnowledgeDocumentService, knowledgeDocumentService } from "./documents";
import { syntheticKnowledgeBundle } from "./fixtures";

const folders: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "mira-document-test-")); folders.push(folder);
  const storage = createLocalKnowledgeDocumentStorage(folder);
  const extract = vi.fn(async () => ({ pageCount: 2, pages: [{ page: 1, text: "Synthetic marketing principle.", status: "extracted" as const }, { page: 2, text: "", status: "no_text" as const }] }));
  const service = createKnowledgeDocumentService({ storage, extract });
  const input = { source: syntheticKnowledgeBundle().sources[0], originalName: "synthetic-book.pdf", pdfBase64: Buffer.from("%PDF-1.7\nsynthetic").toString("base64"), extractionPermitted: true as const };
  return { folder, storage, extract, service, input };
}
describe("private knowledge document intake", () => {
  it("saves private originals and page drafts, then reuses an unchanged upload", async () => {
    const { folder, service, storage, input, extract } = await fixture();
    const first = await service.upload(7, input), repeat = await service.upload(7, input);
    expect(first.document).toMatchObject({ uploadedByUserId: 7, extractionPermitted: true, status: "extracted_draft" });
    expect(first.document.source.assetReference).toBe(`knowledge-document:${first.document.id}`);
    expect(repeat).toMatchObject({ repeated: true, document: { id: first.document.id } }); expect(extract).toHaveBeenCalledTimes(1);
    expect((await service.list())[0]).toMatchObject({ pageCount: 2, pagesNeedingReview: 1 });
    expect((await service.list())[0]).not.toHaveProperty("extraction");
    expect((await stat(join(folder, `${first.document.id}.pdf`))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(folder, `${first.document.id}.pdf`))).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await storage.get(first.document.id))?.extraction.pages[1].page).toBe(2);
  });
  it("rejects non-PDF data, changed source versions and unsafe document IDs", async () => {
    const { service, storage, input, extract } = await fixture();
    await expect(service.upload(7, { ...input, pdfBase64: Buffer.from("<html>not a PDF</html>").toString("base64") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(extract).not.toHaveBeenCalled(); await service.upload(7, input);
    await expect(service.upload(7, { ...input, source: { ...input.source, title: "Different" } })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(storage.get("../../private-file")).rejects.toBeDefined();
    await expect(service.get(randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("keeps successful files when another extraction fails and permits retry", async () => {
    const { service, input, extract } = await fixture(); await service.upload(7, input);
    const next = { ...input, source: { ...input.source, id: "another-book" } };
    extract.mockRejectedValueOnce(new Error("Synthetic parser failure"));
    await expect(service.upload(7, next)).rejects.toThrow("Synthetic parser failure");
    expect(await service.list()).toHaveLength(1);
    await expect(service.upload(7, next)).resolves.toMatchObject({ repeated: false });
    expect(await service.list()).toHaveLength(2);
  });
  it("fails closed for unconfigured production storage", () => {
    vi.stubEnv("NODE_ENV", "production"); expect(() => knowledgeDocumentService()).toThrow("Production document storage is not configured.");
  });
});
