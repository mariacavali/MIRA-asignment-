import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const base='http://127.0.0.1:5185';
const headers={origin:base,'content-type':'application/json'};
async function get(path){const r=await fetch(base+path);if(!r.ok)throw Error('Read failed: '+r.status);return r.json()}
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json();return {status:r.status,data:d}}
const state=await get('/api/state'),sessions=[];
for(const configurationId of ['a-baseline','c2-mira-method']){
 const created=await post('/api/sessions',{configurationId,scenarioId:'visual-direction',engine:'openai'});if(created.status!==200)throw Error(JSON.stringify(created));
 const s=created.data;
 const r=await post(`/api/sessions/${s.id}/turns`,{requestId:randomUUID(),message:state.scenarios.find(s=>s.id==='visual-direction').retrievalProbe,generate:false});if(r.status!==200)throw Error(JSON.stringify(r));
 const turn=r.data.turns[0];
 if(configurationId==='a-baseline'&&turn.references.status!=='disabled')throw Error('Baseline retrieval enabled');
 if(configurationId==='c2-mira-method'&&!turn.references.cards.some(c=>c.item.id==='mira-visual-translation'))throw Error('Expected own-method reference missing');
 await post(`/api/sessions/${s.id}/feedback`,{turnId:turn.id,clarity:null,relevance:null,followUpQuality:null,factualGrounding:null,avoidsUnsupportedAssumptions:null,naturalApplication:null,notes:'Implementation verification session: local retrieval only. No generated answer; answer quality is unassessed.'});
 const exported=await get(`/api/sessions/${s.id}/export`);if(exported.session.feedback.length!==1)throw Error('Feedback did not persist');
 sessions.push({id:s.id,configurationId,comparisonKey:s.comparisonKey,knowledgeHash:s.knowledgeHash,trace:turn.references,feedbackPersisted:true,answer:turn.answer});
}
if(sessions[0].comparisonKey!==sessions[1].comparisonKey)throw Error('Frozen settings mismatch');
const blocked=await post('/api/sessions',{configurationId:'b-holt-ch2',scenarioId:'unclear-offer',engine:'openai'});if(blocked.status!==400)throw Error('Holt hold missing');
const denied=await post(`/api/sessions/${sessions[0].id}/turns`,{requestId:randomUUID(),message:'Hello',generate:true});if(denied.status!==400)throw Error('Paid gate missing');
const output=resolve('../brands/mira/work/2026-11_knowledge-lab');await mkdir(output,{recursive:true});
const report={at:new Date().toISOString(),url:base,sessions,localStatus:state.localStatus,paidStatus:state.paidStatus,blockedHolt:blocked.data.error,unapprovedGenerationDenied:denied.data.error,providerCalls:0,pineconeCalls:0,answerQuality:'Not tested: no generated answers',catalogue:'Read-only status confirms revision 3285, no active release, zero active items'};
await writeFile(join(output,'runtime-smoke.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({url:base,sessions:sessions.map(s=>({id:s.id,configurationId:s.configurationId,status:s.trace.status,selected:s.trace.cards.map(c=>c.item.id)})),localStatus:state.localStatus,paidAuthorised:state.paidStatus.authorised,feedbackPersisted:true,providerCalls:0,pineconeCalls:0},null,2));
