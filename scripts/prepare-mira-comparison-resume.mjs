import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Preparation only. Does not read secrets, open an allowance or call a provider.
const work='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_knowledge-lab';
const root=resolve('.mira-local-data/knowledge-lab');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const packet=await read(join(work,'comparison-for-approval.json'));
const run=await read(join(work,'comparison-run.json'));
const auth=await read(join(work,'credential-diagnosis.json'));
const closed=await read(join(root,'lab-paid-approval.json'));
const usage=await read(join(root,'provider-usage.json'));
assert.equal(closed.approved,false);assert.equal(run.allowanceClosed,true);
assert.equal(usage.count,2);assert.equal(run.completedAnswers,0);
const pair=[];
for(const p of packet.pair){
 const s=await read(join(root,'sessions',p.id+'.json'));
 assert.equal(s.knowledgeHash,p.knowledgeHash);assert.equal(s.protocolHash,p.protocolHash);
 assert.deepEqual(s.modelProfile,p.modelProfile);assert.equal(s.turns.filter(t=>t.state==='completed').length,0);
 assert.equal(s.turns.length,1);assert.equal(s.turns[0].state,'failed');
 pair.push({...p,preservedFailureIds:s.turns.map(t=>t.id),successfulAnswers:0,clientMessagesRemaining:packet.matchedClientMessages});
}
const plan={status:'prepared_blocked_authentication_and_fresh_spending_approval',preparedAt:new Date().toISOString(),generationRequestsMadeByPreparation:0,model:packet.proposal.model,proposedNewMaximumRequests:10,proposedNewMaximumUsd:0.20,conservativeEstimateUsd:packet.proposal.conservativeEstimateUsd,maxCompletionTokens:1800,maxRequestBytes:40000,automaticRetry:false,modelFallback:false,authentication:auth.authentication,authenticationCheck:auth.checkedAt,credentialSource:auth.credentialSource,keyChanged:false,previousAllowance:{closed:true,attempts:usage.count,completedAnswers:0,knownUsageCostUsd:0,actualBillingTotal:'unverified; both HTTP 401 responses omitted token usage',usagePreserved:true},freshSpendingApprovalRequired:true,reason:'The previous allowance was expressly closed after two failures. Retrying the first turns and completing both five-turn conversations requires a new explicit allowance; neither correcting a credential nor a read-only authentication check reopens it.',sessions:pair,eligibleSources:packet.eligibleSources.map(s=>({id:s.id,version:s.version,title:s.title})),bookDerivedMaterialIncluded:false,executionPrerequisites:['An accepted read-only authentication check for the intended existing or replacement credential and exact model. A restricted key may require separate permission for model metadata; report that distinction rather than claiming invalidity from a generic 403.','Restart the lab only if its loaded credential has changed. Its current .env was unchanged since before process start.','Fresh explicit approval for the exact model, two saved session IDs, at most 10 new text attempts and $0.20 total for the new run.','Archive the closed run and its two reserved attempts; create a separately identified approval window and audit ledger without erasing prior usage.','Recheck current source bindings, clearance, protocol, knowledge hashes and script before dispatch.','Append new attempts, excluding failed turns from conversation history; no automatic retries, substitutions, publication or Pinecone calls.']};
await writeFile(join(work,'comparison-resume-plan.json'),JSON.stringify(plan,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:plan.status,model:plan.model,authentication:plan.authentication,freshSpendingApprovalRequired:true,previousAttemptsPreserved:usage.count,newProviderRequests:0}));
