import { z } from "zod";
import { knowledgeItemSchema, knowledgeRefSchema, knowledgeSourceSchema, MAX_KNOWLEDGE_ITEMS } from "./miraKnowledge";

export const COACH_POLICY_VERSION = "brand-coach-v18-client-boundaries";
export const KNOWLEDGE_CONTEXT_MAX_CHARACTERS = 6000;
export const knowledgeSegmentSchema = z.enum(["personal", "personal_brand", "small_business"]);
export const knowledgeLanguageSchema = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
export const knowledgeSelectionRefSchema = knowledgeRefSchema.extend({ kind: z.enum(["card", "judgement", "passage"]) }).strict();
export const publishedKnowledgeSnapshotSchema = z.object({
  releaseId: z.string().uuid().nullable(), hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), revision: z.number().int().nonnegative(),
  items: z.array(knowledgeItemSchema).max(MAX_KNOWLEDGE_ITEMS), sources: z.array(knowledgeSourceSchema).max(200),
}).strict().superRefine((snapshot, ctx) => {
  if ((snapshot.releaseId === null) !== (snapshot.hash === null) || (snapshot.releaseId === null && (snapshot.items.length || snapshot.sources.length))) ctx.addIssue({ code: "custom", message: "An inactive corpus cannot contain runtime knowledge." });
});
export const retrievedKnowledgeSchema = z.object({
  item: knowledgeItemSchema,
  citations: z.array(knowledgeRefSchema.extend({ title: z.string().min(1).max(4000), locator: z.string().min(1).max(4000) }).strict()).max(20),
}).strict();
export const knowledgeGuidanceSchema = z.object({
  algorithm: z.enum(["lexical-v1", "pinecone-documents-v1"]),
  status: z.enum(["matched", "no_match", "unavailable", "disabled", "unconfigured", "budget_excluded"]),
  releaseId: z.string().uuid().nullable(), hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), revision: z.number().int().nonnegative().nullable(),
  segment: knowledgeSegmentSchema.nullable(), language: knowledgeLanguageSchema,
  cards: z.array(retrievedKnowledgeSchema).max(4),
}).strict().superRefine((value, ctx) => {
  if ((value.status === "matched") !== (value.cards.length > 0)) ctx.addIssue({ code: "custom", message: "Only matched guidance can contain cards." });
  if (value.cards.length && (!value.releaseId || !value.hash || value.revision === null || !value.segment)) ctx.addIssue({ code: "custom", message: "Guidance requires corpus and segment provenance." });
  if (JSON.stringify(value).length > KNOWLEDGE_CONTEXT_MAX_CHARACTERS) ctx.addIssue({ code: "custom", message: "Knowledge context exceeds its budget." });
});
export const coachKnowledgeTraceSchema = knowledgeGuidanceSchema.omit({ cards: true }).extend({ policyVersion: z.string().min(1).max(80), selected: z.array(knowledgeSelectionRefSchema).max(4) }).strict().superRefine((trace, ctx) => {
  if ((trace.status === "matched") !== (trace.selected.length > 0)) ctx.addIssue({ code: "custom", message: "Trace must match the selected guidance." });
  if (trace.selected.length && (!trace.releaseId || !trace.hash || trace.revision === null || !trace.segment)) ctx.addIssue({ code: "custom", message: "Selected knowledge requires corpus provenance." });
});
export type PublishedKnowledgeSnapshot = z.infer<typeof publishedKnowledgeSnapshotSchema>;
export type KnowledgeGuidance = z.infer<typeof knowledgeGuidanceSchema>;
export type CoachKnowledgeTrace = z.infer<typeof coachKnowledgeTraceSchema>;
export function emptyKnowledgeGuidance(status: Exclude<KnowledgeGuidance["status"], "matched">, segment: KnowledgeGuidance["segment"] = null, language = "en", algorithm: KnowledgeGuidance["algorithm"] = "lexical-v1"): KnowledgeGuidance {
  return knowledgeGuidanceSchema.parse({ algorithm, status, releaseId: null, hash: null, revision: null, segment, language, cards: [] });
}
export function knowledgeTrace(guidance: KnowledgeGuidance): CoachKnowledgeTrace {
  const { cards, ...metadata } = guidance;
  return coachKnowledgeTraceSchema.parse({ ...metadata, policyVersion: COACH_POLICY_VERSION, selected: cards.map(({ item }) => ({ kind: item.kind, id: item.id, version: item.version })) });
}
