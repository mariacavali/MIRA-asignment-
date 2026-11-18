import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// One exact authorised comparison. No key access, provider calls, retries,
// model substitution, catalogue writes or Pinecone connection in this runner.
const root = resolve('.mira-local-data/knowledge-lab');
const work = '/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_knowledge-lab';
const host = 'http://127.0.0.1:5185';
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v);
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const save = async (p,v) => { const tmp=p+'.'+randomUUID()+'.tmp'; await writeFile(tmp,JSON.stringify(v,null,2)+'\n',{mode:0o600}); await rename(tmp,p); };
async function get(path) { const r=await fetch(host+path,{signal:AbortSignal.timeout(110000)}); const d=await r.json(); if(!r.ok)throw new Error(`Local HTTP ${r.status}: ${d.error}`); return d; }
const packet=await read(join(work,'comparison-for-approval.json'));
const freshAfterAuth=process.argv.includes('--fresh-after-authentication');
const auth=await read(join(work,'credential-diagnosis.json'));
assert.equal(auth.authentication,'accepted','A successful separate authentication check is required before any allowance is opened.');
assert.equal(auth.exactModelAccessible,true);
assert.ok(Date.now()-Date.parse(auth.checkedAt)<300000,'Repeat the read-only authentication check; the saved check is more than five minutes old.');
assert.equal((await stat(resolve('.env'))).mtime.toISOString(),auth.fileModifiedAt,'Credential configuration changed after authentication check.');
let renewedApproval=null;
if(freshAfterAuth){
 renewedApproval=await read(join(work,'fresh-comparison-approval-pending-auth.json'));
 assert.equal(renewedApproval.status,'approved_pending_successful_authentication_not_activated');
 assert.equal(renewedApproval.maximumTextRequests,10);assert.equal(renewedApproval.maximumUsd,0.20);
 assert.equal(renewedApproval.model,packet.proposal.model);
 assert.deepEqual(renewedApproval.sessions,packet.pair.map(p=>p.id));
 assert.equal((await read(join(root,'lab-paid-approval.json'))).approved,false);
}
const state=await get('/api/state');
assert.equal(hash(state.paidProposal),hash(packet.proposal));
assert.equal(hash(state.comparisonJourney),packet.proposal.comparisonJourneyHash);
assert.equal(state.engines.openai.model,'gpt-5-mini-2025-08-07');
assert.equal(packet.pair.length,2); assert.equal(packet.matchedClientMessages.length,5);
for(const p of packet.pair){
 const s=await get('/api/sessions/'+p.id);
 if(freshAfterAuth){assert.equal(s.turns.length,1);assert.equal(s.turns[0].state,'failed');assert.equal(s.turns[0].usage?.providerErrorCode,'invalid_api_key');assert.equal(s.turns[0].client,packet.matchedClientMessages[0]);}
 else assert.equal(s.turns.length,0,'Prepared sessions must remain fresh; runner cannot resume or repeat calls.');
 assert.equal(s.knowledgeHash,p.knowledgeHash); assert.equal(s.protocolHash,p.protocolHash);
 assert.equal(s.protocolHash,state.protocolHash); assert.equal(s.comparisonKey,p.comparisonKey);
 assert.deepEqual(s.modelProfile,p.modelProfile);
 const v=state.versions.find(v=>v.id===s.configurationId);
 assert.equal(v.hash,p.knowledgeHash); assert.deepEqual(v.issues,[]); assert.ok(v.processing.includes('openai'));
}
const preflightResume=process.argv.includes('--resume-before-dispatch');
let at=new Date().toISOString();
if(preflightResume){
 const previous=await read(join(work,'comparison-run.json'));
 assert.equal(previous.status,'stopped');assert.equal(previous.attempts.length,0);assert.equal(previous.gateStatus.usedRequests,0);
 let usage=null;try{usage=await read(join(root,'provider-usage.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 assert.equal(usage,null,'Cannot resume preflight after any reserved provider call.');
 await writeFile(join(work,'comparison-preflight-failure.json'),JSON.stringify(previous,null,2)+'\n',{flag:'wx',mode:0o600});
 at=previous.approvedAt; // Keep the original window; do not reset or extend allowance.
}
const expiresAt=new Date(Date.parse(at)+7200000).toISOString();
let archive=null;
if(freshAfterAuth){
 archive=join(work,'history','closed-before-'+at.replace(/[:.]/g,'-'));await mkdir(archive,{recursive:true,mode:0o700});
 for(const name of ['comparison-run.json','comparison-approval-receipt.json','comparison-a-baseline.json','comparison-c2-mira-method.json','comparison-results.json','comparison-results.html'])await writeFile(join(archive,name),await readFile(join(work,name)),{flag:'wx',mode:0o600});
 for(const name of ['provider-approval.json','lab-paid-approval.json','provider-usage.json'])await writeFile(join(archive,name),await readFile(join(root,name)),{flag:'wx',mode:0o600});
 await save(join(work,'fresh-comparison-approval-pending-auth.json'),{...renewedApproval,status:'activated',activatedAt:at,previousRunArchive:archive});
}
const receipt={status:'authorised_running',approvedAt:at,expiresAt,actor:'Maria Cavali',approvalText:renewedApproval?.approvalText??'I approve this exact comparison: at most 10 text requests and $0.20 total. Run both conversations and compare MIRA’s questions, follow-ups and practical direction. Report actual spending and failures. Do not substitute models without approval.',previousRunArchive:archive,model:state.engines.openai.model,maximumRequests:10,maximumUsd:0.20,proposalHash:hash(state.paidProposal),protocolHash:state.protocolHash,comparisonJourneyHash:hash(state.comparisonJourney),sessions:packet.pair,attempts:[],unknownUsageAttempts:0,measuredCostUsd:0};
// Exclusive creation prevents reactivating or resetting a previous allowance.
await writeFile(join(work,'comparison-run.json'),JSON.stringify(receipt,null,2)+'\n',{flag:preflightResume||freshAfterAuth?'w':'wx',mode:0o600});
const provider={scope:'local-mira-review',approved:true,maxRequests:10,expiresAt,allowedModels:[receipt.model],maxRequestBytes:40000,maxCompletionTokens:1800};
const approval={approved:true,actor:'Maria Cavali — explicit exact-comparison approval in current conversation',approvedAt:at,expiresAt,protocolHash:state.protocolHash,proposalHash:receipt.proposalHash,maximumUsd:0.20,allowedKnowledgeHashes:packet.pair.map(p=>p.knowledgeHash),allowedSessionIds:packet.pair.map(p=>p.id),comparisonJourneyHash:receipt.comparisonJourneyHash};
await writeFile(join(root,'provider-approval.json'),JSON.stringify(provider,null,2)+'\n',{flag:preflightResume||freshAfterAuth?'w':'wx',mode:0o600});
await writeFile(join(root,'lab-paid-approval.json'),JSON.stringify(approval,null,2)+'\n',{flag:preflightResume||freshAfterAuth?'w':'wx',mode:0o600});
await save(join(work,'comparison-approval-receipt.json'),{...receipt,provider,labApproval:approval});
const stopped=new Set();
try {
 assert.equal((await get('/api/state')).paidStatus.authorised,true,'Local approval gate is not active.');
 for(let n=0;n<5;n++) for(const p of packet.pair){
  if(stopped.has(p.id))continue;
  const current=await get('/api/state');
  assert.ok(current.paidStatus.authorised && current.paidStatus.usedRequests<10,'No approved requests remain.');
  assert.ok(receipt.attempts.length<10 && Date.now()<Date.parse(expiresAt));
  assert.ok(receipt.measuredCostUsd+(10-receipt.attempts.length)*0.0161<=0.20,'Conservative shared ceiling exceeded.');
  const attempt={requestId:randomUUID(),sessionId:p.id,configurationId:p.configurationId,turnNumber:n+1,startedAt:new Date().toISOString(),state:'dispatching'};
  receipt.attempts.push(attempt); await save(join(work,'comparison-run.json'),receipt);
  console.log(JSON.stringify({event:'dispatch',configurationId:p.configurationId,turn:n+1,attempt:receipt.attempts.length}));
  try {
   const r=await fetch(host+'/api/sessions/'+p.id+'/turns',{method:'POST',headers:{'content-type':'application/json',origin:host},body:JSON.stringify({requestId:attempt.requestId,message:packet.matchedClientMessages[n],generate:true}),signal:AbortSignal.timeout(110000)});
   const s=await r.json();
   if(!r.ok)throw new Error(`Local HTTP ${r.status}: ${s.error}`);
   const turn=s.turns.find(t=>t.requestId===attempt.requestId); assert.ok(turn);
   Object.assign(attempt,{state:turn.state,error:turn.error,usage:turn.usage,durationMs:turn.durationMs,turnId:turn.id});
   await save(join(work,'comparison-'+p.configurationId+'.json'),s);
   if(turn.state!=='completed')stopped.add(p.id);
  } catch(error) {
   // Read back only: an ambiguous HTTP result never causes a redispatch.
   attempt.state='transport_failed'; attempt.error=String(error);
   stopped.add(p.id);
   try { const s=await get('/api/sessions/'+p.id); await save(join(work,'comparison-'+p.configurationId+'.json'),s); const t=s.turns.find(t=>t.requestId===attempt.requestId); if(t)Object.assign(attempt,{savedState:t.state,usage:t.usage,error:t.error??attempt.error}); } catch {}
  }
  attempt.finishedAt=new Date().toISOString();
  receipt.measuredCostUsd=receipt.attempts.reduce((a,x)=>a+(x.usage?.estimatedCostFromMeasuredTokensUsd??0),0);
  receipt.unknownUsageAttempts=receipt.attempts.filter(x=>!Number.isFinite(x.usage?.estimatedCostFromMeasuredTokensUsd)).length;
  await save(join(work,'comparison-run.json'),receipt);
  console.log(JSON.stringify({event:'result',...attempt,measuredCostUsd:receipt.measuredCostUsd}));
 }
 receipt.status=receipt.attempts.filter(a=>a.state==='completed').length===10?'completed':'finished_with_failures';
} catch(error) { receipt.status='stopped';receipt.error=String(error); }
finally {
 receipt.finishedAt=new Date().toISOString();
 receipt.completedAnswers=receipt.attempts.filter(a=>a.state==='completed').length;
 receipt.gateStatus=(await get('/api/state').catch(()=>({paidStatus:null}))).paidStatus;
 await save(join(root,'lab-paid-approval.json'),{...approval,approved:false,closedAt:receipt.finishedAt,closureReason:'This exact comparison has finished or stopped; no retries or further calls authorised.'});
 receipt.allowanceClosed=true;
 await save(join(work,'comparison-run.json'),receipt);
 console.log(JSON.stringify({event:'finished',status:receipt.status,attempts:receipt.attempts.length,completedAnswers:receipt.completedAnswers,measuredCostUsd:receipt.measuredCostUsd,unknownUsageAttempts:receipt.unknownUsageAttempts,allowanceClosed:true}));
}
