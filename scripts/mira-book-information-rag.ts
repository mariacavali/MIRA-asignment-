import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash } from "node:crypto";
import { prepareFullBook, versionPreparedBook } from "../server/miraKnowledge/fullBook";
import { normaliseBundle, contentHash } from "../server/miraKnowledge/schema";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";

// No provider, embeddings, migrations, approval mutation or publication calls.
const output=resolve("../brands/mira/work/2026-10_full-book-ingestion/whole-book-information");
const save=async(name:string,value:unknown)=>writeFile(join(output,name),JSON.stringify(value,null,2)+"\n");
const sha=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
const input=JSON.parse(await readFile(join(output,"information-bundle.json"),"utf8"));
if(input.state!=="whole_available_information_preparation_not_approved_knowledge"||input.bookComplete!==false)throw new Error("Unexpected information review state.");
for(const [path,hash] of Object.entries(input.inputHashes))if(sha(await readFile(path))!==hash)throw new Error("Stale review input: "+path);
for(const unit of input.units){
  if(sha(await readFile(join(output,unit.artifact)))!==unit.artifactSha256||sha(unit.text)!==unit.artifactSha256)throw new Error("Artifact mismatch: "+unit.id);
  if(unit.printedPage===undefined||!unit.sourceFile||!unit.sourceImageSha256)throw new Error("Missing source/page reference: "+unit.id);
}
for(const source of input.sources)if(sha(await readFile(source.path))!==source.sha256)throw new Error("Source PDF mismatch.");
const issues=["Printed pages 14–15 missing from supplied sources.","Numbered front matter I–XXIII absent; unnumbered front-matter count unknown.",
  "Page 112 bibliography body and page 113 learning-objective wording/photo caption unreadable; readable salvage retained.",
  ...(input.units.some((u:any)=>u.quality!=="source_checked")
    ?["Retained OCR has explicit pending source checks. See observation-ledger.json and page-coverage.json."]
    :["Retained readable page text is source checked; source gaps and visual-detail limits remain explicit."]),
  "Fine-print visual exclusions remain explicit; no unreadable details are reconstructed."];
