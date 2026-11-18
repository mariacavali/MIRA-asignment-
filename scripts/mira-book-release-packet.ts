import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
import mysql from "mysql2/promise";
import {drizzle} from "drizzle-orm/mysql2";
import {normaliseBundle,contentHash,entryKey} from "../server/miraKnowledge/schema";
import {publicationProblems} from "../server/miraKnowledge/publish";
import {createKnowledgeRepository} from "../server/miraKnowledge/repository";
import {INCOMPLETE_BOOK_LABEL,type KnowledgeReviews} from "../shared/miraKnowledge";

// Reuses saved reviews; validates/prepares only. No OCR, models, remote client,
// catalogue mutation, permission attestation, publication or invented approval.
const work=resolve("../brands/mira/work/2026-10_full-book-ingestion"),base=join(work,"whole-book-information"),prep=join(work,"publication-preparation-2026-10-31"),out=join(prep,"seed-preparation");
const read=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
const save=async(name:string,value:unknown)=>writeFile(join(out,name),JSON.stringify(value,null,2)+"\n",{mode:0o600});
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const original=normaliseBundle(await read(join(base,"knowledge-bundle.json"))),candidate=normaliseBundle(await read(join(prep,"checked-incomplete-candidate-bundle.json")));
const receipt=await read(join(base,"import-verification.json")),acceptance=await read(join(prep,"incomplete-coverage-acceptance.json"));
const previousCases=await read(join(prep,"offline-passage-evaluations.json")),nextCases=await read(join(prep,"candidate-passage-evaluations.json"));
const reviews:KnowledgeReviews=(await read(join(prep,"candidate-item-review-records.json"))).reviews;
const originalCases=new Map<string,any>(previousCases.cases.map((c:any)=>[c.itemId,c])),cases=new Map<string,any>(nextCases.cases.map((c:any)=>[c.itemId,c]));
const units=await read(join(base,"information-bundle.json")),unitById=new Map<string,any>(units.units.map((u:any)=>[u.id,u]));
const unitMap:Record<string,string>=await read(join(base,"item-unit-map.json"));
if(contentHash(original)!==receipt.bundleHash||acceptance.bundleHash!==receipt.bundleHash||candidate.items.length!==3229||original.items.length!==3229)throw new Error("Saved draft/candidate identity changed.");
if(contentHash(candidate)!==nextCases.bundleHash||previousCases.bundleHash!==contentHash(original))throw new Error("Evaluation bundle identity changed.");
for(const ref of acceptance.manifestReferences)if(sha(await readFile(ref.path))!==ref.sha256)throw new Error("Accepted exclusion/source manifest changed.");
const partial=candidate.sources[0].checkedPartialPublication;
if(!partial||partial.bookComplete!==false||partial.sourceVersion!==candidate.sources[0].version
  ||sha(await readFile(partial.exclusions.manifest))!==partial.exclusions.sha256
  ||contentHash(candidate.sources[0].fullBookCoverage)!==contentHash(original.sources[0].fullBookCoverage))throw new Error("Incomplete coverage or exclusions changed.");
