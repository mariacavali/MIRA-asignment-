import { describe, expect, it } from "vitest";
import { prepareFullBook, splitBookText, versionPreparedBook } from "./fullBook";
import { entryKey } from "./schema";
import { publicationProblems } from "./publish";
import { retrieveExpertise } from "./retrieve";
import { preparePineconeSeedPlan } from "./pineconePlan";
import type { KnowledgeReviews } from "../../shared/miraKnowledge";

const sourceHash = "a".repeat(64);
const make = (text = "Brand equity includes awareness and associations. A distinctive brand helps customers recognise the product.") => prepareFullBook({
  bookId: "synthetic-book", title: "Synthetic test book", author: "Synthetic author", edition: "Test edition",
  sources: [{ part: 1, sha256: sourceHash, physicalPages: 1 }], processedPages: [{ part: 1, physicalPage: 1 }], issues: [],
  units: [{ text, sourceSha256: sourceHash, part: 1, physicalPage: 1, side: "single", artifact: "part-01/page-0001/single.png", contentType: "ocr_text" }],
});
function published(bundle: ReturnType<typeof make>) {
  const { formatVersion: _, ...rest } = bundle;
  return { releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hash: "b".repeat(64), revision: 1, ...rest };
}
const target = { host: "https://test.svc.example.pinecone.io", namespace: "mira-expertise" };
describe("full-book preparation and existing RAG boundary", () => {
  it("preserves every character across chunk boundaries, Unicode and final short fragments", () => {
    const text = ("Brand equity 😀\nUnabridged source sentence.\n").repeat(80) + "END!";
    const source = Array.from(text), slices = splitBookText(text);
    const covered = new Set<number>();
    for (const chunk of slices) {
      expect(chunk.text).toBe(source.slice(chunk.start, chunk.end).join(""));
      for (let i = chunk.start; i < chunk.end; i++) covered.add(i);
    }
    expect(covered.size).toBe(source.length);
    expect(slices.at(-1)?.text.endsWith("END!")).toBe(true);
    expect(() => splitBookText(text, 100, 100)).toThrow();
  });
  it("stages more than 200 actual passages without turning them into cards", () => {
    const bundle = make("full source text ".repeat(20_000));
    expect(bundle.items.length).toBeGreaterThan(200);
    expect(bundle.items.every(item => item.kind === "passage" && item.authorship === "source_excerpt" && item.quality === "pending")).toBe(true);
    expect(bundle.sources[0].fullBookCoverage?.status).toBe("pending");
  });
  it("keeps non-BMP source characters within the passage code-point bound", () => {
    const bundle=make("😀".repeat(1500));
    expect(bundle.items.length).toBeGreaterThan(1);
    expect(bundle.items.every(item => item.kind==="passage" && Array.from(item.content).length<=1200)).toBe(true);
  });
  it("increments changed source/item versions and preserves versions on unchanged preparation", () => {
    const prior=make(); expect(versionPreparedBook(make(),prior)).toEqual(prior);
    const changed=make();changed.sources[0].edition="Corrected source edition";
    const next=versionPreparedBook(changed,prior);
    expect(next.sources[0].version).toBe(2);expect(next.items[0].version).toBe(2);
    expect(next.items[0].sourceRefs[0].version).toBe(2);
    const repeated=make();repeated.sources[0].edition="Corrected source edition";
    expect(versionPreparedBook(repeated,next)).toEqual(next);
  });
  it("labels generated visual descriptions separately from authored source excerpts", () => {
    const bundle=prepareFullBook({bookId:"visual-test",title:"Synthetic",author:"Source Author",edition:"Test",sources:[{part:1,sha256:sourceHash,physicalPages:1}],
      processedPages:[{part:1,physicalPage:1}],issues:[],units:[{part:1,sourceSha256:sourceHash,physicalPage:1,side:"single",artifact:"figure.png",contentType:"figure_description",text:"A blue circle connects to a green square."}]});
    expect(bundle.items[0].authorship).toBe("source_description");
    expect(bundle.items[0].authorName).not.toBe("Source Author");
  });
  it("rejects provenance detached from the source or duplicate page receipts", () => {
    const input = { bookId: "synthetic", title: "Test", author: "Test", edition: "", sources: [{ part: 1, sha256: sourceHash, physicalPages: 1 }],
      processedPages: [{ part: 1, physicalPage: 1 }], issues: [], units: [{ text: "Brand equity", sourceSha256: "c".repeat(64), part: 1, physicalPage: 1,
        side: "single" as const, artifact: "page.png", contentType: "ocr_text" as const }] };
    expect(() => prepareFullBook(input)).toThrow(/provenance/);
    expect(() => prepareFullBook({ ...input, processedPages: [...input.processedPages, ...input.processedPages] })).toThrow(/duplicate/);
  });
  it("blocks publication, seeding and retrieval despite editorial approval when quality or book coverage is pending", () => {
    const bundle = make(), reviews: KnowledgeReviews = {};
    for (const item of [...bundle.sources, ...bundle.items]) reviews[entryKey(item.kind === "book" ? "source" : item.kind as "passage", item)] = {
      actorUserId: 1, reviewer: "Synthetic test", at: new Date().toISOString(), approved: true, reason: "Test", evaluationCaseIds: ["synthetic-test"] };
    expect(publicationProblems(bundle, reviews, new Set()).some(p => p.includes("quality not verified"))).toBe(true);
    expect(retrieveExpertise(published(bundle), { message: "brand equity awareness", segment: "personal_brand", language: "en" }).cards).toEqual([]);
    expect(() => preparePineconeSeedPlan(published(bundle), target)).toThrow(/quality and coverage/);
    bundle.items[0].kind === "passage" && (bundle.items[0].quality = "verified");
    expect(retrieveExpertise(published(bundle), { message: "brand equity awareness", segment: "personal_brand", language: "en" }).cards).toEqual([]);
  });
  it("retrieves a reviewed passage with its exact content and source locator through the existing retriever", () => {
    const bundle = make();
    bundle.sources[0].rightsBasis = "original"; bundle.sources[0].rightsEvidence = "Synthetic fixture";
    Object.assign(bundle.sources[0].fullBookCoverage!, { status: "verified", visualReviewComplete: true });
    if (bundle.items[0].kind !== "passage") throw new Error("Expected passage");
    bundle.items[0].quality = "verified";
    const result = retrieveExpertise(published(bundle), { message: "brand equity awareness", segment: "personal_brand", language: "en" });
    expect(result.status).toBe("matched"); expect(result.cards[0].item).toEqual(bundle.items[0]);
    expect(result.cards[0].citations[0].locator).toContain("physical PDF page 1");
    const plan = preparePineconeSeedPlan(published(bundle), target);
    expect(plan.documents[0].mira_kind).toBe("passage");
    expect(plan.documents[0].chunk_text).toContain(bundle.items[0].content);
    expect(result.cards[0].item.authorship).toBe("source_excerpt");
  });
});
