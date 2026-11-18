import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {knowledgeBundleSchema} from '../shared/miraKnowledge';
import {contentHash} from '../server/miraKnowledge/schema';
import {coachReplyWireSchema} from '../server/miraCoach/model';
import {clientConstraints,clientBoundaryIssues} from '../server/miraCoach/conversationContext';
import {localRetrieve,labMessages,eligibility,engineProfiles,protocol,protocolHash,comparisonKey,COMPARISON_JOURNEY,paidProposal} from '../server/miraKnowledgeLab/core';
const work='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_mira-comparison-fixes';
const original='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_cleared-knowledge';
const root=join(work,'runtime');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=async(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});
const fileHash=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
const at=new Date().toISOString();
const preserved=await read(join(work,'original-artifacts-manifest.json'));
for(const f of preserved.files)assert.equal(await fileHash(join(original,f.path)),f.sha256,'Original artifact changed: '+f.path);
const corpus=knowledgeBundleSchema.parse(await read(join(original,'eligible-knowledge-bundle.json')));
assert.equal(corpus.items.length,9);assert.equal(corpus.sources.length,5);
assert.equal(await fileHash(join(original,'eligible-knowledge-bundle.json')),await fileHash(resolve('server/miraKnowledgeLab/fixtures/cleared-nine.json')));
await mkdir(join(root,'sessions'),{recursive:true,mode:0o700});
const registry=await read(join(original,'runtime/registry.json'));
for(const v of registry.versions)assert.deepEqual(eligibility(v,'openai',new Set(registry.withdrawnKeys)),[]);
await writeFile(join(root,'registry.json'),JSON.stringify({...registry,createdAt:at,authority:'Separate fixed follow-up preparation requested by Maria. No paid execution approved.'},null,2)+'\n',{flag:'wx',mode:0o600});
await copyFile(join(original,'eligible-knowledge-bundle.json'),join(work,'eligible-knowledge-bundle.json'));

