import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,it,expect,vi} from "vitest";
import {createLiveProviderGate} from "./liveProviderGate";
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function setup(){
  const root=await mkdtemp(join(tmpdir(),"mira-synthetic-provider-budget-"));roots.push(root);
  const fetcher=vi.fn(async()=>new Response("{}"));
  const gate=createLiveProviderGate(root,fetcher);
  await writeFile(join(root,"provider-approval.json"),JSON.stringify({scope:"local-mira-review",approved:true,maxRequests:3,
    expiresAt:new Date(Date.now()+60_000).toISOString(),allowedModels:["synthetic-text-model"],maxRequestBytes:1000,maxCompletionTokens:1800}));
  return {gate,fetcher};
}
const request=(extra:object={})=>({method:"POST",body:JSON.stringify({model:"synthetic-text-model",messages:[{role:"user",content:"Synthetic source question"}],max_completion_tokens:1800,...extra})});
describe("bounded local text-answer verification",()=>{
  it("makes zero requests without actual approval",async()=>{
    const root=await mkdtemp(join(tmpdir(),"mira-synthetic-no-provider-permit-"));roots.push(root);
    const fetcher=vi.fn(async()=>new Response("{}")),gate=createLiveProviderGate(root,fetcher);
    await expect(gate.fetch("https://api.openai.com/v1/chat/completions",request())).rejects.toThrow(/authorised/);
    expect(fetcher).not.toHaveBeenCalled();expect((await gate.status()).usedRequests).toBe(0);
  });
  it("rejects oversized text and unbounded completion before dispatch or budget consumption",async()=>{
    const {gate,fetcher}=await setup();
    await expect(gate.fetch("https://api.openai.com/v1/chat/completions",request({messages:[{role:"user",content:"x".repeat(1001)}]}))).rejects.toThrow(/byte limit/);
    for(const value of [0,1801,undefined])await expect(gate.fetch("https://api.openai.com/v1/chat/completions",request({max_completion_tokens:value}))).rejects.toThrow(/token limit/);
    expect(fetcher).not.toHaveBeenCalled();expect((await gate.status()).usedRequests).toBe(0);
  });
  it("allows only three bounded requests and preserves exhaustion",async()=>{
    const {gate,fetcher}=await setup();
    for(let n=0;n<3;n++)await gate.fetch("https://api.openai.com/v1/chat/completions",request());
    await expect(gate.fetch("https://api.openai.com/v1/chat/completions",request())).rejects.toThrow(/limit/);
    expect(fetcher).toHaveBeenCalledTimes(3);expect(await gate.status()).toMatchObject({state:"exhausted",usedRequests:3,remainingRequests:0});
  });
});
