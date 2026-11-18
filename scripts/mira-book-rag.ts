import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { prepareFullBook, versionPreparedBook, type BookUnit } from "../server/miraKnowledge/fullBook";
import { normaliseBundle, contentHash } from "../server/miraKnowledge/schema";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";
import { retrieveExpertise } from "../server/miraKnowledge/retrieve";

// Local preparation/staging only. No credentials, provider, remote seeding,
// publication, review approval, DATABASE_URL or migration code is loaded here.
const [command, bookId] = process.argv.slice(2);
if (!["prepare", "stage", "verify"].includes(command) || !/^[a-z][a-z0-9-]{0,59}$/.test(bookId || "")) throw new Error("Use prepare|stage|verify BOOK-ID.");
const config = JSON.parse(await readFile(resolve(".mira-local-data/local-book-tools/config.json"), "utf8"));
const book = join(config.externalRoot, "books", bookId), output = join(book, "rag");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const save = async (name: string, value: unknown) => { await mkdir(output, { recursive: true }); await writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n"); };
const manifest = await json(join(book, "book.json"));
if (manifest.bookId !== bookId || manifest.extraction !== "extracted") throw new Error("Every physical source page must have an extraction receipt before staging.");
if (command === "prepare") {
  const coverage = await json(join(book, "coverage-quality.json"));
  if (manifest.sources.some((source: any) => coverage.sourceHashes?.[String(source.part)] !== source.sha256)) throw new Error("Source files changed since the coverage audit. Review their page mapping before preparing an import.");
  const units: BookUnit[] = [];
  const add = (page: any, side: BookUnit["side"], artifact: string, text: string, contentType: BookUnit["contentType"]) => units.push({
    part: page.part, physicalPage: page.physicalPage, sourceSha256: page.sourceSha256, side, artifact, text, contentType });
  const safeRead = async (path: string) => {
    const rel = relative(book, resolve(path));
    if (rel.startsWith("..") || rel.startsWith("/")) throw new Error("A prepared artifact escapes its book folder.");
    return readFile(path, "utf8");
  };
  for (const page of manifest.pages) {
    // The cover is a single portrait photograph letterboxed into a landscape
    // PDF page. Its full-page OCR preserves the title crossing the centre.
    if (bookId === "brand-management" && page.part === 4 && page.physicalPage === 1) {
      const full = await json(join(book, "part-04/page-0001/orientation-ocr.json"));
      add(page, "single", "part-04/page-0001/source-page.png", full.lines.map((line: any) => line.text).join("\n"), "ocr_text");
    } else for (const region of page.regions) {
      if (!region.text) throw new Error("A page OCR error must be resolved before staging.");
      let text = await safeRead(region.text);
      if (page.part === 1 && page.physicalPage === 13 && region.side === "left") text = await safeRead(join(book, "part-01/page-0013/left-checked.txt"));
      if (page.part === 1 && page.physicalPage === 60 && region.side === "left") text = await safeRead(join(book, "part-01/page-0060/left-order-checked.txt"));
      add(page, region.side, relative(book, region.image), text, "ocr_text");
    }
    const tablePath = join(book, `part-${String(page.part).padStart(2, "0")}/page-${String(page.physicalPage).padStart(4, "0")}/table-checked.md`);
    try { add(page, "right", relative(book, page.orientedImage), await safeRead(tablePath), "checked_table"); }
    catch (error: any) { if (error.code !== "ENOENT") throw error; }
  }
  const visuals = await json(join(book, "visuals.json")).catch(error => { if (error.code === "ENOENT") return { pages: [] }; throw error; });
  for (const page of visuals.pages) for (const figure of page.figures) {
    if (page.part === 1 && page.physicalPage === 30 && figure.path?.endsWith("right-figure-001.png")) continue; // source-checked version below
    if (figure.checkedDescription) {
      const origin=manifest.pages.find((p: any) => p.part===page.part && p.physicalPage===page.physicalPage);
      add(origin,figure.side,relative(book,figure.path),"Source-checked visual description (separate from original text):\n"+JSON.stringify(figure.checkedDescription.content),"figure_description");
      continue;
    }
    if (figure.description?.state !== "described_needs_review") continue; // Failed/truncated text is retained in the quality report, never imported as valid.
    const origin = manifest.pages.find((p: any) => p.part === page.part && p.physicalPage === page.physicalPage);
    if (!origin) throw new Error("A visual lacks a physical page receipt.");
    const text = "Unreviewed local visual description (separate from source text):\n" + JSON.stringify(figure.description.content);
    add(origin, figure.side, relative(book, figure.path), text, "figure_description");
  }
  const funnelPage = manifest.pages.find((page: any) => page.part === 1 && page.physicalPage === 30);
  add(funnelPage, "right", "part-01/page-0030/right-figure-001.png", await safeRead(join(book, "part-01/page-0030/figure-2-5-checked.txt")), "figure_description");
  const tables = await json(join(book, "table-review.json"));
  for (const table of tables.tables) {
    if (table.state === "source_checked") continue; // the complete checked row-major table is already included
    const origin = manifest.pages.find((page: any) => page.part === table.part && page.physicalPage === table.physicalPage);
    add(origin, table.side, relative(book, table.image), await safeRead(table.text), "ocr_text");
  }
  const issues = ["Printed pages 14–15 missing in supplied scans (Part 1 jumps from 12–13 to 16–17).",
    "Printed pages 112–113 (Part 1 physical PDF page 61) are visibly blurred and need a rescan for reliable transcription.",
    "Earlier front matter/title/copyright/contents pages before the supplied preface are not present; exact Roman-page coverage is unverified.",
    "Photographed low-resolution text, table cells, page-edge crops and visual descriptions still require source review."];
  const previous = await json(join(output,"knowledge-bundle.json")).catch(error => { if(error.code==="ENOENT")return undefined;throw error; });
  const bundle = versionPreparedBook(prepareFullBook({ bookId, title: "Strategic Brand Management: Building, Measuring, and Managing Brand Equity", author: "Kevin Lane Keller",
    edition: "Fourth edition (verified from Part 4 cover)", sources: manifest.sources, processedPages: manifest.pages, units, issues }),previous);
  await save("knowledge-bundle.json", bundle);
  await save("preparation-report.json", { bookId, bundleHash: contentHash(bundle), items: bundle.items.length,
    ocrPassages: bundle.items.filter(i => i.kind === "passage" && i.contentType === "ocr_text").length,
    fullSourceCharacters: units.filter(u => u.contentType === "ocr_text").reduce((sum, unit) => sum + Array.from(unit.text).length, 0),
    artifactCount: units.length, complete: false, state: "prepared_quality_hold", issues, providerRequests: 0, pineconeRequests: 0 });
  console.log(JSON.stringify({ state: "prepared_quality_hold", items: bundle.items.length, bundleHash: contentHash(bundle), complete: false }));
} else {
  const file = join(output, "knowledge-bundle.json");
  if ((await stat(file)).size > 80_000_000) throw new Error("Local book draft exceeds the 80 MB trusted CLI input bound.");
  const bundle = normaliseBundle(await json(file)), report = await json(join(output, "preparation-report.json"));
  if (contentHash(bundle) !== report.bundleHash || bundle.items.some(item => item.kind !== "passage" || item.quality !== "pending")) throw new Error("Only the unchanged unreviewed book draft can be staged by this CLI.");
  const pool = mysql.createPool({ socketPath: resolve(".mira-local-data/connected-review/db.sock"), user: "root", database: "mira_connected_review", connectionLimit: 1, connectTimeout: 5000 });
  const repo = createKnowledgeRepository(drizzle(pool));
  try {
    if (command === "stage") {
      const before = await repo.status(), staged = await repo.importDraft(1, bundle, before.revision);
      const after = await repo.status();
      if (after.activeReleaseId !== before.activeReleaseId) throw new Error("Draft staging changed the active release unexpectedly.");
      await save("staged-release.json", { ...staged, state: "draft_quality_hold", complete: false, published: false, pineconeRequests: 0 });
      console.log(JSON.stringify({ ...staged, state: "draft_quality_hold", complete: false }));
    } else {
      const staged = await json(join(output, "staged-release.json")), inspected = await repo.inspect(staged.releaseId);
      if (inspected.release.hash !== report.bundleHash || inspected.release.status !== "draft" || contentHash(inspected.release.bundle) !== contentHash(bundle)) throw new Error("The staged book does not match its complete prepared draft.");
      const snapshot = await repo.publishedSnapshot();
      const query = "Coca-Cola IBM brand value 2011 place branding";
      const actual = retrieveExpertise(snapshot, { message: query, segment: "personal_brand", language: "en" });
      const draftKeys=new Set(bundle.items.map(item=>`${item.kind}:${item.id}@${item.version}`));
      const leaked = actual.cards.some(({ item }) => draftKeys.has(`${item.kind}:${item.id}@${item.version}`));
      if (leaked || snapshot.items.some(item => draftKeys.has(`${item.kind}:${item.id}@${item.version}`))) throw new Error("Unreviewed book content leaked into active retrieval.");
      const receipt = { state: "draft_readback_verified_active_retrieval_correctly_withholds_unreviewed_book", releaseId: staged.releaseId,
        storedItems: inspected.release.bundle.items.length, bundleHash: report.bundleHash, storedContentMatchesPreparedBundle: true,
        activeRetrievalStatus: actual.status, activeRetrievalAlgorithm: actual.algorithm, activeBookMatches: 0, publicationProblems: inspected.publicationProblems.length,
        verificationScope: "Actual local SQL draft readback and current published-snapshot lexical retrieval; Pinecone is unchanged.",
        positiveLiveBookRetrieval: "pending_quality_coverage_and_publication", complete: false, providerRequests: 0, pineconeRequests: 0 };
      await save("verification.json", receipt); console.log(JSON.stringify(receipt));
    }
  } finally { await pool.end(); }
}
