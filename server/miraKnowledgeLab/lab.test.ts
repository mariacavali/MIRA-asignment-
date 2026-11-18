import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { syntheticKnowledgeBundle } from "../miraKnowledge/fixtures";
import { contentHash, entryKey } from "../miraKnowledge/schema";
import { localRetrieve, eligibility, labMessages, protocol, protocolHash, comparisonKey, SCENARIOS, COMPARISON_JOURNEY, paidProposal, engineProfiles, type LabVersion } from "./core";
import { createKnowledgeLabApp } from "./app";

function version(): LabVersion {
  const bundle = syntheticKnowledgeBundle(); const reviews: LabVersion["reviews"] = {}, reviewedEntryHashes: Record<string, string> = {};
  for (const { kind, value } of [...bundle.sources.map(value => ({ kind: "source" as const, value })), ...bundle.items.map(value => ({ kind: value.kind, value }))]) {
    const key = entryKey(kind, value); reviews[key] = { actorUserId: 1, reviewer: "Synthetic test fixture", approved: true, at: "2026-11-01T12:00:00Z", reason: "Synthetic data for automated testing only", evaluationCaseIds: kind === "source" ? [] : ["fixture-case"] }; reviewedEntryHashes[key] = contentHash(value);
  }
  return { id: "fixture-source", version: 1, label: "Synthetic source", parent: "a-baseline", processing: ["local", "openai"], blockedReason: null, bundle, reviews, reviewedEntryHashes, evaluationCaseIds: ["fixture-case"], artifactBindings: [], notes: "Not real book material" };
}
function baseline(): LabVersion { return { ...version(), id: "a-baseline", label: "A", bundle: null, reviews: {}, reviewedEntryHashes: {} }; }