let bundle=prepareFullBook({...input,issues});
const unitForItem:Record<string,string>={};
const unitByArtifact=new Map<string,any>(input.units.map((u:any)=>[u.artifact,u]));
for(const item of bundle.items){
  if(item.kind!=="passage"||!item.provenance)throw new Error("Unexpected book item.");
  const artifact=item.provenance.sourceImage.split("mira-book:brand-management/")[1];
  const unit=unitByArtifact.get(artifact);
  if(!unit)throw new Error("No unit for stored passage.");
  unitForItem[item.id]=unit.id;
  item.title=`${input.title} · ${input.edition} · printed ${unit.printedPage}`;
  item.sourceRefs[0].locator=`${unit.sourceFile}; ${input.edition}; printed page ${unit.printedPage}; part ${unit.part}, PDF page ${unit.physicalPage}, ${unit.side}; ${unit.contentType}; unit ${unit.id}; characters ${item.provenance.start}–${item.provenance.end}`;
  item.provenance.sourceImage=unit.sourceImage.startsWith("/")?unit.sourceImage:`mira-book:brand-management/${unit.sourceImage}`;
  // Only source-checked units get verified transcription quality. Source rights,
  // source coverage, independent item review and evaluation remain untouched.
  item.quality=unit.quality==="source_checked"?"verified":"pending";
  item.limitations=[unit.quality==="source_checked"
    ?"Checked readable source representation; the book still has missing and unreadable material."
    :"Retained full OCR preparation with explicit pending source checks; excluded from approved knowledge.",
    "Partial source coverage. Original layout is not recreated. Use edition, PDF and printed-page references.",
    ...(unit.excludedDetails??[])];
}
bundle.sources[0].intendedUse="Information throughout the entire available book, including full text, structured tables and checked visual descriptions; explicit missing/unreadable and pending material. No summary substitution.";
// Read the last saved version before replacing the prepared bundle. Unchanged
// reruns reuse it; later chapter checks increment only changed item versions.
const prior=normaliseBundle(JSON.parse(await readFile(join(output,"knowledge-bundle.json"),"utf8")));
bundle=versionPreparedBook(normaliseBundle(bundle),prior);
const bundleHash=contentHash(bundle);
await save("knowledge-bundle.json",bundle);
await save("item-unit-map.json",unitForItem);
const pool=mysql.createPool({socketPath:resolve(".mira-local-data/connected-review/db.sock"),user:"root",database:"mira_connected_review",connectionLimit:1,connectTimeout:5000});
try{
  const repo=createKnowledgeRepository(drizzle(pool));
  const before=await repo.status(),activeBefore=await repo.publishedSnapshot();
  const active=before.activeReleaseId?(await repo.inspect(before.activeReleaseId)).release.bundle:undefined;
  if(active?.sources.some(s=>bundle.sources.some(b=>b.id===s.id)))throw new Error("Existing active source needs version reconciliation; refusing replacement.");
  const merged=normaliseBundle({formatVersion:1,sources:[...(active?.sources??[]),...bundle.sources],items:[...(active?.items??[]),...bundle.items]});
  const imported=await repo.importDraft(1,merged,before.revision);
  const stored=await repo.inspect(imported.releaseId),after=await repo.status(),live=await repo.publishedSnapshot();
  if(stored.release.status!=="draft"||contentHash(stored.release.bundle)!==contentHash(merged))throw new Error("Import readback mismatch.");
  // importDraft deliberately increments catalogue revision. Compare the active
  // release and its actual sources/items, excluding that expected bookkeeping.
  if(before.activeReleaseId!==after.activeReleaseId||activeBefore.hash!==live.hash
    ||contentHash(activeBefore.items)!==contentHash(live.items)
    ||contentHash(activeBefore.sources)!==contentHash(live.sources))throw new Error("Active knowledge changed.");
  const ids=new Set(bundle.items.map(i=>i.id));
  if(live.items.some(i=>ids.has(i.id)))throw new Error("Held book leaked into approved knowledge.");
  // Read-only positive content checks on the actual stored draft. These are
  // explicitly NOT live retrieval or answer evaluations. Publication is held;
  // do not repeat negative-only probes as evidence that ingestion succeeded.
  const probes=[
    {type:"checked_price",unit:"p01-0040-left",question:"How does the book compare Julia Child and Sears licensed cookware prices?",expected:"only $40"},
    {type:"full_page_text",unit:"p01-0020-right",question:"According to the book’s historical example, how much did Pfizer spend on direct-to-consumer advertising in 2009?",expected:"over $1 billion"},
    {type:"text",unit:"n003",question:"What are the marketing advantages of strong brands in Figure 2-1?",expected:"Improved perceptions of product performance"},
    {type:"table",unit:"t14",question:"Which Planters extensions have an average scale rating of 9 in Figure 10-1?",expected:"Snack mixes, nuts for baking"},
    {type:"figure",unit:"f033",question:"How many stages and transitions appear in Figure 2-5’s hypothetical branding funnel?",expected:"72%, 46%, 58%, 50% and 56%"},
    {type:"final_chapter_text",unit:"p04-0057-right",question:"What are the endpoints of the Brand Report Card rating scale?",expected:"extremely poor; 10 = extremely good"},
    {type:"final_index",unit:"p04-0075-left",question:"Which pages does the index give for the program quality multiplier?",expected:"program quality multiplier, 101-103"}
  ];
  const checks=probes.map(p=>{
    const items=stored.release.bundle.items.filter(i=>unitForItem[i.id]===p.unit);
    if(p.expected&&!items.some(i=>i.kind==="passage"&&i.content.includes(p.expected!)))throw new Error("Stored source probe failed: "+p.type);
    return {...p,storedSourceCheck:"passed_positive_content_readback_only",storedPassageIds:items.map(i=>i.id),
      storedSourceQuality:items.map(i=>i.kind==="passage"?i.quality:undefined),
      sourceLocators:items.flatMap(i=>i.sourceRefs.map(r=>r.locator)),
      positiveLiveAnswerVerification:"not_run_publication_blocked"};
  });
  const problems=stored.publicationProblems;
  const reasons:Record<string,number>={};
  for(const p of problems){const key=p.split(":")[0];reasons[key]=(reasons[key]??0)+1;}
  const receipt={...imported,state:"whole_available_information_imported_as_held_draft",bookComplete:false,published:false,
    bundleHash,sourceVersion:bundle.sources[0].version,passages:bundle.items.length,
    sourceCheckedQualityPassages:bundle.items.filter(i=>i.kind==="passage"&&i.quality==="verified").length,
    pendingQualityPassages:bundle.items.filter(i=>i.kind==="passage"&&i.quality==="pending").length,
    exactSqlReadbackVerified:true,activeReleaseUnchanged:true,existingActiveItemsPreserved:activeBefore.items.length,
    publicationProblemCount:problems.length,publicationProblems:reasons,rightsBasis:bundle.sources[0].rightsBasis,
    sourceCoverage:"pending_with_explicit_gaps",positiveLiveRetrieval:"blocked_not_verified",
    previousDraftsPreserved:true,paidProviderRequests:0,pineconeRequests:0,
    externalDriveRequiredForStoredTextRetrieval:false,externalDriveRequiredForOriginalScanReview:true};
  await save("import-verification.json",receipt);
  await save("retrieval-checks.json",checks);
  await save("publication-problems.json",problems);
  console.log(JSON.stringify(receipt));
}finally{await pool.end();}
