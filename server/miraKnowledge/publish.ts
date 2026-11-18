import type { KnowledgeBundle, KnowledgeReviews } from "../../shared/miraKnowledge";
import { bookPassageCoverageReady } from "../../shared/miraKnowledge";
import { contentHash, entryKey } from "./schema";

export function publicationProblems(bundle: KnowledgeBundle, reviews: KnowledgeReviews, withdrawn: Set<string>): string[] {
  const problems: string[] = [];
  for (const source of bundle.sources) {
    const key = entryKey("source", source);
    if (withdrawn.has(key) || source.rightsBasis === "pending" || !source.rightsEvidence.trim() || !reviews[key]?.approved) problems.push(`Source not cleared: ${key}`);
  }
  for (const item of bundle.items) {
    const key = entryKey(item.kind, item), review = reviews[key];
    if (withdrawn.has(key) || !review?.approved || !review.evaluationCaseIds.length) problems.push(`Item not reviewed/evaluated: ${key}`);
    if (item.kind === "passage") {
      if (item.quality !== "verified") problems.push(`Passage quality not verified: ${key}`);
      if(!bookPassageCoverageReady(item,bundle.sources))problems.push(`Full-book coverage not verified: ${key}`);
    }
    for (const ref of item.sourceRefs) if (!bundle.sources.some(s => s.id === ref.id && s.version === ref.version)) problems.push(`Missing source: ${key}`);
  }
  return problems;
}
export function knowledgeDiff(previous: KnowledgeBundle | null, next: KnowledgeBundle) {
  const before = new Map(previous?.items.map(item => [`${item.kind}:${item.id}`, item]) ?? []);
  const after = new Map(next.items.map(item => [`${item.kind}:${item.id}`, item]));
  return {
    added: Array.from(after.keys()).filter(key => !before.has(key)),
    changed: Array.from(after.keys()).filter(key => before.has(key) && contentHash(before.get(key)) !== contentHash(after.get(key))),
    removed: Array.from(before.keys()).filter(key => !after.has(key)),
    unchanged: Array.from(after.keys()).filter(key => before.has(key) && contentHash(before.get(key)) === contentHash(after.get(key))),
    sourceChanges: contentHash(previous?.sources ?? []) !== contentHash(next.sources),
  };
}
