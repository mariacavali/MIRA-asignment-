import { describe,it,expect } from "vitest";
import { prepareFullBook } from "./fullBook";
import { prepareCheckedIncompleteBook } from "./checkedIncomplete";
import { contentHash,entryKey,normaliseBundle } from "./schema";
import { publicationProblems } from "./publish";
import { retrieveExpertise } from "./retrieve";
import { preparePineconeSeedPlan } from "./pineconePlan";
import type { KnowledgeBundle,KnowledgeReviews } from "../../shared/miraKnowledge";

function fixture(){
  const b=prepareFullBook({bookId:"partial-test",title:"Synthetic source",author:"Synthetic",edition:"Test",sources:[{part:1,sha256:"a".repeat(64),physicalPages:1}],
    processedPages:[{part:1,physicalPage:1}],issues:["Missing printed page 2","Tiny figure labels unreadable"],
    units:[{text:"Brand awareness and brand equity guide practical positioning.",sourceSha256:"a".repeat(64),part:1,physicalPage:1,side:"single",artifact:"page.txt",contentType:"ocr_text"}]});
  for(const i of b.items)if(i.kind==="passage")i.quality="verified";
  return b;
}
function partial(){const b=fixture();return prepareCheckedIncompleteBook(b,{bundleHash:contentHash(b),actor:"Synthetic user",at:"2026-10-31T12:00:00Z",reason:"Accept exact listed gaps",evidence:"Synthetic acceptance record",exclusionManifest:"synthetic-exclusions.json",exclusionSha256:"e".repeat(64)});}
function reviews(b:KnowledgeBundle):KnowledgeReviews{return Object.fromEntries([...b.sources.map(s=>[entryKey("source",s),{actorUserId:1,reviewer:"Synthetic",at:"2026-10-31T12:00:00Z",approved:true,reason:"Synthetic source clearance",evaluationCaseIds:[]}]),...b.items.map(i=>[entryKey(i.kind,i),{actorUserId:1,reviewer:"Synthetic",at:"2026-10-31T12:00:00Z",approved:true,reason:"Synthetic item check",evaluationCaseIds:["synthetic-case"]}])]);}
const snapshot=(b:KnowledgeBundle)=>({releaseId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hash:contentHash(b),revision:1,items:b.items,sources:b.sources});
const target={host:"https://test.svc.example.pinecone.io",namespace:"mira-test"};
describe("explicit checked-incomplete publication",()=>{
  it("preserves full saved content, provenance, rights and gaps while binding a separate new scope",()=>{
    const before=fixture(),after=partial();
    expect(after.sources[0].fullBookCoverage).toEqual(before.sources[0].fullBookCoverage);
    expect(after.sources[0].rightsBasis).toBe("pending");expect(after.sources[0].rightsEvidence).toBe("");
    expect(after.sources[0].checkedPartialPublication?.bookComplete).toBe(false);
    for(let n=0;n<after.items.length;n++){const a=after.items[n],b=before.items[n];expect(a.id).toBe(b.id);expect(a.version).toBe(b.version+1);
      if(a.kind!=="passage"||b.kind!=="passage")throw new Error();expect(a.content).toBe(b.content);expect(a.provenance).toEqual(b.provenance);}
  });
  it("does not treat gap acceptance or approved item reviews as permission",()=>{
    const b=partial(),r=reviews(b);expect(publicationProblems(b,r,new Set())).toEqual([expect.stringContaining("Source not cleared")]);
    expect(retrieveExpertise(snapshot(b),{message:"brand equity awareness",segment:"personal_brand",language:"en"}).cards).toEqual([]);
    expect(()=>preparePineconeSeedPlan(snapshot(b),target)).toThrow(/permission/);
  });
  it("admits an explicitly cleared incomplete source without claiming complete coverage",()=>{
    const b=partial();b.sources[0].rightsBasis="original";b.sources[0].rightsEvidence="Synthetic original fixture";
    expect(publicationProblems(b,reviews(b),new Set())).toEqual([]);
    const g=retrieveExpertise(snapshot(b),{message:"brand equity awareness",segment:"personal_brand",language:"en"});
    expect(g.cards).toHaveLength(1);expect(g.cards[0].item.limitations).toContain("Incomplete source coverage; documented exclusions apply.");
    expect(preparePineconeSeedPlan(snapshot(b),target).documents).toHaveLength(1);
    expect(b.sources[0].fullBookCoverage?.status).toBe("pending");
  });
  it("keeps strict unaccepted incomplete books blocked",()=>{
    const b=fixture();b.sources[0].rightsBasis="original";b.sources[0].rightsEvidence="Synthetic";
    expect(publicationProblems(b,reviews(b),new Set())).toContainEqual(expect.stringContaining("coverage not verified"));
    expect(()=>preparePineconeSeedPlan(snapshot(b),target)).toThrow(/coverage/);
  });
  it.each(["stale-version","gap-erasure","unlisted-version","unchecked","lost-label","false-complete"])("rejects %s instead of falling back to raw text",mutation=>{
    const b=partial(),s=b.sources[0],p=s.checkedPartialPublication!;
    if(mutation==="stale-version")s.version++;
    if(mutation==="gap-erasure")s.fullBookCoverage!.missingOrUnreadable=[];
    if(mutation==="unlisted-version")b.items[0].version++;
    if(mutation==="unchecked"&&b.items[0].kind==="passage")b.items[0].quality="pending";
    if(mutation==="lost-label")b.items[0].limitations=[];
    if(mutation==="false-complete")s.fullBookCoverage!.status="verified";
    expect(()=>normaliseBundle(b)).toThrow();
  });
  it("retains source withdrawal and individual evaluation requirements",()=>{
    const b=partial();b.sources[0].rightsBasis="original";b.sources[0].rightsEvidence="Synthetic";
    const r=reviews(b);r[entryKey(b.items[0].kind,b.items[0])].evaluationCaseIds=[];
    const problems=publicationProblems(b,r,new Set([entryKey("source",b.sources[0])]));
    expect(problems).toContainEqual(expect.stringContaining("Source not cleared"));expect(problems).toContainEqual(expect.stringContaining("not reviewed/evaluated"));
  });
  it("rejects acceptance for a different saved bundle",()=>{
    expect(()=>prepareCheckedIncompleteBook(fixture(),{bundleHash:"f".repeat(64),actor:"Synthetic",at:"2026-10-31T12:00:00Z",reason:"Test",evidence:"Test",exclusionManifest:"test",exclusionSha256:"e".repeat(64)})).toThrow(/exact checked/);
  });
});
