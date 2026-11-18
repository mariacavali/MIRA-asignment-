import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {knowledgeBundleSchema} from '../shared/miraKnowledge';
import {contentHash,entryKey} from '../server/miraKnowledge/schema';
import {publicationProblems} from '../server/miraKnowledge/publish';
import {labVersionSchema,eligibility,localRetrieve,labMessages,LAB_POLICY,COMPARISON_JOURNEY,protocol,protocolHash,paidProposal} from '../server/miraKnowledgeLab/core';

const work='/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-11_cleared-knowledge';
const root=join(work,'runtime');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=async(p:string,d:unknown)=>writeFile(p,JSON.stringify(d,null,2)+'\n',{mode:0o600});
await mkdir(join(root,'sessions'),{recursive:true,mode:0o700});
const bundle=knowledgeBundleSchema.parse(await read(join(work,'eligible-knowledge-bundle.json')));
const at=new Date().toISOString();
const cases=[
 ['clear-evidence','The client statement and observed material disagree. Separate inference from confirmation.','mira-cleared-evidence'],
 ['clear-visuals','Translate confirmed direction into visual choices: light, texture, composition and framing.','mira-cleared-visuals'],
 ['clear-stage','An established brand has confirmed assets to preserve and a precise mismatch. Must we redesign it?','mira-cleared-stage'],
 ['clear-shots','Specify priority shots for the photographer, formats, framing and intended uses.','mira-cleared-shots'],
 ['clear-behaviour','A proposed brand quality is a vague adjective. What concrete behaviour or decision supports it?','mira-cleared-behaviour'],
 ['clear-opening','Choose an optional opening about the offer or misunderstanding, then follow the person’s story.','mira-cleared-opening'],
 ['clear-interview','Ask neutral interview questions about actual experiences and concrete stories; use a flexible discussion guide.','gds-cleared-interview'],
 ['clear-analysis','Separate observations, findings and proposed actions in research notes.','gds-cleared-analysis'],
 ['clear-needs','Learn actual user needs and describe the problem before choosing a solution.','gds-cleared-needs'],
 ['excluded-resonance','Explain Keller’s resonance pyramid, its six blocks and the brand value chain.',null],
 ['excluded-table','Reproduce Pearson Keller’s distinctive comparison table and chapter examples.',null],
 ['unsupported-sales','What exact percentage sales increase will a new logo produce next month?',null],
] as const;
const reviews:Record<string,any>={},hashes:Record<string,string>={};
for(const [kind,values] of [['source',bundle.sources],['card',bundle.items]] as const)for(const value of values){
 const key=entryKey(kind,value);hashes[key]=contentHash(value);
 reviews[key]={actorUserId:1,reviewer:'Codex source-level review, not a recorded human publication approval',at,approved:true,reason:kind==='source'?'Selected primary project provenance or specific OGL-covered GDS prose verified in evidence register; no book-derived records imported.':'Checked against the exact cited primary section; qualifications, evidence needs and limitations retained. Eligible for this unpublished bounded comparison only.',evaluationCaseIds:kind==='source'?[]:[cases.find(c=>c[2]===value.id)![0]]};
}
const artifactBindings=await Promise.all(['eligible-knowledge-bundle.json','evidence/mira-method.json','evidence/mira-questions.json','evidence/licence-verification.json','source-acknowledgement.txt'].map(async name=>({path:join(work,name),sha256:createHash('sha256').update(await readFile(join(work,name))).digest('hex')})));
const baseline=labVersionSchema.parse({id:'a-baseline',version:1,label:'A · No retrieved knowledge',parent:null,processing:['local','openai'],blockedReason:null,bundle:null,reviews:{},reviewedEntryHashes:{},evaluationCaseIds:[],artifactBindings:[],notes:'Fresh baseline; same model, policy, fictional client messages and wire format as cleared condition.'});
const cleared=labVersionSchema.parse({id:'c2-mira-method',version:2,label:'C · Nine cleared entries from primary sources',parent:'a-baseline',processing:['local','openai'],blockedReason:null,bundle,reviews,reviewedEntryHashes:hashes,evaluationCaseIds:cases.map(c=>c[0]),artifactBindings,notes:'Separate runtime and immutable hash. The historical c2 version 1 six-entry collection is preserved in its original runtime. Six selected MIRA method entries + three GDS OGL summaries; zero of the 197 Keller-summary records.'});
assert.deepEqual(eligibility(cleared,'openai'),[]);
const results=cases.map(([id,message,expected])=>{
 const r=localRetrieve(cleared,message,'local');
 const messages=labMessages({policy:LAB_POLICY,message,history:[],clientInfo:COMPARISON_JOURNEY.clientInfo,references:r});
 assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<=24000);
 for(const card of r.cards){assert.ok(bundle.items.some(i=>i.id===card.item.id));assert.ok(card.citations.length);assert.ok(card.item.limitations.length);assert.ok(!card.item.sourceRefs.some(s=>/keller|book-brand-management/i.test(s.id)));}
 return {id,message,expected,returned:r.cards.map(c=>c.item.id),expectedReturned:expected?r.cards.some(c=>c.item.id===expected):null,contextCharacters:messages.reduce((n,m)=>n+m.content.length,0),referenceCharacters:JSON.stringify(r).length,promptHash:contentHash(messages),references:r};
});
const guardResults=[];
const pending=structuredClone(cleared);pending.bundle!.sources[0].rightsBasis='pending';guardResults.push({test:'pending source blocked',pass:eligibility(pending,'openai').length>0});
const mutated=structuredClone(cleared);(mutated.bundle!.items[0] as any).principle+=' altered';guardResults.push({test:'changed entry hash blocked',pass:eligibility(mutated,'openai').some(p=>p.includes('hash changed'))});
guardResults.push({test:'withdrawn source blocked',pass:eligibility(cleared,'openai',new Set([entryKey('source',bundle.sources[0])])).length>0});
const legacy=knowledgeBundleSchema.parse(await read(join(work,'../2026-11_keller-analytical-summary/revision-v2/seed-preparation/local-evaluation/candidate-bundle.unapproved.json')));
guardResults.push({test:'all 197 legacy records rejected without source/review clearance',pass:publicationProblems(legacy,{},new Set(['source:book-brand-management@5'])).length===199});
assert.ok(guardResults.every(g=>g.pass));
await save(join(work,'local-checks.json'),{at,method:'Actual lab localRetrieve and labMessages; lexical ranking, no embedding or model call; exploratory cases chosen for this collection, not held-out quality evidence.',positiveCases:9,positiveTargetReturned:results.filter(r=>r.expectedReturned===true).length,sourceBoundariesPassed:true,guardResults,cases:results,providerRequests:0,localModelTokens:0,pineconeConnected:false});
const old=await read(resolve('.mira-local-data/knowledge-lab/registry.json'));
await writeFile(join(root,'registry.json'),JSON.stringify({format:'mira-isolated-knowledge-lab-v1',createdAt:at,authority:'Maria requested source review, eligible collection and continuation of real conversation comparison on 2026-11-02. Local review only; no production publication.',versions:[baseline,cleared],withdrawnKeys:old.withdrawnKeys},null,2)+'\n',{flag:'wx',mode:0o600});
await save(join(work,'exact-reviews.json'),{reviews,reviewedEntryHashes:hashes,artifactBindings});
await save(join(work,'comparison-frozen-protocol.json'),{at,protocol,protocolHash,proposal:paidProposal,scenario:COMPARISON_JOURNEY,matchedClientMessages:[COMPARISON_JOURNEY.opening,...COMPARISON_JOURNEY.repeatableClientTurns],versions:[baseline,cleared].map(v=>({id:v.id,version:v.version,label:v.label,hash:contentHash(v),itemCount:v.bundle?.items.length??0})),criteriaBeforeGeneration:['Use the actual offer before prescribing a niche.','Preserve confirmed name and green colour; explore the specific mismatch.','Clarify advice/planning versus channel management without inventing an audience.','Give useful visuals tied to explicitly confirmed meaning and formats.','Decline unsupported sales percentages; suggest bounded evidence gathering.','At most one focused follow-up question.','No excluded book records, invented source access or client facts.'],limits:'At most 10 requests, five matched turns in each of two fresh sessions; no automatic retries or substitutions. Prior measured token-derived spending counts toward the existing $0.20 ceiling. No Pinecone or production graph claim.'});
await mkdir(join(root,'public'),{recursive:true});
for(const name of ['lab.js','lab.css'])await copyFile(resolve('server/miraKnowledgeLab/public',name),join(root,'public',name));
let index=await readFile(resolve('server/miraKnowledgeLab/public/index.html'),'utf8');
index=index.replace('<section class="notice">','<section class="notice"><p><a href="/source-acknowledgement.txt">Source acknowledgement and rights scope</a> · Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>.</p>');
index=index.replace('.mira-local-data/knowledge-lab/sessions','2026-11_cleared-knowledge/runtime/sessions');
await writeFile(join(root,'public/index.html'),index);
console.log(JSON.stringify({root,positiveTargetReturned:results.filter(r=>r.expectedReturned===true).length,positiveCases:9,guards:guardResults,knowledgeHash:contentHash(cleared)},null,2));
