import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { parse } from "dotenv";
import { normaliseBundle, contentHash, entryKey } from "../server/miraKnowledge/schema";
import { createKnowledgeRepository } from "../server/miraKnowledge/repository";
import { splitEmbeddingText, PINECONE_BATCH_SIZE, pineconeTarget } from "../server/miraKnowledge/pineconePlan";
import { prepareCheckedIncompleteBook } from "../server/miraKnowledge/checkedIncomplete";
import { publicationProblems } from "../server/miraKnowledge/publish";
import type { KnowledgeReviews } from "../shared/miraKnowledge";

// Existing source checks are reused. No OCR/model, remote client, publication,
// source approval, coverage mutation, migration or DATABASE_URL exists here.
const command=process.argv[2];
if(!["prepare","record-reviews"].includes(command))throw new Error("Use prepare or record-reviews.");
const work=resolve("../brands/mira/work/2026-10_full-book-ingestion");
const input=join(work,"whole-book-information"), output=join(work,"publication-preparation-2026-10-31");
await mkdir(output,{recursive:true,mode:0o700});
const read=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
const save=async(name:string,value:unknown)=>writeFile(join(output,name),JSON.stringify(value,null,2)+"\n",{mode:0o600});
const sha=(text:string|Buffer)=>createHash("sha256").update(text).digest("hex");
const bundle=normaliseBundle(await read(join(input,"knowledge-bundle.json")));
const receipt=await read(join(input,"import-verification.json"));
const information=await read(join(input,"information-bundle.json"));
const map:Record<string,string>=await read(join(input,"item-unit-map.json"));
const bundleHash=contentHash(bundle);
if(bundleHash!==receipt.bundleHash||bundle.items.length!==3229||receipt.published!==false)throw new Error("Unexpected saved book checkpoint.");
const units=new Map<string,any>(information.units.map((u:any)=>[u.id,u]));
const artifactText=new Map<string,string>(),represented=new Set<string>();
for(const unit of units.values()){
  const text=await readFile(join(input,unit.artifact),"utf8");
  if(sha(text)!==unit.artifactSha256||text!==unit.text||unit.quality!=="source_checked")throw new Error("Prepared unit mismatch: "+unit.id);
  if(unit.completePageReview){
    const check=unit.completePageReview;
    if(sha(await readFile(check.checkedText))!==check.checkedTextSha256||check.sourceImageSha256!==unit.sourceImageSha256)throw new Error("Saved page review mismatch: "+unit.id);
  }
  artifactText.set(unit.id,text);
}
const cases=bundle.items.map(item=>{
  if(item.kind!=="passage")throw new Error("Unexpected non-passage item.");
  const unit=units.get(map[item.id]);if(!unit)throw new Error("Unmapped passage.");
  const chars=Array.from(artifactText.get(unit.id)!);
  if(chars.slice(item.provenance.start,item.provenance.end).join("")!==item.content
    ||item.provenance.artifactSha256!==unit.artifactSha256||item.provenance.sourceSha256!==unit.sourceSha256
    ||item.provenance.part!==unit.part||item.provenance.physicalPage!==unit.physicalPage||item.provenance.side!==unit.side
    ||item.quality!=="verified"||item.contentType!==unit.contentType
    ||item.sourceRefs.length!==1||item.sourceRefs[0].version!==bundle.sources[0].version
    ||!item.sourceRefs[0].locator.includes(unit.sourceFile)||!item.sourceRefs[0].locator.includes("printed page "+unit.printedPage)
    ||!item.sourceRefs[0].locator.includes("Fourth Edition")
    ||(unit.excludedDetails??[]).some((detail:string)=>!item.limitations.includes(detail))
    ||(item.contentType==="figure_description")!==(item.authorship==="source_description"))throw new Error("Passage evaluation failed: "+item.id);
  represented.add(unit.id);
  return {id:"keller-source-"+sha(entryKey(item.kind,item)).slice(0,40),itemId:item.id,itemVersion:item.version,
    itemHash:contentHash(item),sourceUnit:unit.id,artifactSha256:unit.artifactSha256,sourceImageSha256:unit.sourceImageSha256,
    sourceCheck:unit.completePageReview?.decisionFile??"Reused checked structured export in information-bundle.json",
    locator:item.sourceRefs[0].locator,excludedDetails:unit.excludedDetails??[],
    outcome:"passed_reused_source_review_and_offline_provenance_evaluation",
    checks:["exact Unicode source slice","saved artifact and review hashes","source PDF/page/edition references","verified transcription quality","authorship distinction","explicit limitations retained"],
    liveRetrieval:"not_tested",answerQuality:"not_tested",rightsApproval:false};
});
for(const unit of units.values())if(unit.text.length&&!represented.has(unit.id))throw new Error("Unrepresented source unit: "+unit.id);
const count=(type:string)=>[...represented].filter(id=>units.get(id).contentType===type).length;
if(count("checked_table")!==53||count("figure_description")!==349)throw new Error("Table/visual unit count changed.");
const accepted=await read(join(output,"incomplete-coverage-acceptance.json"));
if(accepted.bundleHash!==bundleHash||accepted.bookComplete!==false||accepted.authorisesRightsClearance!==false)throw new Error("Unexpected gap acceptance.");
for(const ref of accepted.manifestReferences)if(sha(await readFile(ref.path))!==ref.sha256)throw new Error("Gap acceptance is stale.");
const exclusions=accepted.manifestReferences.find((r:any)=>r.path.endsWith("/exclusion-list.json"));
if(!exclusions)throw new Error("No accepted exclusion manifest.");
const acceptanceAt=new Date(accepted.recordedAt).toISOString();
const candidate=prepareCheckedIncompleteBook(bundle,{bundleHash,actor:accepted.actor,at:acceptanceAt,
  reason:accepted.instruction,evidence:join(output,"incomplete-coverage-acceptance.json"),
  exclusionManifest:exclusions.path,exclusionSha256:exclusions.sha256});