const replay=[];
const failures=[];
for(const id of ['a-baseline','c2-mira-method']){
 const session=await read(join(original,'conversation-'+id+'.json'));
 const v=registry.versions.find((v:any)=>v.id===id);
 const history:{role:'client'|'assistant';content:string}[]=[];
 for(const [index,turn]of session.turns.entries()){
  const references=localRetrieve(v,turn.client,'local',new Set(registry.withdrawnKeys),history);
  const messages=labMessages({policy:protocol.policy,message:turn.client,history,clientInfo:session.scenario.clientInfo,references});
  const boundaries=clientConstraints([...history,{role:'client',content:turn.client}]);
  replay.push({condition:id,turn:index+1,message:turn.client,stage:references.stage,oldEntryIds:turn.references.cards.map((c:any)=>c.item.id),fixedEntryIds:references.cards.map(c=>c.item.id),contextCharacters:messages.reduce((n,m)=>n+m.content.length,0),promptHash:contentHash(messages),boundaries,savedAnswerBoundaryIssues:turn.answer?clientBoundaryIssues(turn.answer,boundaries):null,providerCalls:0});
  if(turn.state==='failed')failures.push({condition:id,turn:index+1,request:turn.requestContract,usage:turn.usage,emptyContent:turn.providerResult.content==='',finishReason:turn.providerResult.finishReason,requestedCapMinusReportedOutputTokens:turn.requestContract.maxCompletionTokens-turn.usage.providerOutputTokens});
  history.push({role:'client',content:turn.client});if(turn.answer)history.push({role:'assistant',content:turn.answer});
 }
}
await save(join(work,'local-replay.json'),{at,method:'Replay current fixed retrieval, prompt packing and boundary checks with saved original client/assistant history. No regenerated or simulated model answers.',sameKnowledgeFileSha256:await fileHash(join(work,'eligible-knowledge-bundle.json')),rows:replay,providerCalls:0});
const config={provider:'openai' as const,apiKey:'not-used',model:engineProfiles.openai.model,maxCompletionTokens:1800,reasoningEffort:'low' as const,oneQuestionAtATime:true,emptyInterviewMetadata:true,separateQuestionField:true};
const wire=(compactReply:boolean)=>({type:'json_schema',json_schema:{name:'mira_coach_reply',strict:true,schema:z.toJSONSchema(coachReplyWireSchema({...config,compactReply}))}});
assert.equal(contentHash(wire(false)),failures[0].request.schemaHash,'Reconstructed legacy wire must match saved schema hash.');
await save(join(work,'empty-response-diagnosis.json'),{
 at,hypothesis:'Shared reasoning/visible output budget and a verbose structured response path can leave no answer. Saved records confirm length termination, not the exact provider-internal cause.',smallestCheck:'Inspect all three requestContract, usage and raw providerResult records; reconstruct legacy wire schema and verify its recorded hash. Replay the saved failures against the adapter locally.',failures,
 confirmedRootCause:'All three successful HTTP calls returned empty length-terminated completions; the adapter collapsed them into invalid_output instead of reporting an output-budget failure. No evidence of local request-byte rejection or missing/truncated model context.',
 uncertainty:'Reported output totals are below the requested 1800 cap. The saved records cannot explain why the provider stopped at those totals. No claim that a larger output allowance is necessary or that the provider defect is fully resolved.',
 fix:'Keep exact model, low reasoning and 1800 cap. Use a two-field, 1200-character visible response contract in the isolated lab; generate unused empty metadata locally. Bound instructions to brief answers. Classify length failures before JSON parsing, preserve usage/raw records, withhold incomplete answers and never retry automatically.',
 schema:{legacyHash:contentHash(wire(false)),fixedHash:contentHash(wire(true)),legacyFormatBytes:Buffer.byteLength(JSON.stringify(wire(false)),'utf8'),fixedFormatBytes:Buffer.byteLength(JSON.stringify(wire(true)),'utf8'),sameModel:true,sameReasoningEffort:true,sameMaxCompletionTokens:1800},
 verification:'Saved failure replays and mocked HTTP/model regressions; live provider recovery remains to be checked only after approval.',
 sources:['https://developers.openai.com/api/docs/guides/token-counting','https://developers.openai.com/api/docs/guides/reasoning']});

