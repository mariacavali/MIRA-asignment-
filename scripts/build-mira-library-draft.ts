import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normaliseBundle, contentHash, entryKey } from "../server/miraKnowledge/schema";
import { preparePineconeSeedPlan, pineconeTarget } from "../server/miraKnowledge/pineconePlan";
import { retrieveExpertise } from "../server/miraKnowledge/retrieve";
import { parse } from "dotenv";

// Local editorial preparation only. Its hypothetical snapshot is never a
// published catalogue or executable seed approval. Original PDFs stay in Drive.
const work = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass an explicit local intake directory.");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const manifest = await json(join(work, "intake-manifest.json"));
const selection = await json(join(work, "source-selection.json"));
const editorial = await json(join(work, "editorial-cards.json"));
const sources = [], items = [], cases = [], sourceReports = [], proposals = [];
for (const [index, chosen] of selection.sources.entries()) {
  const original = await json(join(work, "extracted", chosen.id + ".json"));
  const inventoried = manifest.sources.find((s: any) => s.id === chosen.id);
  if (!inventoried || inventoried.sha256 !== original.sha256 || chosen.driveUrl !== original.driveUrl) throw new Error("Source provenance changed.");
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(join(manifest.sourceRoot, chosen.relativePath))) digest.update(bytes);
  if (digest.digest("hex") !== inventoried.sha256) throw new Error("Drive original changed after extraction.");
  const noteCards = editorial.cards.filter((c: any) => c.source === index + 1);
  if (!noteCards.length) throw new Error("A selected source has no knowledge cards.");
  const title = chosen.relativePath.split("/")[0].replace(/^\d+ — /, "");
  const source = { id: chosen.id, version: 1, title: "MIRA notes: " + title,
    author: "MIRA editorial notes; source inspiration: " + chosen.inspiredBy, edition: chosen.coverage,
    kind: "editorial" as const, assetReference: chosen.driveUrl,
    intendedUse: "Concise source-linked guidance from the supplied MIRA notes. Text commentary and paraphrases only; no book artwork, full-book text or private client evidence.",
    rightsBasis: "original" as const,
    rightsEvidence: "The supplied PDF identifies its questions/applications as original MIRA adaptations. Maria requested private RAG preparation on 2026-10-29. Proposed scope: concise original commentary/paraphrases only, excluding screenshots, diagrams and verbatim publisher excerpts. This does not assert rights to the full book or copied artwork. Source-file SHA-256: " + original.sha256 };
  sources.push(source);
  const folder = join(work, "prepared-sources", chosen.id); await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "source_metadata.json"), JSON.stringify({ ...source, sourceFile: chosen.relativePath,
    sourceSha256: original.sha256, verifiedPages: original.extraction.pageCount, coverage: chosen.coverage,
    sourceRelationship: "Summary of the uploaded MIRA notes, not an independently verified reading of the underlying book.",
    reviewState: "proposed_not_published" }, null, 2) + "\n");
  await writeFile(join(folder, "source_text.md"), original.extraction.pages.map((p: any) =>
    `## PDF page ${p.page}${p.hasImages ? " (images excluded; text extraction only)" : ""}\n\n${p.text}`).join("\n\n") + "\n");
  await writeFile(join(folder, "chapter_notes.md"), noteCards.map((c: any) => `## ${c.title}\n\nPDF pages ${c.pages.join(", ")}\n\n${c.principle}`).join("\n\n") + "\n");
  await writeFile(join(folder, "mira_application.md"), noteCards.map((c: any) => `## ${c.title}\n\n${c.application.join("\n")}`).join("\n\n") + "\n");
  await writeFile(join(folder, "conflicts_and_limits.md"), ["These notes are supporting reference data. Current service policy, client evidence and confirmed corrections take precedence.",
    "The underlying full book has not been independently verified in this preparation. Retain the stated selective/resource coverage.",
    ...noteCards.flatMap((c: any) => c.limitations)].join("\n\n") + "\n");
  for (const c of noteCards) {
    if (!c.pages.length || new Set(c.pages).size !== c.pages.length) throw new Error("Invalid page selection.");
    for (const page of c.pages) if (!original.extraction.pages.some((p: any) => p.page === page && p.status === "extracted" && p.text.trim())) throw new Error("Unverified page locator.");
    const item = { id: c.id, version: 1, kind: "card" as const, language: "en", title: c.title, category: c.category,
      segments: ["personal_brand", "small_business"], decisionDimensions: c.dimensions, authorship: "source_summary" as const,
      authorName: "Codex editorial synthesis of supplied MIRA notes", sourceRefs: c.pages.map((page: number) => ({ id: source.id, version: 1,
        locator: `Uploaded MIRA notes, PDF page ${page}; underlying coverage: ${chosen.coverage}` })),
      principle: c.principle, useWhen: c.useWhen, requiredClientEvidence: c.evidence, application: c.application,
      limitations: [...c.limitations, "This card summarises the uploaded MIRA notes; it does not independently verify the underlying book or establish facts about a client."] };
    items.push(item);
    cases.push({ id: "case-" + c.id, itemId: c.id, query: c.probe, segment: "personal_brand", expectedSource: chosen.id,
      requiredHandling: c.application, prohibitedOverreach: c.limitations, sourcePdfPages: c.pages });
    proposals.push({ kind: "card", ref: { id: c.id, version: 1 }, reviewer: "Codex editorial review (proposal; not Maria's publication approval)",
      reason: "Checked against the cited extracted MIRA-note pages. Application, evidence requirements and coverage limits are retained; source instructions are not runtime policy.",
      evaluationCaseIds: ["case-" + c.id] });
  }
  proposals.push({ kind: "source", ref: { id: source.id, version: 1 }, reviewer: "Codex source-scope review (proposal)",
    reason: "Proposed original-commentary-only scope; preserve attribution and note-level provenance. Exclude all copied images, publisher excerpts and full-book claims.", evaluationCaseIds: [] });
  sourceReports.push({ id: source.id, title, pages: original.extraction.pageCount, cards: noteCards.length, coverage: chosen.coverage });
}
const bundle = normaliseBundle({ formatVersion: 1, sources, items });
if (new Set(bundle.items.map(item => contentHash(item.kind === "card" ? item.principle : item.betterResponse))).size !== bundle.items.length) throw new Error("Duplicate principles.");
// A deterministic hypothetical UUID makes repeated candidate previews stable.
// The real SQL release ID is assigned by importDraft, never this preview.
const bundleHash = contentHash(bundle), chars = bundleHash.slice(0, 32).split(""); chars[12] = "4"; chars[16] = "8";
const hex = chars.join(""), candidateId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
const hypothetical = { releaseId: candidateId, hash: bundleHash, revision: 0, items: bundle.items, sources: bundle.sources };
const env = parse(await readFile(resolve(".env"), "utf8")), target = pineconeTarget(env);
const candidate = preparePineconeSeedPlan(hypothetical, target);
const evaluation = cases.map(test => {
  const found = retrieveExpertise(hypothetical, { message: test.query, segment: "personal_brand", language: "en" });
  const selected = bundle.items.find(i => i.id === test.itemId)!;
  // An exact-title check verifies serialisation, context fit and citations.
  // Paraphrased scenario relevance is reported separately, never made to pass
  // by silently replacing the scenario with the item's own wording.
  const single = retrieveExpertise({ ...hypothetical, items: [selected] }, { message: selected.title, segment: "personal_brand", language: "en" });
  if (single.status !== "matched" || !single.cards[0].citations.every(ref => ref.id === test.expectedSource)) throw new Error("Individual case cannot retrieve its correctly cited card: " + test.id);
  return { id: test.id, expectedItemId: test.itemId, individualTitleContextAndCitation: "passed", lexicalCorpusHit: found.cards.some(c => c.item.id === test.itemId), selectedItems: found.cards.map(c => c.item.id) };
});
const smoke = sourceReports.map(source => cases.find(c => c.expectedSource === source.id)!).map(c => ({ itemId: c.itemId, query: c.query }));
const report = { state: "candidate_only_not_published_or_seeded", bundleHash, sources: sourceReports,
  sourceCount: sources.length, pageCount: sourceReports.reduce((n, s) => n + s.pages, 0), cardCount: items.length,
  proposedRecords: candidate.preview.recordCount, proposedBatches: candidate.preview.batchCount,
  targetHost: target.host, namespacePrefix: target.namespace, executableApproval: false, seedWrites: 0,
  checks: { schema: "passed", originalFileHashes: "passed", uniquePrinciples: "passed", all25IndividualCardCitations: "passed",
    lexicalCorpusHits: evaluation.filter(e => e.lexicalCorpusHit).length, lexicalCorpusCases: evaluation.length,
    liveSemanticRetrieval: "not_run", sourceReviewAndPublication: "pending" } };
for (const [name, value] of Object.entries({ "knowledge-bundle.json": bundle, "review-proposals.json": proposals, "evaluation-cases.json": cases,
  "offline-evaluation.json": evaluation, "search-probes.json": smoke, "candidate-seed-preview.json": { state: "hypothetical_candidate_only", preview: candidate.preview }, "preparation-report.json": report })) {
  await writeFile(join(work, name), JSON.stringify(value, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
