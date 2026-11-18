import type { KnowledgeBundle } from "../../shared/miraKnowledge";
import { INCOMPLETE_BOOK_LABEL } from "../../shared/miraKnowledge";
import { contentHash, normaliseBundle } from "./schema";

export function prepareCheckedIncompleteBook(raw:KnowledgeBundle, acceptance:{
  bundleHash:string; actor:string; at:string; reason:string; evidence:string;
  exclusionManifest:string; exclusionSha256:string;
}):KnowledgeBundle {
  const prior=normaliseBundle(raw);
  if(contentHash(prior)!==acceptance.bundleHash||prior.sources.length!==1
    ||prior.sources[0].checkedPartialPublication||!prior.items.every(i=>i.kind==="passage"&&i.quality==="verified")) {
    throw new Error("Acceptance must identify the exact checked book draft.");
  }
  const next=structuredClone(prior),source=next.sources[0],coverage=source.fullBookCoverage;
  if(!coverage||coverage.status!=="pending"||!coverage.missingOrUnreadable.length
    ||coverage.expectedPhysicalPages!==coverage.processedPhysicalPages)throw new Error("Explicit incomplete coverage and available-page receipts required.");
  source.version++;
  for(const item of next.items){
    item.version++;
    for(const ref of item.sourceRefs)ref.version=source.version;
    item.limitations=[...item.limitations,INCOMPLETE_BOOK_LABEL];
  }
  source.checkedPartialPublication={mode:"checked_available_incomplete",bookComplete:false,sourceVersion:source.version,
    label:INCOMPLETE_BOOK_LABEL,acceptance:{actor:acceptance.actor,at:acceptance.at,reason:acceptance.reason,evidence:acceptance.evidence},
    exclusions:{manifest:acceptance.exclusionManifest,sha256:acceptance.exclusionSha256,acceptedIssues:[...coverage.missingOrUnreadable]},
    passages:next.items.map(item=>({id:item.id,version:item.version}))};
  // No rights field, full-coverage claim, passage content, provenance or review is changed.
  return normaliseBundle(next);
}
