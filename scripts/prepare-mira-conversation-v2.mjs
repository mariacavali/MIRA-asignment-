import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('.mira-local-data/knowledge-lab'),work='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_knowledge-lab/conversation-v2',parent=resolve(work,'..'),host='http://127.0.0.1:5185';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const canon=v=>Array.isArray(v)?`[${v.map(canon).join(',')}]`:v&&typeof v==='object'?`{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canon(v)}`).join(',')}}`:JSON.stringify(v);
const hash=v=>createHash('sha256').update(canon(v)).digest('hex');
const save=async(p,v)=>{const t=p+'.'+randomUUID()+'.tmp';await writeFile(t,JSON.stringify(v,null,2)+'\n',{mode:0o600});await rename(t,p)};
const api=async(path,body)=>{const r=await fetch(host+path,body===undefined?{}:{method:'POST',headers:{origin:host,'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.ok(r.ok,d.error);return d};
assert.equal((await read(join(root,'lab-paid-approval.json'))).approved,false);
const previous=await read(join(parent,'one-request-diagnostic.json'));assert.equal(previous.cumulativeUsageCostUsd,0.0080125);
const auth=await read(join(parent,'credential-diagnosis.json'));assert.equal(auth.authentication,'accepted');assert.equal((await stat('.env')).mtime.toISOString(),auth.fileModifiedAt);
const state=await api('/api/state');assert.equal(state.engines.openai.model,'gpt-5-mini-2025-08-07');assert.equal(state.engines.openai.reasoningEffort,'low');
for(const [id,count] of [['a-baseline',0],['c2-mira-method',6]]){const v=state.versions.find(v=>v.id===id);assert.deepEqual(v.issues,[]);assert.equal(v.itemCount,count)}
await mkdir(work,{recursive:true,mode:0o700});
await writeFile(join(work,'creation-lock.json'),JSON.stringify({at:new Date().toISOString(),purpose:'One authorised fresh comparison; preparation makes zero generation requests.'}),{flag:'wx',mode:0o600});
const pair=[];for(const configurationId of ['a-baseline','c2-mira-method']){
 const s=await api('/api/sessions',{configurationId,scenarioId:state.comparisonJourney.id,engine:'openai'});
 assert.equal(s.protocol.version,2);assert.equal(s.turns.length,0);assert.equal(s.modelProfile.model,state.engines.openai.model);
 pair.push(s);await save(join(work,configurationId+'.json'),s);
}
assert.equal(pair[0].comparisonKey,pair[1].comparisonKey);assert.equal(hash(pair[0].protocol),hash(pair[1].protocol));assert.equal(hash(pair[0].scenario),hash(pair[1].scenario));
await save(join(root,'protocols',pair[0].protocolHash+'.json'),pair[0].protocol);
const approvedAt=new Date().toISOString(),expiresAt=new Date(Date.parse(approvedAt)+7200000).toISOString();
const archive=join(work,'previous-closed-allowance');await mkdir(archive,{mode:0o700});
for(const n of ['provider-approval.json','lab-paid-approval.json','provider-usage.json'])await writeFile(join(archive,n),await readFile(join(root,n)),{flag:'wx',mode:0o600});
const provider={scope:'local-mira-review',approved:true,maxRequests:10,expiresAt,allowedModels:[state.engines.openai.model],maxRequestBytes:40000,maxCompletionTokens:1800};
const approval={approved:true,actor:'Maria Cavali — explicit latest approval for up to 10 new comparison requests after local conversation fixes',approvedAt,expiresAt,protocolHash:state.protocolHash,proposalHash:hash(state.paidProposal),maximumUsd:0.20,allowedKnowledgeHashes:pair.map(s=>s.knowledgeHash),allowedSessionIds:pair.map(s=>s.id),comparisonJourneyHash:hash(state.comparisonJourney),allowTypedReplies:true,maxTurnsPerSession:5,priorUsageBasedUsd:previous.cumulativeUsageCostUsd};
assert.ok(approval.priorUsageBasedUsd+provider.maxRequests*0.0161<=0.20);
const packet={status:'approved_ready_for_browser_conversations',approvedAt,expiresAt,model:state.engines.openai,protocolHash:state.protocolHash,policy:pair[0].protocol.policy,knowledgeVersions:pair.map(s=>({id:s.id,configurationId:s.configurationId,version:s.configurationVersion,knowledgeHash:s.knowledgeHash,url:host+'/?session='+s.id})),scenario:state.comparisonJourney,matchedMessages:[state.comparisonJourney.opening,...state.comparisonJourney.repeatableClientTurns],priorUsageBasedUsd:approval.priorUsageBasedUsd,maxNewRequests:10,maxCumulativeUsd:0.20,maxEstimatedAdditionalUsd:0.161,typedRepliesPermittedInApprovedSessions:true,automaticRetries:false,modelSubstitution:false,kellerExcluded:true,provider,labApproval:approval,generationRequestsMadeByPreparation:0};
await save(join(work,'approval-and-comparison.json'),packet);await save(join(root,'provider-approval.json'),provider);await save(join(root,'lab-paid-approval.json'),approval);
assert.equal((await api('/api/state')).paidStatus.authorised,true);
console.log(JSON.stringify({status:packet.status,sessions:packet.knowledgeVersions,model:packet.model,priorCost:packet.priorUsageBasedUsd,newRequestsAllowed:10,cumulativeLimitUsd:0.20,newGenerationRequests:0}));