candidate.sources[0].intendedUse="Internal full-information source storage and retrieval-time grounding for original practical guidance with author/title/page attribution. No book-passage reproduction, chapter reconstruction or source-table export to users. Not model training. Pinecone and the configured answer-model provider may process text only under separately documented applicable rights.";
const checkedCandidate=normaliseBundle(candidate),candidateReviews:KnowledgeReviews={};
const candidateCases=checkedCandidate.items.map((item,n)=>{
  const old=bundle.items[n],evaluation=cases[n];
  if(item.kind!=="passage"||old.kind!=="passage"||item.content!==old.content||contentHash(item.provenance)!==contentHash(old.provenance))throw new Error("Candidate lost saved source information.");
  const id="keller-source-"+sha(entryKey(item.kind,item)).slice(0,40);
  candidateReviews[entryKey(item.kind,item)]={actorUserId:1,reviewer:"Codex checked-source and offline provenance review",at:acceptanceAt,
    approved:true,reason:"Reuses "+evaluation.id+"; candidate preserves content/provenance and adds exact accepted incomplete scope. Not rights approval or live verification.",evaluationCaseIds:[id]};
  return {...evaluation,id,itemVersion:item.version,itemHash:contentHash(item),reusedEvaluation:evaluation.id,
    additionalChecks:["passage content and provenance unchanged","exact versioned incomplete scope and label"]};
});
const candidateProblems=publicationProblems(checkedCandidate,candidateReviews,new Set());
if(candidateProblems.length!==1||!candidateProblems[0].startsWith("Source not cleared:"))throw new Error("Candidate has an unexpected unprepared publication requirement.");
await save("checked-incomplete-candidate-bundle.json",checkedCandidate);
await save("candidate-passage-evaluations.json",{state:"offline_candidate_not_imported_no_source_approval",bundleHash:contentHash(checkedCandidate),cases:candidateCases});
await save("candidate-item-review-records.json",{state:"prepared_not_recorded_in_catalogue",reviews:candidateReviews});
await save("candidate-readiness.json",{state:"prepared_not_imported_not_published",bundleHash:contentHash(checkedCandidate),sourceVersion:checkedCandidate.sources[0].version,
  passages:checkedCandidate.items.length,structuredTableUnits:53,visualDescriptionUnits:349,bookComplete:false,
  passageBodiesAndProvenanceUnchanged:true,existingFullCoverageClaimsUnchanged:true,sourceRightsUnchanged:true,
  actualOfflineCandidateEvaluations:candidateCases.length,publicationProblemsUnderPreparedItemReviews:candidateProblems,
  sourceApprovalCreated:false,paidCalls:0,requires:"Actual rights evidence/substantive source approval, final immutable import and recorded exact-version item reviews; bounded seed and app verification remain."});
