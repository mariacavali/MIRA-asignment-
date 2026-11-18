import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { prepareFullBook, versionPreparedBook } from "./fullBook";
import { normaliseBundle } from "./schema";
import type { KnowledgeBundle } from "../../shared/miraKnowledge";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const unitSchema = z.object({ id:z.string().regex(/^[a-z][a-z0-9-]+$/), part:z.number().int().positive(), physicalPage:z.number().int().positive(),
  side:z.enum(["left","right","single"]), sourceSha256:digest, sourceFile:z.string().min(1), printedPage:z.union([z.number().int().positive(),z.string().min(1)]),
  artifact:z.string().min(1), text:z.string().min(1), contentType:z.enum(["ocr_text","checked_table","figure_description"]),
  sourceImage:z.string().min(1), sourceImageSha256:digest, checkedTextSha256:digest,
  state:z.enum(["source_checked","source_checked_partial"]), excludedDetails:z.array(z.string()).optional(), scope:z.string().optional(),
}).passthrough();
export const checkedExportSchema=z.object({version:z.literal(2),state:z.literal("source_checked_partial_subset"),bookComplete:z.literal(false),
  sources:z.array(z.object({part:z.number().int().positive(),path:z.string(),sha256:digest,physicalPages:z.number().int().positive()}).passthrough()).min(1),
  processedPages:z.array(z.object({part:z.number().int().positive(),physicalPage:z.number().int().positive()})),
  units:z.array(unitSchema).min(1),exclusions:z.array(z.record(z.string(),z.unknown())),regionReview:z.array(z.record(z.string(),z.unknown())),
  sourceCoverage:z.object({confirmedMissingMainPages:z.array(z.number())}).passthrough(),
  summary:z.record(z.string(),z.unknown()),inputHashes:z.record(z.string(),digest),decisionDirectory:z.string(),decisionFiles:z.array(z.string()),
}).passthrough();
export type CheckedBookExport=z.infer<typeof checkedExportSchema>;
export const fileSha=(bytes: string|Buffer)=>createHash("sha256").update(bytes).digest("hex");
async function contained(root:string,path:string) {
  const full=await realpath(resolve(root,path)),rel=relative(await realpath(root),full);
  if(isAbsolute(path)||rel.startsWith("..")||isAbsolute(rel))throw new Error("Checked artifact escapes its book folder.");
  return full;
}
// This reader has no raw-OCR fallback. Every exported byte is bound to an explicit
// scan-review decision, checked text, retained image and original PDF hash.
export async function validateCheckedBook(root:string,raw:unknown) {
  const checked=checkedExportSchema.parse(raw),memo=new Map<string,string>();
  const hash=async(path:string)=>{if(!memo.has(path))memo.set(path,fileSha(await readFile(path)));return memo.get(path)!;};
  const actual=(await readdir(checked.decisionDirectory)).filter(n=>/^(ocr-decisions-.*|figure-decisions.*)\.json$/.test(n)).map(n=>join(checked.decisionDirectory,n)).sort();
  if(JSON.stringify(actual)!==JSON.stringify([...checked.decisionFiles].sort()))throw new Error("Review decision file set changed; refresh the checked export.");
  if(actual.some(p=>!checked.inputHashes[p]))throw new Error("Review input manifest omits a decision file.");
  for(const [path,expected] of Object.entries(checked.inputHashes))if(await hash(path)!==expected)throw new Error("Review input changed; refresh the checked export.");
  const sources=new Map(checked.sources.map(s=>[s.part,s]));
  if(sources.size!==checked.sources.length)throw new Error("Duplicate source part.");
  for(const s of checked.sources)if(await hash(s.path)!==s.sha256)throw new Error("Original PDF no longer matches review.");
  const ids=new Set<string>();
  for(const u of checked.units){
    if(ids.has(u.id))throw new Error("Duplicate checked unit.");ids.add(u.id);
    const s=sources.get(u.part);
    if(!s||s.sha256!==u.sourceSha256||basename(s.path)!==u.sourceFile||u.physicalPage>s.physicalPages)throw new Error("Checked unit detached from original PDF.");
    if(typeof u.printedPage==="number"&&checked.sourceCoverage.confirmedMissingMainPages.includes(u.printedPage))throw new Error("Missing printed page cannot contain checked text.");
    const artifact=await contained(root,u.artifact),image=await contained(root,u.sourceImage);
    if(fileSha(u.text)!==u.checkedTextSha256||await hash(artifact)!==u.checkedTextSha256)throw new Error("Checked text content/hash mismatch.");
    if(await hash(image)!==u.sourceImageSha256)throw new Error("Checked image no longer matches review.");
  }
  return checked;
}
export function prepareReviewedBook(checked:CheckedBookExport,previous?:KnowledgeBundle){
  const withheld:{id:string;reason:string}[]=[],seen=new Set<string>();
  const units=checked.units.filter(u=>{
    let reason="";
    if(u.contentType==="ocr_text"&&(Array.from(u.text.trim()).length<120||/^(CHAPTER\s+\d+|PART\s+[IVX]+)\s*[•·]/.test(u.text.trim())))reason="Checked fragment has insufficient standalone context or is a running header; retained in review records, withheld from this partial RAG bundle.";
    const key=`${u.part}:${u.physicalPage}:${u.side}:${fileSha(u.text)}`;
    if(seen.has(key))reason="Identical checked text on the same source page already included.";
    if(reason){withheld.push({id:u.id,reason});return false;}seen.add(key);return true;
  });
  const issues=["PARTIAL COVERAGE: only explicit source-checked units are included; neighboring and unreviewed OCR is excluded.",
    "Printed pages 14–15 are absent. Earlier numbered front matter I–XXIII is absent; unnumbered front matter count is unknown.",
    "Pages 112–113 contain blurred text; only separately checked readable text and photograph description are retained.",
    "Unresolved fine print, graph details and reading-order blocks are excluded; see the explicit exclusion ledger."];
  const bundle=prepareFullBook({bookId:"brand-management",title:"Strategic Brand Management: Building, Measuring, and Managing Brand Equity",author:"Kevin Lane Keller",edition:"Fourth edition",
    sources:checked.sources,processedPages:checked.processedPages,units,issues});
  const source=bundle.sources[0];source.intendedUse="PARTIAL COVERAGE: source-checked excerpts, tables and visual descriptions only. Whole book remains incomplete. No unchecked text or inferred missing content.";
  source.fullBookCoverage!.visualReviewComplete=true;
  source.fullBookCoverage!.evidence="All 371 figure candidates and 23 tables have explicit scan-review decisions; unreadable details are excluded. Text review is partial. See checked-export.json and exclusion-list.json. Full coverage remains pending.";
  const byArtifact=new Map(units.map(u=>[`mira-book:brand-management/${u.artifact}`,u]));
  const itemUnits:Record<string,string>={};
  for(const item of bundle.items){
    if(item.kind!=="passage")throw new Error("Reviewed books must remain source passages.");
    const u=byArtifact.get(item.provenance.sourceImage)!;
    item.quality="verified";
    item.title=`Strategic Brand Management · Fourth edition · printed ${u.printedPage} · ${u.contentType}`;
    item.sourceRefs[0].locator=`${u.sourceFile}; part ${u.part}, physical PDF page ${u.physicalPage}, ${u.side}; printed page ${u.printedPage}; ${u.contentType}; checked unit ${u.id}; characters ${item.provenance.start}–${item.provenance.end}`;
    item.provenance.sourceImage=`mira-book:brand-management/${u.sourceImage}`;
    item.limitations=["PARTIAL BOOK COVERAGE. Only this scan-checked span is included. Its surrounding paragraph or chapter may be excluded; do not infer missing context.",
      ...(u.excludedDetails?.length?["Excluded unreadable details: "+u.excludedDetails.join("; ")]:[]),
      ...(u.contentType==="figure_description"?["Scan-checked visual description, separate from the author’s original text."]:[])];
    itemUnits[item.id]=u.id;
  }
  return {bundle:versionPreparedBook(normaliseBundle(bundle),previous),itemUnits,withheld,units};
}
