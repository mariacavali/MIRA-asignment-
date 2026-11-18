import { z } from "zod";
import { knowledgeGuidanceSchema, publishedKnowledgeSnapshotSchema, emptyKnowledgeGuidance, knowledgeLanguageSchema, knowledgeSegmentSchema,
  KNOWLEDGE_CONTEXT_MAX_CHARACTERS, type KnowledgeGuidance, type PublishedKnowledgeSnapshot } from "../../shared/miraKnowledgeRetrieval";
import { rankKnowledgeCandidates } from "./lexical";
import type { ConversationStage } from '../miraCoach/conversationContext';

export const knowledgeQuerySchema = z.object({ message: z.string().max(8000), segment: knowledgeSegmentSchema, language: knowledgeLanguageSchema,
  dimensions: z.array(z.string().min(1).max(80)).max(20).optional(), stage: z.enum(['discovery','brand_review','visual_direction','shoot_planning','measurement']).optional() }).strict();
export type KnowledgeQuery = z.infer<typeof knowledgeQuerySchema>;
// No embeddings, paid routing or cached cross-client content. Input is exclusively the published global snapshot.
export function retrieveExpertise(rawSnapshot: PublishedKnowledgeSnapshot, rawQuery: KnowledgeQuery): KnowledgeGuidance {
  const snapshot = publishedKnowledgeSnapshotSchema.parse(rawSnapshot), query = knowledgeQuerySchema.parse(rawQuery);
  const result: KnowledgeGuidance = { ...emptyKnowledgeGuidance("no_match", query.segment, query.language), releaseId: snapshot.releaseId, hash: snapshot.hash, revision: snapshot.revision };
  if (!snapshot.releaseId) return knowledgeGuidanceSchema.parse(result);
  const candidates = rankKnowledgeCandidates(snapshot.items, snapshot.sources, query);
  const seen = new Set<string>(), perCategory = new Map<string, number>(); let budgetExcluded = false;
  // First pass adds category variety; second fills up to two per category.
  for (const categoryLimit of [1, 2]) for (const candidate of candidates) {
    if (result.cards.length >= 4) break;
    if (seen.has(candidate.duplicateKey) || (perCategory.get(candidate.category) ?? 0) >= categoryLimit) continue;
    const next = { ...result, status: "matched" as const, cards: [...result.cards, { item: candidate.item, citations: candidate.citations }] };
    if (JSON.stringify(next).length > KNOWLEDGE_CONTEXT_MAX_CHARACTERS) { budgetExcluded = true; continue; }
    result.status = "matched"; result.cards = next.cards; seen.add(candidate.duplicateKey);
    perCategory.set(candidate.category, (perCategory.get(candidate.category) ?? 0) + 1);
  }
  if (!result.cards.length && budgetExcluded) result.status = "budget_excluded";
  return knowledgeGuidanceSchema.parse(result);
}

export function createKnowledgeRetriever(options: {
  enabled: boolean; language?: string; snapshot: () => Promise<PublishedKnowledgeSnapshot>; timeoutMs?: number;
}) {
  const language = knowledgeLanguageSchema.parse(options.language ?? "en"), timeoutMs = options.timeoutMs ?? 1500;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error("Knowledge lookup timeout must be 1–5000 ms.");
  return async (input: { message: string; segment: KnowledgeGuidance["segment"]; stage?: ConversationStage }): Promise<KnowledgeGuidance> => {
    if (!options.enabled) return emptyKnowledgeGuidance("disabled", input.segment, language);
    if (!input.segment) return emptyKnowledgeGuidance("unconfigured", null, language);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // One bounded read; an outage never causes a stronger model call or an implicit paid retry.
      const snapshot = await Promise.race([options.snapshot(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Knowledge lookup timed out")), timeoutMs); })]);
      return retrieveExpertise(snapshot, { message: input.message, segment: input.segment, language, stage: input.stage });
    } catch { return emptyKnowledgeGuidance("unavailable", input.segment, language); }
    finally { if (timer) clearTimeout(timer); }
  };
}
