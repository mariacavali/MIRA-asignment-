import type { KnowledgeItem, KnowledgeSource } from "../../shared/miraKnowledge";
import { fullBookPassageReady, primaryKnowledgeText } from "../../shared/miraKnowledge";
import type { KnowledgeQuery } from "./retrieve";
import { stageAllowsItem } from '../miraCoach/conversationContext';

const stop = new Set("the and for with that this from have would could should what which when where your about please help want need like just tell more know them they their will does how can are was you our not but into who why all any some also been then than".split(" "));
const normalise = (text: string) => text.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase();
const terms = (text: string) => new Set((normalise(text).match(new RegExp("[\\p{L}\\p{N}]{3,}", "gu")) ?? []).filter(term => !stop.has(term)));
function fields(item: KnowledgeItem): [string, number][] {
  if (item.kind === "passage") return [[item.content, 3]];
  return [[item.title, 4], [item.decisionDimensions.join(" "), 2], ...(item.kind === "card"
    ? [[item.principle, 3], [item.useWhen.join(" "), 2], [item.requiredClientEvidence.join(" "), 1], [item.application.join(" "), 1]] as [string, number][]
    : [[item.situation, 3], [item.correction, 2], [item.betterResponse, 3], [item.explanation, 1]] as [string, number][])];
}

// Pure ranking shared by published retrieval and the isolated lab. Caller enforces source/item reviews.
export function rankKnowledgeCandidates(items: KnowledgeItem[], sources: KnowledgeSource[], query: KnowledgeQuery) {
  const queryTerms = terms(query.message);
  if (!queryTerms.size) return [];
  return items.flatMap(item => {
    if (!stageAllowsItem(item,query.stage)) return [];
    if (!fullBookPassageReady(item, sources)) return [];
    if (!item.segments.includes(query.segment) || !(item.language === query.language || item.language === query.language.split("-")[0])
      || (query.dimensions?.length && !item.decisionDimensions.some(d => query.dimensions!.includes(d)))) return [];
    const citations = [];
    for (const ref of item.sourceRefs) {
      const source = sources.find(s => s.id === ref.id && s.version === ref.version && s.rightsBasis !== "pending" && s.rightsEvidence.trim());
      if (!source) return [];
      citations.push({ id: source.id, version: source.version, title: source.title, locator: ref.locator });
    }
    const matched = new Set<string>(); let score = 0;
    for (const [text, weight] of fields(item)) {
      const documentTerms = terms(text);
      for (const term of Array.from(queryTerms)) if (documentTerms.has(term)) { score += weight; matched.add(term); }
    }
    const titleTerms = terms(item.title);
    const titleMatch = Array.from(queryTerms).some(term => titleTerms.has(term));
    const primaryTerms = terms(primaryKnowledgeText(item));
    const primaryMatch = Array.from(queryTerms).some(term => primaryTerms.has(term));
    if (score < 3 || (matched.size < 2 && !titleMatch && !(primaryMatch && score >= 5))) return [];
    const duplicateKey = normalise(primaryKnowledgeText(item)).replace(/\s+/g, " ").trim();
    return [{ item, citations, score, duplicateKey, category: item.kind === "card" ? item.category : item.kind === "passage" ? `book:${item.sourceRefs[0].id}` : "judgement" }];
  }).sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : b.item.version - a.item.version));
}
