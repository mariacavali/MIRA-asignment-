import { emptyKnowledgeGuidance, knowledgeGuidanceSchema, knowledgeLanguageSchema, publishedKnowledgeSnapshotSchema,
  KNOWLEDGE_CONTEXT_MAX_CHARACTERS, type KnowledgeGuidance, type PublishedKnowledgeSnapshot } from "../../shared/miraKnowledgeRetrieval";
import { knowledgeQuerySchema } from "./retrieve";
import { preparePineconeSeedPlan, type PineconeTarget } from "./pineconePlan";
import type { PineconeSearch } from "./pineconeClient";
import { primaryKnowledgeText } from "../../shared/miraKnowledge";
import { stageAllowsItem, type ConversationStage } from '../miraCoach/conversationContext';

const algorithm = "pinecone-documents-v1" as const;
export function createPineconeKnowledgeRetriever(options: { enabled: boolean; target: PineconeTarget; language?: string;
  snapshot: () => Promise<PublishedKnowledgeSnapshot>; search: PineconeSearch; timeoutMs?: number; minimumScore?: number }) {
  const language = knowledgeLanguageSchema.parse(options.language ?? "en"), timeoutMs = options.timeoutMs ?? 6500, minimumScore = options.minimumScore ?? 0.25;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000 || !Number.isFinite(minimumScore) || minimumScore < -1 || minimumScore > 1) throw new Error("Invalid expertise search limits.");
  return async (input: { message: string; segment: KnowledgeGuidance["segment"]; stage?: ConversationStage }): Promise<KnowledgeGuidance> => {
    if (!options.enabled) return emptyKnowledgeGuidance("disabled", input.segment, language, algorithm);
    if (!input.segment) return emptyKnowledgeGuidance("unconfigured", null, language, algorithm);
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const work = async () => {
      const query = knowledgeQuerySchema.parse({ ...input, language });
      const before = publishedKnowledgeSnapshotSchema.parse(await options.snapshot()); abort.signal.throwIfAborted();
      const plan = preparePineconeSeedPlan(before, options.target);
      const result: KnowledgeGuidance = { ...emptyKnowledgeGuidance("no_match", input.segment, language, algorithm), releaseId: before.releaseId, hash: before.hash, revision: before.revision };
      if (!plan.documents.length || !query.message.trim() || !before.items.some(item => item.segments.includes(query.segment)
        && (item.language === language || item.language === language.split("-")[0])
        && (!query.dimensions?.length || item.decisionDimensions.some(dimension => query.dimensions!.includes(dimension))))) return result;
      const corpusKey = plan.documents[0].mira_corpus;
      const filter = { mira_scope: { $eq: "published-expertise-v1" }, mira_corpus: { $eq: corpusKey },
        mira_segments: { $in: [query.segment] }, mira_language: { $in: Array.from(new Set([language, language.split("-")[0]])) },
        ...(query.dimensions?.length ? { mira_dimensions: { $in: query.dimensions } } : {}) };
      abort.signal.throwIfAborted();
      const matches = await options.search({ namespace: plan.preview.target.namespace, query: query.message, filter, signal: abort.signal });
      abort.signal.throwIfAborted();
      const current = publishedKnowledgeSnapshotSchema.parse(await options.snapshot()); abort.signal.throwIfAborted();
      const fresh = preparePineconeSeedPlan(current, options.target);
      if (fresh.preview.target.namespace !== plan.preview.target.namespace) throw new Error("Published expertise changed.");
      result.revision = current.revision;
      const expected = new Map(plan.documents.map(document => [document._id, document]));
      const candidates = matches.flatMap(match => {
        const document = expected.get(match._id);
        if (!document || match._score === null || match._score < minimumScore || match.mira_corpus !== corpusKey
          || match.mira_item !== document.mira_item || match.mira_kind !== document.mira_kind || match.mira_version !== document.mira_version || match.mira_item_hash !== document.mira_item_hash) return [];
        const item = current.items.find(item => item.id === document.mira_item && item.kind === document.mira_kind && item.version === document.mira_version);
        if (!item || !stageAllowsItem(item,query.stage) || !item.segments.includes(query.segment) || !(item.language === language || item.language === language.split("-")[0])
          || (query.dimensions?.length && !item.decisionDimensions.some(dimension => query.dimensions!.includes(dimension)))) return [];
        const citations = item.sourceRefs.map(ref => {
          const source = current.sources.find(source => source.id === ref.id && source.version === ref.version && source.rightsBasis !== "pending" && source.rightsEvidence.trim());
          if (!source) throw new Error("Source unavailable.");
          return { id: source.id, version: source.version, title: source.title, locator: ref.locator };
        });
        return [{ item, citations, score: match._score, category: item.kind === "card" ? item.category : item.kind === "passage" ? `book:${item.sourceRefs[0].id}` : "judgement",
          meaning: primaryKnowledgeText(item).normalize("NFKD").toLowerCase().replace(/\s+/g, " ").trim() }];
      }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id, "en"));
      const ids = new Set<string>(), meanings = new Set<string>(), categories = new Map<string, number>(); let excluded = false;
      for (const categoryLimit of [1, 2]) for (const candidate of candidates) {
        const id = `${candidate.item.kind}:${candidate.item.id}`;
        if (result.cards.length >= 4 || ids.has(id) || meanings.has(candidate.meaning) || (categories.get(candidate.category) ?? 0) >= categoryLimit) continue;
        const next = { ...result, status: "matched" as const, cards: [...result.cards, { item: candidate.item, citations: candidate.citations }] };
        if (JSON.stringify(next).length > KNOWLEDGE_CONTEXT_MAX_CHARACTERS) { excluded = true; continue; }
        result.status = "matched"; result.cards = next.cards; ids.add(id); meanings.add(candidate.meaning); categories.set(candidate.category, (categories.get(candidate.category) ?? 0) + 1);
      }
      if (!result.cards.length && excluded) result.status = "budget_excluded";
      // Provider text never enters the model: all guidance is rehydrated from
      // the current reviewed catalogue, with current citations and limitations.
      return knowledgeGuidanceSchema.parse(result);
    };
    try { return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error("Expertise deadline")); }, timeoutMs); })]); }
    catch { return emptyKnowledgeGuidance("unavailable", input.segment, language, algorithm); }
    finally { if (timer) clearTimeout(timer); }
  };
}