const pair=[];
for(const v of registry.versions){
 const session={id:randomUUID(),createdAt:at,updatedAt:at,configurationId:v.id,configurationVersion:v.version,knowledgeHash:contentHash(v),scenario:structuredClone(COMPARISON_JOURNEY),engine:'openai',modelProfile:engineProfiles.openai,protocol,protocolHash,comparisonKey:comparisonKey(COMPARISON_JOURNEY,'openai'),turns:[],feedback:[]};
 await writeFile(join(root,'sessions',session.id+'.json'),JSON.stringify(session,null,2)+'\n',{flag:'wx',mode:0o600});
 pair.push({id:session.id,configurationId:v.id,knowledgeHash:session.knowledgeHash,url:'http://127.0.0.1:5187/?session='+session.id});
}
const codeFiles=['server/miraCoach/conversationContext.ts','server/miraCoach/conversationRules.ts','server/miraCoach/model.ts','server/miraCoach/graph.ts','server/miraCoach/policy.ts','shared/miraKnowledgeRetrieval.ts','server/miraKnowledge/retrieve.ts','server/miraKnowledge/lexical.ts','server/miraKnowledge/pineconeRetrieve.ts','server/miraKnowledge/configuredRetrieve.ts','server/miraKnowledgeLab/core.ts','server/miraKnowledgeLab/app.ts','server/miraKnowledgeLab/public/lab.js'];
const codeBindings=await Promise.all(codeFiles.map(async name=>({path:resolve(name),sha256:await fileHash(resolve(name))})));
await save(join(work,'code-artifact-hashes.json'),codeBindings);
const prior=await read(join(original,'conversation-run.json'));
const proposed={status:'prepared_not_approved',at,comparison:'Matched repeat of the completed A no-RAG versus C nine-cleared-entry comparison. Five exact original client turns per fresh condition. Fixes apply to both conditions. Comparison with the historical run is diagnostic, not a randomized old-vs-new ablation.',pair,protocolHash,proposalHash:contentHash(paidProposal),proposal:paidProposal,maximumRequests:10,maximumAdditionalUsd:0.17,conservativeReserveAdditionalUsd:0.161,priorRecordedTokenDerivedUsd:prior.cumulativeTokenDerivedCostUsd,maximumCumulativeUsdIfApproved:prior.cumulativeTokenDerivedCostUsd+0.17,model:engineProfiles.openai,unchanged:{knowledgeFileSha256:await fileHash(join(work,'eligible-knowledge-bundle.json')),sourceAndEntryVersions:true,clientMessages:[COMPARISON_JOURNEY.opening,...COMPARISON_JOURNEY.repeatableClientTurns],retrievalCharacterBudget:5800,modelContextCharacterBudget:24000,requestBytes:40000,reasoningEffort:'low',maxCompletionTokens:1800},onlyEvaluatedChanges:['Current-client stage routing without assistant advice in retrieval.','Explicit client exclusions retained outside trimmed history, with response validation.','Shorter compact reply contract, output-limit diagnostics and failed-attempt accounting.'],criteriaFrozenBeforeGeneration:['No channel management proposal, including in copy or optional packages, after the exclusion.','Discovery turns do not receive visual/shoot cards.','Visual request receives relevant cleared guidance.','The unsupported sales percentage receives no irrelevant reference or invented number.','No empty/incomplete completion is shown as a successful answer.','One focused follow-up, concise useful advice and respect for supplied information.'],automaticRetries:false,modelSubstitution:false,allowTypedReplies:false,maxAttemptsPerSession:5,allowanceHoursAfterApproval:2,paidRequestsExecutedDuringPreparation:0,codeBindings:'code-artifact-hashes.json',manualTrial:'The same interface supports typed client messages and $0 retrieval previews. A paid unscripted conversation needs a separate explicitly scoped allowance; do not silently consume or change this fixed matched comparison.'};
await save(join(work,'follow-up-proposal.json'),proposed);
await save(join(root,'provider-approval.json'),{approved:false,reason:'Awaiting explicit approval of the prepared follow-up request count and additional cost cap.'});
await save(join(root,'lab-paid-approval.json'),{approved:false,reason:'User explicitly required cost/request presentation before paid execution.'});
await mkdir(join(root,'public'),{recursive:true});
for(const file of ['lab.js','lab.css'])await copyFile(resolve('server/miraKnowledgeLab/public',file),join(root,'public',file));
let index=await readFile(resolve('server/miraKnowledgeLab/public/index.html'),'utf8');
index=index.replace('<section class="notice">','<section class="notice"><p><a href="/fixes-report.html">Fixes and local test results</a> · <a href="/source-acknowledgement.txt">Source acknowledgement</a> · Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>.</p>');
index=index.replace('.mira-local-data/knowledge-lab/sessions','2026-11_mira-comparison-fixes/runtime/sessions');
await writeFile(join(root,'public/index.html'),index);
console.log(JSON.stringify({prepared:pair,unchangedEntries:9,originalArtifactsUnchanged:preserved.files.length,requestCount:10,maximumAdditionalUsd:0.17,conservativeReserveUsd:0.161,paidCalls:0,replayStages:replay.filter(r=>r.condition==='c2-mira-method').map(r=>({turn:r.turn,stage:r.stage,ids:r.fixedEntryIds})),schemaByteSizes:{before:Buffer.byteLength(JSON.stringify(wire(false))),after:Buffer.byteLength(JSON.stringify(wire(true)))}},null,2));
