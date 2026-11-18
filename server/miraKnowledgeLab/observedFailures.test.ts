import {describe,it,expect,vi} from 'vitest';
import observed from './fixtures/observed-failures.json';
import nine from './fixtures/cleared-nine.json';
import {knowledgeBundleSchema} from '../../shared/miraKnowledge';
import {createCoachModel,parseCoachReply,coachReplyWireSchema,buildCoachMessages} from '../miraCoach/model';
import {clientConstraints,clientBoundaryIssues,conversationRetrieval} from '../miraCoach/conversationContext';
import {localRetrieve,labMessages,LAB_POLICY,protocol,engineProfiles,labVersionSchema,eligibility} from './core';
import {contentHash,entryKey} from '../miraKnowledge/schema';

const config={provider:'openai' as const,apiKey:'synthetic-only',model:engineProfiles.openai.model,maxCompletionTokens:1800,reasoningEffort:'low' as const,compactReply:true,oneQuestionAtATime:true,emptyInterviewMetadata:true,separateQuestionField:true};
const history=observed.serviceBoundary.priorClientMessages.map(content=>({role:'client' as const,content}));
const constraints=clientConstraints([...history,{role:'client',content:observed.serviceBoundary.message}]);
const bundle=knowledgeBundleSchema.parse(nine);
function version(){
 const reviews:Record<string,any>={},reviewedEntryHashes:Record<string,string>={};
 for(const [kind,values]of [['source',bundle.sources],['card',bundle.items]]as const)for(const value of values){const k=entryKey(kind,value);reviews[k]={actorUserId:1,reviewer:'Exact nine-entry local fixture, not publication approval',approved:true,at:'2026-11-02T00:00:00Z',reason:'Previously reviewed source fixture; local regression only',evaluationCaseIds:kind==='source'?[]:['observed-failure']};reviewedEntryHashes[k]=contentHash(value);}
 return labVersionSchema.parse({id:'fixed-nine',version:1,label:'Same nine entries',parent:null,processing:['local','openai'],blockedReason:null,bundle,reviews,reviewedEntryHashes,evaluationCaseIds:['observed-failure'],artifactBindings:[],notes:'No corpus expansion'});
}

describe('saved empty-completion regressions',()=>{
 it.each(observed.failures)('classifies $condition turn $turn as output-limited, without retry or fake recovery',async saved=>{
  const fetcher=vi.fn(async()=>Response.json({model:saved.usage.providerModel,choices:[{finish_reason:saved.providerResult.finishReason,message:{content:saved.providerResult.content}}],usage:{prompt_tokens:saved.usage.providerPromptTokens,completion_tokens:saved.usage.providerOutputTokens,completion_tokens_details:{reasoning_tokens:saved.usage.reasoningTokens}}}));
  const input={policy:LAB_POLICY,policyVersion:protocol.policyVersion,message:saved.message,messages:history,evidence:[]};
  await expect(createCoachModel(config,fetcher)(input)).rejects.toMatchObject({category:'output_limit'});
  expect(fetcher).toHaveBeenCalledTimes(1);
  const wire=JSON.parse((fetcher.mock.calls[0] as unknown as [unknown,RequestInit])[1].body as string);
  expect(wire.model).toBe(saved.requestContract.model);expect(wire.max_completion_tokens).toBe(saved.requestContract.maxCompletionTokens);expect(wire.reasoning_effort).toBe(saved.requestContract.reasoningEffort);
  expect(Object.keys(wire.response_format.json_schema.schema.properties)).toEqual(['response','nextQuestion']);
  expect(saved.usage.providerOutputTokens).toBe(saved.usage.reasoningTokens);
 });
 it('keeps strict local validation and fills unused metadata without asking the model to emit it',()=>{
  expect(parseCoachReply(config,{response:'Your service ends at a practical plan.',nextQuestion:'What happened in one recent enquiry?'})).toMatchObject({memoryProposals:[],interviewProposals:[],interviewStates:[]});
  expect(()=>parseCoachReply(config,{response:'Advice',nextQuestion:null,send_email:true})).toThrow();
  expect(()=>parseCoachReply(config,{response:'x'.repeat(1201),nextQuestion:null})).toThrow();
  expect(()=>parseCoachReply(config,{response:'Advice',nextQuestion:'What happened and what changed?'})).toThrow();
  expect(Object.keys(coachReplyWireSchema(config).shape)).toHaveLength(2);
 });
 it('never accepts a partial JSON object on a length-terminated completion',async()=>{
  const fetcher=vi.fn(async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{"response":"A partial plan'}}]}));
  await expect(createCoachModel(config,fetcher)({policy:LAB_POLICY,policyVersion:protocol.policyVersion,message:'Help',messages:[],evidence:[]})).rejects.toMatchObject({category:'output_limit'});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
});

describe('explicit service-boundary regressions',()=>{
 it('rejects the actual saved contradictory response',()=>{
  expect(constraints.channelManagementExcluded).toBe(true);
  expect(clientBoundaryIssues(observed.serviceBoundary.response.response,constraints)).toEqual(['excluded_channel_management']);
  expect(()=>parseCoachReply({...config,compactReply:false},observed.serviceBoundary.response,constraints)).toThrow('client_boundary_conflict');
 });
 it.each(['Posting and moderation are optional add-ons.','Excluded — channel posting, community moderation (available as an optional retainer).','You post it or we can manage it for you.','Offer channel management as a premium service.',"You don't run their channels and we can manage it for you."])('blocks reintroduction in suggestions or example copy: %s',text=>{
  expect(clientBoundaryIssues(text,constraints)).toEqual(['excluded_channel_management']);
 });
 it.each(['I do not offer channel management.','Channel management is not included.','You can refer clients to an independent manager for posting.','Keep the advice and planning scope explicit.'])('allows accurate boundaries or third-party referrals: %s',text=>{
  expect(clientBoundaryIssues(text,constraints)).toEqual([]);
 });
 it('does not let assistant advice or an imagined service revoke the client exclusion',()=>{
  expect(clientConstraints([{role:'client',content:observed.serviceBoundary.message},{role:'assistant',content:'I now offer channel management.'}]).channelManagementExcluded).toBe(true);
  expect(clientConstraints([{role:'client',content:observed.serviceBoundary.message},{role:'client',content:'If I now offer channel management, what changes?'}]).channelManagementExcluded).toBe(true);
  expect(clientConstraints([{role:'client',content:observed.serviceBoundary.message},{role:'client',content:'I now offer channel management.'}]).channelManagementExcluded).toBe(false);
 });
 it('retains the exclusion outside trimmed model history in both prompt builders',()=>{
  const long=[{role:'client' as const,content:observed.serviceBoundary.message},...Array.from({length:40},()=>({role:'assistant' as const,content:'Long prior advice '.repeat(120)}))];
  const references=localRetrieve(version(),'What should we explore next?','local');
  const a=labMessages({policy:LAB_POLICY,message:'What next?',history:long,clientInfo:'Fictional test',references});
  const b=buildCoachMessages({policy:LAB_POLICY,policyVersion:protocol.policyVersion,message:'What next?',messages:long,evidence:[]});
  for(const m of [a,b]){expect(m.some(x=>x.content.includes('"channelManagementExcluded":true'))).toBe(true);expect(m.reduce((n,x)=>n+x.content.length,0)).toBeLessThanOrEqual(24000);expect(m.filter(x=>x.content==='Long prior advice '.repeat(120)).length).toBeLessThan(40);}
 });
 it('withholds a contradictory model reply without a provider repair request',async()=>{
  const fetcher=vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({response:'We can manage it for you.',nextQuestion:null})}}]}));
  await expect(createCoachModel(config,fetcher)({policy:LAB_POLICY,policyVersion:protocol.policyVersion,message:'Suggest a headline',messages:[{role:'client',content:observed.serviceBoundary.message}],evidence:[]})).rejects.toMatchObject({category:'client_boundary_conflict'});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
});

