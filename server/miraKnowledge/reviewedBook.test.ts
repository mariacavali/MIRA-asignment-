import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkedExportSchema, fileSha, validateCheckedBook, prepareReviewedBook } from "./reviewedBook";
import { publicationProblems } from "./publish";
import { retrieveExpertise } from "./retrieve";
import { entryKey } from "./schema";
import type { KnowledgeReviews } from "../../shared/miraKnowledge";

const dirs:string[]=[];
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),"mira-checked-book-"));dirs.push(root);
  const work=join(root,"decisions");await mkdir(work);
  const decision=join(work,"ocr-decisions-00001.json");await writeFile(decision,'{"d00001":"original"}');
  const pdf=join(root,"source.pdf");await writeFile(pdf,"synthetic source bytes");
  await writeFile(join(root,"image.png"),"synthetic image bytes");
  const text="A distinctive synthetic brand has relevant associations and a clear source. This sentence is checked against the synthetic fixture. 😀\n".repeat(15);
  await writeFile(join(root,"checked.txt"),text);
  return {root,work,decision,data:checkedExportSchema.parse({version:2,state:"source_checked_partial_subset",bookComplete:false,
    sources:[{part:1,path:pdf,sha256:fileSha("synthetic source bytes"),physicalPages:1}],processedPages:[{part:1,physicalPage:1}],
    units:[{id:"d00001",part:1,physicalPage:1,side:"single",sourceSha256:fileSha("synthetic source bytes"),sourceFile:"source.pdf",printedPage:1,
      artifact:"checked.txt",text,contentType:"ocr_text",sourceImage:"image.png",sourceImageSha256:fileSha("synthetic image bytes"),checkedTextSha256:fileSha(text),state:"source_checked"}],
    exclusions:[{id:"d00002",state:"pending_source_review"}],regionReview:[{id:"region",uncheckedLineIds:["l2"]}],sourceCoverage:{confirmedMissingMainPages:[14,15]},summary:{},
    inputHashes:{[decision]:fileSha('{"d00001":"original"}')},decisionDirectory:work,decisionFiles:[decision]})};
}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
describe("checked-only partial book import",()=>{
  it("retains exact Unicode offsets, edition, original file/page locators and explicit partial coverage",async()=>{
    const f=await fixture(),checked=await validateCheckedBook(f.root,f.data),p=prepareReviewedBook(checked);
    expect(p.bundle.items.length).toBeGreaterThan(1);
    expect(p.bundle.sources[0].rightsBasis).toBe("pending");
    expect(p.bundle.sources[0].fullBookCoverage?.status).toBe("pending");
    for(const item of p.bundle.items){if(item.kind!=="passage")throw Error("passage");
      expect(item.quality).toBe("verified");expect(item.content).toBe(Array.from(f.data.units[0].text).slice(item.provenance.start,item.provenance.end).join(""));
      expect(item.sourceRefs[0].locator).toContain("source.pdf; part 1, physical PDF page 1");
      expect(item.sourceRefs[0].locator).toContain("printed page 1");expect(item.title).toContain("Fourth edition");
      expect(item.provenance.sourceImage).toBe("mira-book:brand-management/image.png");expect(item.limitations[0]).toContain("PARTIAL BOOK");
    }
    expect(p.itemUnits).not.toHaveProperty("d00002");
  });
  it("rejects newly added review decisions instead of silently using a stale export",async()=>{
    const f=await fixture();await writeFile(join(f.work,"ocr-decisions-new.json"),"{}");
    await expect(validateCheckedBook(f.root,f.data)).rejects.toThrow(/file set changed/);
  });
  it("rejects changed decisions",async()=>{const f=await fixture();await writeFile(f.decision,"{}");await expect(validateCheckedBook(f.root,f.data)).rejects.toThrow(/input changed/);});
  it.each(["checked.txt","image.png","source.pdf"])("rejects changed %s without raw fallback",async(name)=>{
    const f=await fixture();await writeFile(join(f.root,name),"changed");await expect(validateCheckedBook(f.root,f.data)).rejects.toThrow();
  });
  it("rejects text/hash mismatch, unchecked states, missing pages and escaping artifact paths",async()=>{
    const f=await fixture(),u=f.data.units[0];
    await expect(validateCheckedBook(f.root,{...f.data,units:[{...u,text:"invented"}]})).rejects.toThrow(/mismatch/);
    await expect(validateCheckedBook(f.root,{...f.data,units:[{...u,state:"machine_comparison_only"}]})).rejects.toThrow();
    await expect(validateCheckedBook(f.root,{...f.data,units:[{...u,printedPage:14}]})).rejects.toThrow(/Missing printed page/);
    await expect(validateCheckedBook(f.root,{...f.data,units:[{...u,artifact:join(f.root,"checked.txt")}]})).rejects.toThrow(/escapes/);
  });
  it("withholds short checked fragments and never fabricates surrounding text",async()=>{
    const f=await fixture();f.data.units.push({...f.data.units[0],id:"short-unit",text:"a fragment"});
    const p=prepareReviewedBook(f.data);expect(p.withheld.map(x=>x.id)).toContain("short-unit");
    expect(p.units.map(x=>x.id)).not.toContain("short-unit");
  });
  it("does not bypass existing full-coverage publication or retrieval checks even with approved review and synthetic rights",async()=>{
    const f=await fixture(),p=prepareReviewedBook(f.data),b=p.bundle,reviews:KnowledgeReviews={};
    b.sources[0].rightsBasis="permission";b.sources[0].rightsEvidence="Synthetic fixture permission only";
    for(const value of [...b.sources,...b.items])reviews[entryKey(value.kind==="book"?"source":"passage",value)]={actorUserId:1,reviewer:"Synthetic",at:new Date().toISOString(),approved:true,reason:"Synthetic",evaluationCaseIds:["synthetic-check"]};
    expect(publicationProblems(b,reviews,new Set()).some(p=>p.startsWith("Full-book coverage not verified"))).toBe(true);
    const result=retrieveExpertise({releaseId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hash:"a".repeat(64),revision:1,sources:b.sources,items:b.items},{message:"synthetic brand associations",segment:"personal_brand",language:"en"});
    expect(result.cards).toEqual([]);
  });
});