const originalById=new Map(original.items.map(i=>[i.id,i])),represented=new Set<string>();
for(const item of candidate.items){
  const before=originalById.get(item.id),c=cases.get(item.id),old=originalCases.get(item.id),review=reviews[entryKey(item.kind,item)],unit=unitById.get(unitMap[item.id]);
  if(item.kind!=="passage"||before?.kind!=="passage"||item.content!==before.content||contentHash(item.provenance)!==contentHash(before.provenance)
    ||item.sourceRefs[0].locator!==before.sourceRefs[0].locator||!item.sourceRefs[0].locator.includes("Fourth Edition")
    ||!item.sourceRefs[0].locator.includes("printed page "+unit?.printedPage)||item.quality!=="verified"||!item.limitations.includes(INCOMPLETE_BOOK_LABEL)
    ||before.limitations.some(l=>!item.limitations.includes(l))||!c||!old||c.itemHash!==contentHash(item)||old.itemHash!==contentHash(before)
    ||c.reusedEvaluation!==old.id||c.outcome!=="passed_reused_source_review_and_offline_provenance_evaluation"
    ||!review?.approved||review.evaluationCaseIds.length!==1||review.evaluationCaseIds[0]!==c.id
    ||(unit.excludedDetails??[]).some((l:string)=>!item.limitations.includes(l)))throw new Error("Saved review/content/citation/exclusion mismatch: "+item.id);
  represented.add(unit.id);
}
const types=(t:string)=>[...represented].filter(id=>unitById.get(id).contentType===t).length;
if(types("checked_table")!==53||types("figure_description")!==349)throw new Error("Missing structured source units.");
const problems=publicationProblems(candidate,reviews,new Set());
if(problems.length!==1||problems[0]!=="Source not cleared: "+entryKey("source",candidate.sources[0]))throw new Error("Unexpected candidate blocker state.");
const pool=mysql.createPool({socketPath:resolve(".mira-local-data/connected-review/db.sock"),user:"root",database:"mira_connected_review",connectionLimit:1,connectTimeout:5000});
try{
  const repo=createKnowledgeRepository(drizzle(pool)),stored=await repo.inspect(receipt.releaseId),active=await repo.publishedSnapshot();
  if(stored.release.hash!==contentHash(original)||contentHash(stored.release.bundle)!==contentHash(original)||stored.release.status!=="draft")throw new Error("Stored original draft changed.");
  for(const item of original.items){const review=stored.release.reviews[entryKey(item.kind,item)],c=originalCases.get(item.id);
    if(!review?.approved||!review.reviewer.trim()||!review.at||!review.evaluationCaseIds.includes(c.id))throw new Error("Missing actual saved catalogue review.");}
  await mkdir(out,{recursive:true,mode:0o700});
  await save("knowledge-bundle.json",candidate);
  await save("preparation-report.json",{bundleHash:contentHash(candidate),state:"awaiting_real_source_permission",bookComplete:false,passages:3229,tableUnits:53,visualUnits:349,originalDraftReleaseId:receipt.releaseId,providerRequests:0});
  await save("review-proposals.json",candidate.items.map(i=>({kind:i.kind,ref:{id:i.id,version:i.version},reason:reviews[entryKey(i.kind,i)].reason,evaluationCaseIds:reviews[entryKey(i.kind,i)].evaluationCaseIds})));
  await save("evaluation-cases.json",nextCases.cases);
  await save("offline-evaluation.json",nextCases.cases.map((c:any)=>({id:c.id,itemId:c.itemId,individualTitleContextAndCitation:"passed",basis:"Reused source review and exact saved content/provenance/citation/exclusion validation; not live model quality",liveAnswerVerified:false})));
  const probes=await read(join(work,"review/final-audit-2026-10-30/live-evaluation-cases-pending.json"));
  await save("search-probes.json",probes.map((p:any)=>{
    const item=candidate.items.find(i=>unitMap[i.id]===p.sourceUnit&&i.kind==="passage"&&i.content.includes(p.requiredSourceClaim));
    if(!item)throw new Error("Missing positive source probe.");return {itemId:item.id,query:p.question};
  }));
  await save("answer-probes.json",probes);
  await save("seed-scope.json",{currentScope:"checked_available_book",bookComplete:false,notesOnlySeed:"not_used",preserveAllPassages:3229,rightsRequired:true,paidSpendingUsd:0});
  const result={checkedAt:new Date().toISOString(),state:"all_saved_book_preparation_validated_waiting_real_permission",originalDraftReleaseId:receipt.releaseId,
    catalogueRevision:stored.revision,currentDraftReviewsVerified:3229,candidateReviewsReused:3229,passageBodiesAndProvenancePreserved:3229,
    tableUnits:53,visualUnits:349,exactEditionPrintedPdfCitationsVerified:true,explicitExclusionsVerified:true,acceptanceManifestHashesVerified:true,
    candidateBlockers:problems,sourceReviewProposalCreated:false,candidateImported:false,activeItemsUnchanged:active.items.length,
    existingPipeline:"scripts/mira-knowledge-first-seed.ts",preparedWorkspace:out,
    stageHeldBeforeDatabaseMutation:true,namespace:null,published:false,paidSpendingUsd:0};
  await save("packet-validation.json",result);console.log(JSON.stringify(result));
}finally{await pool.end();}
