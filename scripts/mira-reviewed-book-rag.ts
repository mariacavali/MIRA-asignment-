import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { validateCheckedBook, prepareReviewedBook, fileSha } from "../server/miraKnowledge/reviewedBook";
import { normaliseBundle, contentHash } from "../server/miraKnowledge/schema";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";
import { retrieveExpertise } from "../server/miraKnowledge/retrieve";

// Explicitly socket-only existing MIRA import. No env credentials, provider,
// embeddings, migrations, publication mutation or changes to readiness gates.
const [command]=process.argv.slice(2);
if(!["prepare","prepare-stage-verify"].includes(command))throw new Error("Use prepare|prepare-stage-verify.");
const config=JSON.parse(await readFile(resolve(".mira-local-data/local-book-tools/config.json"),"utf8"));
const book=join(config.externalRoot,"books/brand-management"),review=join(book,"review-2026-10-30");
const output=resolve("../brands/mira/work/2026-10_full-book-ingestion/checked-partial");
await mkdir(output,{recursive:true});
const save=async(name:string,value:unknown)=>writeFile(join(output,name),JSON.stringify(value,null,2)+"\n");
const exportBytes=await readFile(join(review,"checked-export.json"));
const checked=await validateCheckedBook(book,JSON.parse(exportBytes.toString("utf8")));
const prior=await readFile(join(output,"knowledge-bundle.json"),"utf8").then(s=>normaliseBundle(JSON.parse(s))).catch(async e=>{
  if(e.code!=="ENOENT")throw e;
  return normaliseBundle(JSON.parse(await readFile(join(book,"rag/knowledge-bundle.json"),"utf8")));
});
const prepared=prepareReviewedBook(checked,prior),bundle=prepared.bundle,hash=contentHash(bundle);
await save("checked-export.json",checked);
await save("knowledge-bundle.json",bundle);
await save("item-unit-map.json",prepared.itemUnits);
await save("exclusion-list.json",{wholeBookComplete:false,sourceCoverage:checked.sourceCoverage,
  unresolved:checked.exclusions,uncheckedLines:checked.regionReview,checkedFragmentsWithheld:prepared.withheld});
const report={state:"validated_checked_partial_publication_held",bookComplete:false,bundleHash:hash,checkedExportSha256:fileSha(exportBytes),
  reviewSummary:checked.summary,includedUnits:prepared.units.length,passages:bundle.items.length,
  includedByType:Object.fromEntries(["ocr_text","checked_table","figure_description"].map(type=>[type,bundle.items.filter(i=>i.kind==="passage"&&i.contentType===type).length])),
  includedCharacters:prepared.units.reduce((n,u)=>n+Array.from(u.text).length,0),withheldShortOrDuplicateUnits:prepared.withheld.length,
  allTextArtifactImageAndPdfHashesVerified:true,allCurrentDecisionFilesBound:true,rawFallback:false,
  publicationGatesUnchanged:true,rightsBasis:bundle.sources[0].rightsBasis,fullBookCoverage:bundle.sources[0].fullBookCoverage,
  providerRequests:0,pineconeRequests:0,location:output};
