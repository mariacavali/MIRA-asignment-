import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('.mira-local-data/knowledge-lab');
const work='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_knowledge-lab';
const url='http://127.0.0.1:5185';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`:JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const save=async(p,v)=>{const tmp=p+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(v,null,2)+'\n',{mode:0o600});await rename(tmp,p)};
async function get(path){const r=await fetch(url+path,{signal:AbortSignal.timeout(10000)});assert.ok(r.ok);return r.json()}
const packet=await read(join(work,'comparison-for-approval.json'));
const prior=await read(join(work,'comparison-run.json'));
assert.equal(prior.allowanceClosed,true);assert.equal(prior.attempts.length,2);assert.equal(prior.completedAnswers,0);
assert.equal((await read(join(root,'lab-paid-approval.json'))).approved,false);
const auth=await read(join(work,'credential-diagnosis.json'));
assert.equal(auth.authentication,'accepted');assert.equal((await stat('.env')).mtime.toISOString(),auth.fileModifiedAt);
const state=await get('/api/state'),a=packet.pair.find(x=>x.configurationId==='a-baseline');
assert.equal(hash(state.paidProposal),hash(packet.proposal));assert.equal(state.engines.openai.model,'gpt-5-mini-2025-08-07');
assert.equal(state.protocolHash,a.protocolHash);
const s=await get('/api/sessions/'+a.id);
assert.equal(s.turns.length,2);assert.ok(s.turns.every(t=>t.state==='failed'&&!t.answer));
assert.equal(s.knowledgeHash,a.knowledgeHash);assert.equal(s.comparisonKey,a.comparisonKey);
assert.equal(state.versions.find(v=>v.id===a.configurationId).hash,a.knowledgeHash);
const knownPriorCost=prior.measuredCostUsd;assert.ok(knownPriorCost+0.0161<=0.20);
const requestId=randomUUID(),approvedAt=new Date().toISOString(),expiresAt=new Date(Date.parse(approvedAt)+600000).toISOString();
const message=packet.matchedClientMessages[0];
const receipt={status:'approved_pending_dispatch',approvedAt,expiresAt,actor:'Maria Cavali',approvalText:'I approve one diagnostic retry with the same model, capped at $0.0161 within the existing $0.20 total. First inspect the saved failure details and identify the exact validation error. Use the retry only if needed to resolve it. Preserve validation safeguards, keep Keller excluded, and report the cause, result and cumulative cost. Do not make further retries without approval.',reasonNeeded:'Both saved HTTP 200 failures lack raw reply content and field-level issues; the exact validation error cannot be recovered locally.',requestId,sessionId:a.id,model:state.engines.openai.model,maximumNewRequests:1,maximumNewUsd:0.0161,cumulativeMaximumUsd:0.20,knownPriorCostUsd:knownPriorCost,automaticRetries:false,modelFallback:false,bookContentIncluded:false};
const report=join(work,'one-request-diagnostic.json');
await writeFile(report,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
const archive=join(work,'history','before-one-diagnostic-'+approvedAt.replace(/[:.]/g,'-'));await mkdir(archive,{recursive:true,mode:0o700});
for(const name of ['provider-approval.json','lab-paid-approval.json','provider-usage.json'])await writeFile(join(archive,name),await readFile(join(root,name)),{flag:'wx',mode:0o600});
const provider={scope:'local-mira-review',approved:true,maxRequests:1,expiresAt,allowedModels:[receipt.model],maxRequestBytes:40000,maxCompletionTokens:1800};
const approval={approved:true,actor:'Maria Cavali — explicit one diagnostic retry approval in current conversation',approvedAt,expiresAt,protocolHash:state.protocolHash,proposalHash:hash(state.paidProposal),maximumUsd:0.20,allowedKnowledgeHashes:packet.pair.map(p=>p.knowledgeHash),allowedSessionIds:packet.pair.map(p=>p.id),comparisonJourneyHash:hash(state.comparisonJourney),singleDiagnostic:{sessionId:a.id,requestId,messageHash:hash(message),maximumUsd:0.0161},knownPriorCostUsd:knownPriorCost};
await save(join(root,'provider-approval.json'),provider);await save(join(root,'lab-paid-approval.json'),approval);
try{
 const current=await get('/api/state');assert.equal(current.paidStatus.authorised,true);assert.equal(current.paidStatus.maxRequests,1);assert.equal(current.paidStatus.usedRequests,0);
 receipt.status='dispatching';receipt.startedAt=new Date().toISOString();await save(report,receipt);
 console.log(JSON.stringify({event:'single_diagnostic_dispatch',model:receipt.model,maximumRequests:1,maximumUsd:0.0161}));
 const r=await fetch(url+'/api/sessions/'+a.id+'/turns',{method:'POST',headers:{'content-type':'application/json',origin:url},body:JSON.stringify({requestId,message,generate:true}),signal:AbortSignal.timeout(110000)});
 const result=await r.json();if(!r.ok)throw new Error(`Local HTTP ${r.status}: ${result.error}`);
 const turn=result.turns.find(t=>t.requestId===requestId);assert.ok(turn);
 await save(join(work,'diagnostic-session.json'),result);
 Object.assign(receipt,{status:'finished',turnId:turn.id,result:turn.state,error:turn.error,usage:turn.usage,providerValidation:turn.providerResult?.validation??null,replyRetained:!!turn.providerResult,newUsageCostUsd:turn.usage?.estimatedCostFromMeasuredTokensUsd??null,cumulativeUsageCostUsd:turn.usage?.estimatedCostFromMeasuredTokensUsd===undefined?null:knownPriorCost+turn.usage.estimatedCostFromMeasuredTokensUsd});
}catch(error){receipt.status='stopped_without_retry';receipt.error=String(error);try{await save(join(work,'diagnostic-session.json'),await get('/api/sessions/'+a.id))}catch{}}
finally{
 receipt.finishedAt=new Date().toISOString();receipt.gateUsage=await read(join(root,'provider-usage.json'));receipt.allowanceClosed=true;
 await save(join(root,'lab-paid-approval.json'),{...approval,approved:false,closedAt:receipt.finishedAt,closureReason:'The one authorised diagnostic request has finished or stopped; no further requests authorised.'});
 await save(report,receipt);console.log(JSON.stringify(receipt));
}
