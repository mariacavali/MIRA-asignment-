import { createHash } from "node:crypto";
import { normaliseBundle, contentHash } from "./schema";
import type { KnowledgeBundle } from "../../shared/miraKnowledge";

export type BookUnit = { text: string; sourceSha256: string; part: number; physicalPage: number;
  side: "left" | "right" | "single"; artifact: string; contentType: "ocr_text" | "checked_table" | "figure_description" };
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
// Unicode code-point offsets match the Python extraction receipts. Every source
// character survives, including the final short chunk and overlapping context.
export function splitBookText(text: string, maximum = 1000, overlap = 120) {
  if (!Number.isInteger(maximum) || maximum < 2 || maximum > 1200 || !Number.isInteger(overlap) || overlap < 0 || overlap >= maximum / 2) throw new Error("Invalid book chunk bounds.");
  const chars = Array.from(text), result: { start: number; end: number; text: string }[] = [];
  for (let start = 0; start < chars.length;) {
    let end = Math.min(chars.length, start + maximum);
    if (end < chars.length) {
      for (let at = end - 1; at > start + maximum / 2; at--) if (chars[at] === "\n") { end = at + 1; break; }
    }
    result.push({ start, end, text: chars.slice(start, end).join("") });
    if (end === chars.length) break;
    start = end - overlap;
  }
  return result;
}

export function prepareFullBook(input: { bookId: string; title: string; author: string; edition: string;
  sources: { part: number; sha256: string; physicalPages: number }[]; processedPages: { part: number; physicalPage: number }[];
  issues: string[]; units: BookUnit[] }): KnowledgeBundle {
  if (!/^[a-z][a-z0-9-]{0,59}$/.test(input.bookId) || !input.sources.length || !input.units.length) throw new Error("Invalid full-book input.");
  const parts = new Map(input.sources.map(source => [source.part, source]));
  if (parts.size !== input.sources.length) throw new Error("Duplicate book parts.");
  const pages = new Set<string>();
  for (const page of input.processedPages) {
    const source = parts.get(page.part), key = `${page.part}:${page.physicalPage}`;
    if (!source || page.physicalPage < 1 || page.physicalPage > source.physicalPages || pages.has(key)) throw new Error("Invalid or duplicate physical page receipt.");
    pages.add(key);
  }
  const sourceId = `book-${input.bookId}`;
  const bundle: KnowledgeBundle = { formatVersion: 1, sources: [{ id: sourceId, version: 1,
    title: input.title, author: input.author, edition: input.edition, kind: "book", assetReference: `mira-book:${input.bookId}`,
    intendedUse: "Complete source-linked book passages and separately reviewed visual descriptions for MIRA retrieval.",
    rightsBasis: "pending", rightsEvidence: "", fullBookCoverage: { status: "pending",
      expectedPhysicalPages: input.sources.reduce((sum, part) => sum + part.physicalPages, 0), processedPhysicalPages: pages.size,
      missingOrUnreadable: input.issues, visualReviewComplete: false,
      evidence: "See the per-page coverage/quality receipts in the local book preparation. Extraction alone does not verify printed-page completeness, transcription or visual understanding." } }], items: [] };
  for (const unit of input.units) {
    const source = parts.get(unit.part);
    if (!source || source.sha256 !== unit.sourceSha256 || !pages.has(`${unit.part}:${unit.physicalPage}`)
      || !/^[a-f0-9]{64}$/.test(unit.sourceSha256) || !/^[a-zA-Z0-9/_.-]{1,180}$/.test(unit.artifact)
      || unit.artifact.split("/").some(part => part === "..")) throw new Error("Book passage provenance does not match its source receipt.");
    if (!unit.text.length) continue;
    const artifactSha256 = sha(unit.text);
    for (const chunk of splitBookText(unit.text)) {
      const id = `book-p-${sha(JSON.stringify({ source: unit.sourceSha256, page: unit.physicalPage, side: unit.side,
        artifact: unit.artifact, content: artifactSha256, start: chunk.start, end: chunk.end }))}`;
      bundle.items.push({ id, version: 1, kind: "passage", authorship: unit.contentType === "figure_description" ? "source_description" : "source_excerpt",
        authorName: unit.contentType === "figure_description" ? "Local visual description; not original authored book text" : input.author,
        title: `${input.title} · part ${unit.part}, PDF page ${unit.physicalPage}, ${unit.side}`,
        language: "en", segments: ["personal", "personal_brand", "small_business"], decisionDimensions: ["brand.meaning", "voice.profile", "visual.direction"],
        sourceRefs: [{ id: sourceId, version: 1, locator: `Part ${unit.part}, physical PDF page ${unit.physicalPage}, ${unit.side}; ${unit.contentType}; characters ${chunk.start}–${chunk.end}` }],
        limitations: ["Unreviewed OCR/description draft. Use the original scan to resolve doubtful wording, values and visual relationships. This does not establish complete-book coverage."],
        content: chunk.text, contentType: unit.contentType, quality: "pending",
        provenance: { sourceSha256: unit.sourceSha256, part: unit.part, physicalPage: unit.physicalPage, side: unit.side,
          start: chunk.start, end: chunk.end, sourceImage: `mira-book:${input.bookId}/${unit.artifact}`, artifactSha256 } });
    }
  }
  return normaliseBundle(bundle);
}

// Keep immutable catalogue IDs/versions valid when a checked correction or
// metadata review changes an already prepared artifact. Unchanged reruns reuse
// the same version; references follow the exact new source version.
export function versionPreparedBook(bundle: KnowledgeBundle, previous?: KnowledgeBundle): KnowledgeBundle {
  if (!previous) return bundle;
  for (const source of bundle.sources) {
    const prior = previous.sources.find(old => old.id === source.id);
    if (prior) source.version = contentHash({ ...source, version: prior.version }) === contentHash(prior) ? prior.version : prior.version + 1;
  }
  const priorItems = new Map(previous.items.map(item => [`${item.kind}:${item.id}`, item]));
  for (const item of bundle.items) {
    for (const ref of item.sourceRefs) ref.version = bundle.sources.find(source => source.id === ref.id)!.version;
    const prior = priorItems.get(`${item.kind}:${item.id}`);
    if (prior) item.version = contentHash({ ...item, version: prior.version }) === contentHash(prior) ? prior.version : prior.version + 1;
  }
  return normaliseBundle(bundle);
}