await save("preparation-report.json",report);
if(command==="prepare"){console.log(JSON.stringify(report));process.exit(0);}
const pool=mysql.createPool({socketPath:resolve(".mira-local-data/connected-review/db.sock"),user:"root",database:"mira_connected_review",connectionLimit:1,connectTimeout:5000});
const repo=createKnowledgeRepository(drizzle(pool));
try{
  const before=await repo.status(),activeBefore=await repo.publishedSnapshot();
  const priorRelease=before.activeReleaseId?(await repo.inspect(before.activeReleaseId)).release:null;
  // Publication replaces a snapshot, so retain the entire active catalogue in
  // the prospective release. Do not silently overwrite an existing book version.
  const activeBundle=priorRelease?.bundle;
  if(activeBundle?.sources.some(s=>bundle.sources.some(b=>b.id===s.id)))throw new Error("Active book source already exists; reconcile its versions before importing.");
  const merged=normaliseBundle({formatVersion:1,sources:[...(activeBundle?.sources??[]),...bundle.sources],items:[...(activeBundle?.items??[]),...bundle.items]});
  const staged=await repo.importDraft(1,merged,before.revision),inspected=await repo.inspect(staged.releaseId);
  if(inspected.release.status!=="draft"||contentHash(inspected.release.bundle)!==contentHash(merged))throw new Error("Checked import SQL readback mismatch.");
  const actual=await repo.publishedSnapshot(),after=await repo.status();
  if(after.activeReleaseId!==before.activeReleaseId||contentHash(actual.items)!==contentHash(activeBefore.items)||contentHash(actual.sources)!==contentHash(activeBefore.sources))throw new Error("Draft import changed existing active knowledge.");
  const bookIds=new Set(bundle.items.map(i=>i.id));
  if(actual.items.some(i=>bookIds.has(i.id)))throw new Error("Publication-held book leaked into active snapshot.");
  const storedBook=inspected.release.bundle.items.filter(i=>bookIds.has(i.id));
  if(contentHash(storedBook)!==contentHash(bundle.items))throw new Error("Stored source passages changed.");
  const probes=[
    {kind:"text",unit:"d02665",question:"Why did Levi Strauss’s Tailored Classics suits fail to achieve their sales goals?",expected:"lack of fit between",answer:"The checked passage identifies target-market, distribution and product-design problems, and especially the lack of fit between Levi’s informal, rugged, outdoor image and its suit image."},
    {kind:"table",unit:"t14",question:"In Figure 10-1, which proposed Planters extensions have an average scale rating of 9?",expected:"Snack mixes, nuts for baking",answer:"Snack mixes and nuts for baking. The source displays an explicit dash at rating 8; no extension is inferred there."},
    {kind:"figure",unit:"f033",question:"How many stages and transitions are shown in the branding funnel?",expected:"Consecutive arrow transitions are 72%, 46%, 58%, 50% and 56%.",answer:"Six stages: Aware, Ever Tried, Recent Trial, Occasional Use, Regular Use, Most Often Use. Five consecutive transitions: 72%, 46%, 58%, 50%, 56%."}
  ];
  const tests=probes.map(p=>{
    const items=storedBook.filter(i=>prepared.itemUnits[i.id]===p.unit);
    if(!items.length||items.some(i=>i.kind!=="passage"||i.quality!=="verified"))throw new Error("Probe lacks checked source passage: "+p.unit);
    const texts=items.map(i=>i.kind==="passage"?i.content:"");
    if(p.expected&&!texts.some(t=>t.includes(p.expected)))throw new Error("Probe expected source wording absent: "+p.unit);
    const live=retrieveExpertise(actual,{message:p.question,segment:"personal_brand",language:"en"});
    if(live.cards.some(c=>bookIds.has(c.item.id)))throw new Error("Held book retrieved as approved knowledge.");
    return {...p,offlineStoredSourceCheck:"passed",sourcePassages:items.map(i=>({id:i.id,content:i.kind==="passage"?i.content:"",sourceRefs:i.sourceRefs,provenance:i.kind==="passage"?i.provenance:null})),
      liveRetrievalStatus:live.status,liveBookMatches:0,answerTest:"not_run_publication_blocked"};
  });
  const problems=inspected.publicationProblems,byReason:Record<string,number>={};
  for(const p of problems){const key=p.split(":")[0];byReason[key]=(byReason[key]??0)+1;}
  const receipt={...staged,state:"checked_partial_imported_as_unpublished_draft",wholeBookComplete:false,published:false,
    storedBookPassages:storedBook.length,existingItemsPreserved:activeBundle?.items.length??0,activeReleaseUnchanged:true,activeBookMatches:0,
    publicationProblems:byReason,publicationProblemCount:problems.length,positiveLiveBookRetrieval:"blocked_by_existing_rights_and_full_coverage_checks",
    verificationScope:"Actual existing local SQL import/readback and published-snapshot retriever; no fake published snapshot, live answer call or remote Pinecone request.",
    externalDriveRequiredForStoredTextRetrieval:false,externalDriveRequiredForOriginalScanReview:true,providerRequests:0,pineconeRequests:0};
  await save("publication-problems.json",problems);
  await save("retrieval-checks.json",tests);
  await save("staged-release.json",receipt);
  await save("verification.json",receipt);
  console.log(JSON.stringify({...receipt,output}));
}finally{await pool.end();}