const pool=mysql.createPool({socketPath:resolve(".mira-local-data/connected-review/db.sock"),user:"root",database:"mira_connected_review",connectionLimit:1,connectTimeout:5000});
try{
  const repo=createKnowledgeRepository(drizzle(pool));
  const before=await repo.inspect(receipt.releaseId),liveBefore=await repo.publishedSnapshot();
  if(before.release.status!=="draft"||before.release.hash!==bundleHash||contentHash(before.release.bundle)!==bundleHash)throw new Error("Stored release differs from evaluated draft.");
  await save("offline-passage-evaluations.json",{releaseId:receipt.releaseId,bundleHash,scope:"Reused source review plus offline integrity/context checks; not live retrieval or answer evaluation",cases});
  const proposals=cases.map(c=>({kind:"passage",ref:{id:c.itemId,version:c.itemVersion},evaluationCaseIds:[c.id],
    reason:"Reused completed direct source review of readable text/structured information. Actual offline evaluation "+c.id+" passes exact source slice, provenance, edition/page, authorship and retained exclusions. Not rights approval or live answer verification."}));
  await save("item-review-records.json",proposals);
  let revision=before.revision,recorded=0;
  if(command==="record-reviews")for(const proposed of proposals){
    const existing=before.release.reviews[entryKey(proposed.kind,proposed.ref)];
    if(existing?.approved&&existing.evaluationCaseIds.includes(proposed.evaluationCaseIds[0]))continue;
    const result=await repo.review(1,"Codex checked-source and offline provenance review",{
      releaseId:receipt.releaseId,expectedRevision:revision,kind:"passage",ref:proposed.ref,
      approved:true,reason:proposed.reason,evaluationCaseIds:proposed.evaluationCaseIds});
    revision=result.revision;recorded++;
    if(recorded%100===0)console.log(JSON.stringify({recorded,total:proposals.length,revision,published:false}));
  }
  const after=await repo.inspect(receipt.releaseId),liveAfter=await repo.publishedSnapshot();
  if(liveBefore.releaseId!==liveAfter.releaseId||liveBefore.hash!==liveAfter.hash
    ||contentHash(liveBefore.items)!==contentHash(liveAfter.items)||contentHash(liveBefore.sources)!==contentHash(liveAfter.sources))throw new Error("Active knowledge changed.");
  const reasons:Record<string,number>={};for(const p of after.publicationProblems){const key=p.split(":")[0];reasons[key]=(reasons[key]??0)+1;}
  const env=parse(await readFile(resolve(".env"),"utf8")),target=pineconeTarget(env);
  let records=0,embeddingBytes=0,embeddingCharacters=0;
  for(const item of bundle.items){if(item.kind!=="passage")throw new Error("Expected passage");
    const chunks=splitEmbeddingText(item.content),prefix=splitEmbeddingText(item.title,300)[0]+"\n";
    records+=chunks.length;for(const chunk of chunks){embeddingBytes+=Buffer.byteLength(prefix+chunk);embeddingCharacters+=Array.from(prefix+chunk).length;}}
  const batches=Math.ceil(records/PINECONE_BATCH_SIZE),approvedItems=bundle.items.filter(item=>after.release.reviews[entryKey(item.kind,item)]?.approved).length;
  const result={checkedAt:new Date().toISOString(),releaseId:receipt.releaseId,bundleHash,revision:after.revision,
    releaseState:after.release.status,passages:bundle.items.length,structuredTableUnits:count("checked_table"),visualDescriptionUnits:count("figure_description"),
    offlineEvaluationsPassed:cases.length,itemReviewRecordsApproved:approvedItems,newReviewRecordsWritten:recorded,
    publicationBlockerCount:after.publicationProblems.length,publicationBlockers:reasons,
    sourceKey:entryKey("source",bundle.sources[0]),rightsBasis:bundle.sources[0].rightsBasis,rightsEvidence:bundle.sources[0].rightsEvidence,
    fullBookCoverage:bundle.sources[0].fullBookCoverage,activeReleaseUnchanged:true,activeReleaseId:liveAfter.releaseId,activePassages:liveAfter.items.length,
    configuredTarget:target,liveIndexVerified:false,liveNamespace:null,seeded:false,
    capacityOnlyNotExecutableSeedPlan:{records,batches,embeddingBytes,embeddingCharacters,
      estimatedEmbeddingTokensAtFourCharactersPerToken:Math.ceil(embeddingCharacters/4),exactProviderTokens:"unknown until tokenizer/provider measurement",
      fitsExisting6400Record200BatchLimits:records<=6400&&batches<=200,
      proposedMaximumWriteRequests:batches,proposedMaximumReadRequests:Math.min(400,batches*2+20),
      namespace:"not allocated; rights/coverage changes alter corpus identity"},
    approvalEnvelopeCreated:false,approvedPaidCostLimitUsd:0,freeQuotaRemainingVerified:false,
    paidProviderRequests:0,pineconeRequests:0,published:false,bookComplete:false};
  await save("publication-readiness.json",result);await save("publication-problems.json",after.publicationProblems);
  console.log(JSON.stringify(result));
}finally{await pool.end();}