describe('stage-sensitive retrieval on the unchanged nine entries',()=>{
 it('uses discovery guidance for the observed opening despite previous assistant visual advice',()=>{
  const v=version(),m=observed.messages[0];
  const trace=localRetrieve(v,m,'local',new Set(),[{role:'assistant',content:'Plan photos, lighting, visual framing, wardrobe, priority shots and website images.'}]);
  expect(trace.stage).toBe('discovery');expect(trace.cards.length).toBeGreaterThan(0);
  expect(trace.cards.every(c=>c.item.kind==='card'&&c.item.category==='discovery')).toBe(true);
  expect(trace.cards.some(c=>/opening|interview|needs/.test(c.item.id))).toBe(true);
 });
 it('routes each observed current turn instead of recycling visual history',()=>{
  const expected=['discovery','brand_review','discovery','visual_direction','measurement'];
  for(const [i,message]of observed.messages.entries()){
   const trace=localRetrieve(version(),message,'local');expect(trace.stage).toBe(expected[i]);
   if(i<3)expect(trace.cards.some(c=>c.item.kind==='card'&&['preparation','visual_translation'].includes(c.item.category))).toBe(false);
   if(i===3)expect(trace.cards.some(c=>c.item.kind==='card'&&c.item.category==='visual_translation')).toBe(true);
   if(i===4)expect(trace.cards).toEqual([]);
  }
 });
 it('does not interpret deferring images as permission for visual direction',()=>{
  expect(conversationRetrieval("I don't want photos yet. My offer is unclear.").stage).toBe('discovery');
 });
 it('retains citations, limitations, exact source review and withdrawal guards',()=>{
  const v=version(),trace=localRetrieve(v,observed.messages[0],'local');
  expect(eligibility(v,'local')).toEqual([]);
  for(const c of trace.cards){expect(c.citations.length).toBeGreaterThan(0);expect(c.item.limitations.length).toBeGreaterThan(0);expect(c.item.id).not.toMatch(/keller/);}
  expect(()=>localRetrieve(v,observed.messages[0],'local',new Set([entryKey('source',v.bundle!.sources[0])]))).toThrow();
  v.bundle!.sources[0].rightsBasis='pending';expect(()=>localRetrieve(v,observed.messages[0],'local')).toThrow();
 });
});