describe("isolated local knowledge comparisons", () => {
  it("reuses lexical retrieval with full limitations and an explicitly unpublished trace", () => {
    const v = version(); const r = localRetrieve(v, "audience guidance", "local");
    expect(r.status).toBe("matched"); expect(r.publication).toBe("not_published"); expect(r).not.toHaveProperty("releaseId");
    expect(r.cards[0].citations[0].locator).toBeTruthy(); expect(r.cards[0].item.limitations.length).toBeGreaterThan(0);
    expect(localRetrieve(baseline(), "audience guidance", "local").cards).toEqual([]);
  });
  it("does not let test mode bypass rights, exact reviews, evaluations or withdrawals", () => {
    for (const mutate of [
      (v: LabVersion) => { v.bundle!.sources[0].rightsBasis = "pending"; },
      (v: LabVersion) => { v.bundle!.sources[0].rightsEvidence = ""; },
      (v: LabVersion) => { v.reviews[entryKey("source", v.bundle!.sources[0])].approved = false; },
      (v: LabVersion) => { v.reviews[entryKey(v.bundle!.items[0].kind, v.bundle!.items[0])].evaluationCaseIds = []; },
      (v: LabVersion) => { v.bundle!.items[0].title = "Changed after review"; },
      (v: LabVersion) => { v.evaluationCaseIds = []; },
    ]) { const v = version(); mutate(v); expect(eligibility(v, "local").length).toBeGreaterThan(0); expect(() => localRetrieve(v, "audience", "local")).toThrow(); }
    const v = version(); expect(() => localRetrieve(v, "audience", "local", new Set([entryKey("source", v.bundle!.sources[0])]))).toThrow();
    v.processing = ["local"]; expect(eligibility(v, "openai").length).toBeGreaterThan(0);
  });
  it("blocks Holt rather than falling back to baseline or substituting another book", () => {
    const v = { ...baseline(), id: "b-holt-ch2", processing: [] as ("local" | "openai")[], blockedReason: "Actual source clearance missing" };
    expect(() => localRetrieve(v, "relaxation myth", "local")).toThrow("clearance missing");
  });
  it("keeps system instructions, model and starting client information constant", () => {
    const a = localRetrieve(baseline(), "audience guidance", "local"), c = localRetrieve(version(), "audience guidance", "local");
    const fixed = { policy: protocol.policy, message: "Help me explain my service", history: [], clientInfo: SCENARIOS[0].clientInfo };
    const aa = labMessages({ ...fixed, references: a }), cc = labMessages({ ...fixed, references: c });
    expect(aa[0]).toEqual(cc[0]); expect(aa[2]).toEqual(cc[2]); expect(aa.at(-1)).toEqual(cc.at(-1));
    expect(aa[1]).not.toEqual(cc[1]); expect(cc[1].content).toContain("unpublished data"); expect(cc[1].content).not.toContain("Published expert guidance");
    expect(comparisonKey(SCENARIOS[0], "local")).not.toBe(comparisonKey(SCENARIOS[0], "openai"));
  });
  it("bounds context while retaining full selected entries rather than trimming qualifications", () => {
    const references = localRetrieve(version(), "audience guidance", "local");
    const m = labMessages({ policy: protocol.policy, message: "actual message", clientInfo: SCENARIOS[0].clientInfo, references, history: Array.from({ length: 40 }, () => ({ role: "client" as const, content: "history ".repeat(500) })) });
    expect(m.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(24000);
    for (const c of references.cards) for (const l of c.item.limitations) expect(m[1].content).toContain(l);
  });
});

describe("isolated HTTP session workflow", () => {
  async function fixture(run: (x: { url: string; headers: Record<string, string>; root: string; fetcher: ReturnType<typeof vi.fn> }) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), "mira-knowledge-lab-"));
    const a = baseline(), c = version(), b = { ...a, id: "b-holt-ch2", blockedReason: "Holt source clearance pending" };
    await writeFile(join(root, "registry.json"), JSON.stringify({ format: "mira-isolated-knowledge-lab-v1", createdAt: new Date().toISOString(), authority: "Synthetic test", versions: [a, b, c], withdrawnKeys: [] }));
    const fetcher = vi.fn(async () => { throw new Error("No provider requests allowed in this test"); });
    let application: ReturnType<typeof createKnowledgeLabApp>["app"];
    const server = createServer((req,res) => application(req,res)); server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
    application = createKnowledgeLabApp({ root, host: `127.0.0.1:${address.port}`, fetcher, openaiKey: "synthetic-only-key" }).app;
    const headers = { origin: `http://127.0.0.1:${address.port}`, "content-type": "application/json" };
    try { await run({ url: `http://127.0.0.1:${address.port}`, headers, root, fetcher }); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
  }
  it('retains output-limit and boundary failures with usage, without publishing an answer or retrying',async()=>fixture(async({url,headers,root,fetcher})=>{
    const post=async(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
    const registry=JSON.parse(await readFile(join(root,'registry.json'),'utf8'));registry.versions.push({...version(),id:'c2-mira-method'});await writeFile(join(root,'registry.json'),JSON.stringify(registry));
    const a=await(await post('/api/sessions',{configurationId:'a-baseline',scenarioId:COMPARISON_JOURNEY.id,engine:'openai'})).json();
    const c=await(await post('/api/sessions',{configurationId:'c2-mira-method',scenarioId:COMPARISON_JOURNEY.id,engine:'openai'})).json();
    const approvedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+60000).toISOString();
    await writeFile(join(root,'provider-approval.json'),JSON.stringify({scope:'local-mira-review',approved:true,maxRequests:2,expiresAt,allowedModels:[engineProfiles.openai.model],maxRequestBytes:40000,maxCompletionTokens:1800}));
    await writeFile(join(root,'lab-paid-approval.json'),JSON.stringify({approved:true,actor:'Mock-only regression allowance',approvedAt,expiresAt,protocolHash,proposalHash:contentHash(paidProposal),maximumUsd:0.04,budgetScope:'additional_run',allowedSessionIds:[a.id,c.id],allowedKnowledgeHashes:[a.knowledgeHash,c.knowledgeHash],comparisonJourneyHash:contentHash(COMPARISON_JOURNEY),allowTypedReplies:true,maxTurnsPerSession:1}));
    fetcher.mockImplementationOnce(async()=>Response.json({choices:[{finish_reason:'length',message:{content:''}}],usage:{prompt_tokens:4104,completion_tokens:1169,completion_tokens_details:{reasoning_tokens:1169}}}));
    const requestId=randomUUID(),body={requestId,message:COMPARISON_JOURNEY.opening,generate:true};
    const first=await(await post(`/api/sessions/${a.id}/turns`,body)).json();
    expect(first.turns[0]).toMatchObject({state:'failed',answer:null,providerResult:{validation:{stage:'output_budget',code:'output_limit',emptyContent:true}},usage:{providerOutputTokens:1169,reasoningTokens:1169}});
    expect(first.turns[0].error).toContain('fixed output limit');
    await post(`/api/sessions/${a.id}/turns`,body);expect(fetcher).toHaveBeenCalledTimes(1);
    const blocked=await post(`/api/sessions/${a.id}/turns`,{requestId:randomUUID(),message:'Another attempt',generate:true});expect(blocked.status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementationOnce(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({response:'Posting and moderation are optional add-ons.',nextQuestion:null})}}],usage:{prompt_tokens:100,completion_tokens:20}}));
    const second=await(await post(`/api/sessions/${c.id}/turns`,{requestId:randomUUID(),message:'I do not run their social channels. Suggest wording.',generate:true})).json();
    expect(second.turns[0]).toMatchObject({state:'failed',answer:null,providerResult:{validation:{valid:false,code:'client_boundary_conflict'}}});
    expect(second.turns[0].error).toContain('reply was withheld');expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(join(root,'provider-usage.json'),'utf8')).count).toBe(2);
  }));
  it("accepts typed replies, retains rejected output privately, and never persists credentials", async () => fixture(async ({url,headers,root,fetcher}) => {
    const post=async(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
    const file=join(root,'registry.json'),r=JSON.parse(await readFile(file,'utf8'));r.versions.push({...version(),id:'c2-mira-method'});await writeFile(file,JSON.stringify(r));
    const a=await(await post('/api/sessions',{configurationId:'a-baseline',scenarioId:COMPARISON_JOURNEY.id,engine:'openai'})).json();
    const c=await(await post('/api/sessions',{configurationId:'c2-mira-method',scenarioId:COMPARISON_JOURNEY.id,engine:'openai'})).json();
    const approvedAt=new Date(Date.now()-1000).toISOString(),expiresAt=new Date(Date.now()+60000).toISOString();
    await writeFile(join(root,'provider-approval.json'),JSON.stringify({scope:'local-mira-review',approved:true,maxRequests:2,expiresAt,allowedModels:[engineProfiles.openai.model],maxRequestBytes:40000,maxCompletionTokens:1800}));
    await writeFile(join(root,'lab-paid-approval.json'),JSON.stringify({approved:true,actor:'Synthetic mock-only approval',approvedAt,expiresAt,protocolHash,proposalHash:contentHash(paidProposal),maximumUsd:paidProposal.maximumProposedUsd,budgetScope:'additional_run',allowedSessionIds:[a.id,c.id],allowedKnowledgeHashes:[a.knowledgeHash,c.knowledgeHash],comparisonJourneyHash:contentHash(COMPARISON_JOURNEY),allowTypedReplies:true,maxTurnsPerSession:2,priorUsageBasedUsd:0.0080125}));
    const secretInput=await post(`/api/sessions/${a.id}/turns`,{requestId:randomUUID(),message:'synthetic-only-key',generate:true});expect(secretInput.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({response:'Is that right? Who do you help? synthetic-only-key',nextQuestion:null})}}],usage:{prompt_tokens:100,completion_tokens:20}})));
    const failed=await(await post(`/api/sessions/${a.id}/turns`,{requestId:randomUUID(),message:'I typed my own first answer.',generate:true})).json();
    expect(failed.turns[0]).toMatchObject({state:'failed',answer:null,providerResult:{validation:{valid:false}}});
    expect(failed.turns[0].providerResult.validation.issues).toEqual(expect.arrayContaining([expect.objectContaining({path:['response']})]));
    expect(JSON.stringify(failed)).not.toContain('synthetic-only-key');
    fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({response:'Your work is one-to-one.',nextQuestion:'What changed for one recent client?'})}}],usage:{prompt_tokens:100,completion_tokens:20}})));
    const answered=await(await post(`/api/sessions/${a.id}/turns`,{requestId:randomUUID(),message:'I help people make one practical decision.',generate:true})).json();expect(answered.turns[1].state).toBe('completed');expect(fetcher).toHaveBeenCalledTimes(2);
    const nextWire=JSON.parse((fetcher.mock.calls[1] as unknown as [unknown,RequestInit])[1].body as string);
    expect(nextWire.messages.some((m:{content:string})=>m.content==='I typed my own first answer.')).toBe(true);
    expect(nextWire.messages.some((m:{role:string,content:string})=>m.role==='assistant'&&m.content.includes('Is that right?'))).toBe(false);
    const saved=await readFile(join(root,'sessions',a.id+'.json'),'utf8');expect(saved).not.toContain('synthetic-only-key');
    expect(((await stat(join(root,'sessions',a.id+'.json'))).mode&0o777)).toBe(0o600);
  }));
  it("creates independent sessions, saves traces/feedback and exports them after reload", async () => fixture(async ({ url, headers, root, fetcher }) => {
    const post = async (path: string, body: unknown) => fetch(url + path, { method: "POST", headers, body: JSON.stringify(body) });
    const a = await (await post("/api/sessions", { configurationId: "a-baseline", scenarioId: "unclear-offer", engine: "openai" })).json();
    const c = await (await post("/api/sessions", { configurationId: "fixture-source", scenarioId: "unclear-offer", engine: "openai" })).json();
    expect(a.id).not.toBe(c.id); expect(a.comparisonKey).toBe(c.comparisonKey); expect(a.knowledgeHash).not.toBe(c.knowledgeHash); expect(a.protocolHash).toBe(protocolHash);
    const requestId = randomUUID(), body = { requestId, message: "audience guidance", generate: false };
    const result = await (await post(`/api/sessions/${c.id}/turns`, body)).json(); expect(result.turns[0].references.status).toBe("matched"); expect(result.turns[0].answer).toBeNull();
    const repeated = await (await post(`/api/sessions/${c.id}/turns`, body)).json(); expect(repeated.turns).toHaveLength(1);
    const feedback = { turnId: result.turns[0].id, clarity: null, relevance: null, followUpQuality: null, factualGrounding: null, avoidsUnsupportedAssumptions: null, naturalApplication: null, notes: "Retrieval preview only; answer quality unassessed." };
    expect((await post(`/api/sessions/${c.id}/feedback`, feedback)).status).toBe(200);
    const saved = JSON.parse(await readFile(join(root, "sessions", c.id + ".json"), "utf8")); expect(saved.feedback[0].notes).toContain("unassessed");
    const exportResponse = await fetch(url + `/api/sessions/${c.id}/export`, { headers }); expect((await exportResponse.json()).session.turns[0].promptMessages[1].content).toContain("unpublished");
    expect(fetcher).not.toHaveBeenCalled();
  }));
  it("rejects blocked selection, unapproved generation and cross-origin changes before provider access", async () => fixture(async ({ url, headers, fetcher }) => {
    const blocked = await fetch(url + "/api/sessions", { method: "POST", headers, body: JSON.stringify({ configurationId: "b-holt-ch2", scenarioId: "unclear-offer", engine: "openai" }) }); expect(blocked.status).toBe(400);
    const cross = await fetch(url + "/api/sessions", { method: "POST", headers: { ...headers, origin: "https://unrelated.example" }, body: "{}" }); expect(cross.status).toBe(403);
    const session = await (await fetch(url + "/api/sessions", { method: "POST", headers, body: JSON.stringify({ configurationId: "a-baseline", scenarioId: "unclear-offer", engine: "openai" }) })).json();
    const gen = await fetch(url + `/api/sessions/${session.id}/turns`, { method: "POST", headers, body: JSON.stringify({ requestId: randomUUID(), message: "Hello", generate: true }) }); expect(gen.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  }));
  it("rechecks source withdrawal and version identity after a session was created", async () => fixture(async ({ url, headers, root, fetcher }) => {
    const post = async (path: string, body: unknown) => fetch(url + path, { method: "POST", headers, body: JSON.stringify(body) });
    const s = await (await post("/api/sessions", { configurationId: "fixture-source", scenarioId: "unclear-offer", engine: "local" })).json();
    const file = join(root, "registry.json"), registry = JSON.parse(await readFile(file, "utf8")); registry.withdrawnKeys = [entryKey("source", registry.versions[2].bundle.sources[0])]; await writeFile(file, JSON.stringify(registry));
    const r = await post(`/api/sessions/${s.id}/turns`, { requestId: randomUUID(), message: "audience guidance", generate: false }); expect(r.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  }));
  it("saves generated turns with exact prompts and local token usage using a mocked local model", async () => fixture(async ({ url, headers, fetcher }) => {
    fetcher.mockImplementation(async (url: unknown) => String(url).endsWith('/api/tags')
      ? new Response(JSON.stringify({ models: [{ name: engineProfiles.local.model, digest: engineProfiles.local.digest }] }))
      : new Response(JSON.stringify({ done_reason: 'stop', message: { content: JSON.stringify({ response: 'One recent example will help.', nextQuestion:'What happened in one recent client example?' }) }, prompt_eval_count: 120, eval_count: 12 })));
    const post = async (path: string, body: unknown) => fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const s = await (await post('/api/sessions', { configurationId: 'fixture-source', scenarioId: 'unclear-offer', engine: 'local' })).json();
    const answer = await (await post(`/api/sessions/${s.id}/turns`, { requestId: randomUUID(), message: 'audience guidance', generate: true })).json();
    expect(answer.turns[0]).toMatchObject({ state: 'completed', answer: 'One recent example will help.\n\nWhat happened in one recent client example?', usage: { localPromptTokens: 120, localOutputTokens: 12, providerBilledTokens: 0 } });
    expect(answer.turns[0].promptMessages[0].content).toBe(protocol.policy);
    expect(answer.turns[0].promptMessages[1].content).toContain('isolated-local-test');
    expect(fetcher.mock.calls.every(args => String(args[0]).startsWith('http://127.0.0.1:11435/'))).toBe(true);
  }));
  it("withholds a model result if a source is withdrawn during generation", async () => fixture(async ({ url, headers, root, fetcher }) => {
    fetcher.mockImplementation(async (target: unknown) => {
      if(String(target).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: engineProfiles.local.model, digest: engineProfiles.local.digest }] }));
      const file=join(root,'registry.json'),r=JSON.parse(await readFile(file,'utf8'));r.withdrawnKeys=[entryKey('source',r.versions[2].bundle.sources[0])];await writeFile(file,JSON.stringify(r));
      return new Response(JSON.stringify({ done_reason:'stop',message:{content:JSON.stringify({response:'Withheld answer',nextQuestion:null})} }));
    });
    const post=async(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
    const s=await(await post('/api/sessions',{configurationId:'fixture-source',scenarioId:'unclear-offer',engine:'local'})).json();
    const r=await(await post(`/api/sessions/${s.id}/turns`,{requestId:randomUUID(),message:'audience guidance',generate:true})).json();
    expect(r.turns[0].state).toBe('failed');expect(r.turns[0].answer).toBeNull();
  }));
  it("limits approved hosted calls to the exact prepared sessions, script, model and knowledge hashes", async () => fixture(async ({ url, headers, root, fetcher }) => {
    const file=join(root,'registry.json'),r=JSON.parse(await readFile(file,'utf8'));r.versions.push({...version(),id:'c2-mira-method'});await writeFile(file,JSON.stringify(r));
    const post=async(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
    const a=await(await post('/api/sessions',{configurationId:'a-baseline',scenarioId:COMPARISON_JOURNEY.id,engine:'openai'})).json();
    const c=await(await post('/api/sessions',{configurationId:'c2-mira-method',scenarioId:COMPARISON_JOURNEY.id,engine:'openai'})).json();
    const approvedAt=new Date(Date.now()-1000).toISOString(),expiresAt=new Date(Date.now()+60000).toISOString();
    await writeFile(join(root,'provider-approval.json'),JSON.stringify({scope:'local-mira-review',approved:true,maxRequests:10,expiresAt,allowedModels:[engineProfiles.openai.model],maxRequestBytes:40000,maxCompletionTokens:1800}));
    await writeFile(join(root,'lab-paid-approval.json'),JSON.stringify({approved:true,actor:'Synthetic approval for a mocked provider only',approvedAt,expiresAt,protocolHash,proposalHash:contentHash(paidProposal),maximumUsd:paidProposal.maximumProposedUsd,budgetScope:'additional_run',allowedSessionIds:[a.id,c.id],allowedKnowledgeHashes:[a.knowledgeHash,c.knowledgeHash],comparisonJourneyHash:contentHash(COMPARISON_JOURNEY)}));
    fetcher.mockImplementation(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({response:'Synthetic reply for test only',nextQuestion:null})}}],usage:{prompt_tokens:100,completion_tokens:20}})));
    const requestId=randomUUID();
    const ok=await post(`/api/sessions/${a.id}/turns`,{requestId,message:COMPARISON_JOURNEY.opening,generate:true});expect(ok.status).toBe(200);expect((await ok.json()).turns[0].state).toBe('completed');
    await post(`/api/sessions/${a.id}/turns`,{requestId,message:COMPARISON_JOURNEY.opening,generate:true});expect(fetcher).toHaveBeenCalledTimes(1);
    const wrong=await post(`/api/sessions/${a.id}/turns`,{requestId:randomUUID(),message:'Different unapproved client message',generate:true});expect(wrong.status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(1);
    const usage=JSON.parse(await readFile(join(root,'provider-usage.json'),'utf8'));expect(usage.count).toBe(1);
    fetcher.mockImplementation(async()=>new Response(JSON.stringify({error:{code:'invalid_api_key',type:'invalid_request_error',message:'Raw provider body must not escape into saved diagnostics'}}),{status:401}));
    const rejected=await(await post(`/api/sessions/${c.id}/turns`,{requestId:randomUUID(),message:COMPARISON_JOURNEY.opening,generate:true})).json();
    expect(rejected.turns[0]).toMatchObject({state:'failed',answer:null,usage:{httpStatus:401,providerErrorCode:'invalid_api_key',providerErrorType:'invalid_request_error'}});
    expect(JSON.stringify(rejected.turns[0])).not.toContain('Raw provider body');
    expect(JSON.parse(await readFile(join(root,'provider-usage.json'),'utf8')).count).toBe(2);
    expect(rejected.turns[0].providerResult).toBeUndefined();
    const diagnosticId=randomUUID(),diagnosticExpiry=new Date(Date.now()+59000).toISOString();
    const diagnosticApproval=JSON.parse(await readFile(join(root,'lab-paid-approval.json'),'utf8'));
    diagnosticApproval.expiresAt=diagnosticExpiry;diagnosticApproval.singleDiagnostic={sessionId:a.id,requestId:diagnosticId,messageHash:contentHash(COMPARISON_JOURNEY.repeatableClientTurns[0]),maximumUsd:0.0161};
    await writeFile(join(root,'lab-paid-approval.json'),JSON.stringify(diagnosticApproval));
    await writeFile(join(root,'provider-approval.json'),JSON.stringify({scope:'local-mira-review',approved:true,maxRequests:1,expiresAt:diagnosticExpiry,allowedModels:[engineProfiles.openai.model],maxRequestBytes:40000,maxCompletionTokens:1800}));
    const wrongDiagnostic=await post(`/api/sessions/${a.id}/turns`,{requestId:randomUUID(),message:COMPARISON_JOURNEY.repeatableClientTurns[0],generate:true});
    expect(wrongDiagnostic.status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockImplementation(async()=>new Response(JSON.stringify({model:engineProfiles.openai.model,choices:[{finish_reason:'stop',message:{content:JSON.stringify({response:'Synthetic invalid reply',memoryProposals:'invalid',interviewProposals:[],interviewStates:[],nextQuestion:null})}}],usage:{prompt_tokens:100,completion_tokens:20}})));
    const invalid=await(await post(`/api/sessions/${a.id}/turns`,{requestId:diagnosticId,message:COMPARISON_JOURNEY.repeatableClientTurns[0],generate:true})).json();
    expect(invalid.turns[1]).toMatchObject({state:'failed',answer:null,providerResult:{status:'raw_provider_output_not_approved_answer',validation:{valid:false,issues:[{path:[],code:'unrecognized_keys'}]}}});
  }));
});
