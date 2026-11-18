import { coachKnowledgeTraceSchema } from "./miraKnowledgeRetrieval";
import { interviewPlanSchema, interviewMappingsSchema, interviewStateObservationsSchema } from "./miraInterview";
import { z } from "zod";

export const coachTurnInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  conversationId: z.string().uuid(),
  requestId: z.string().uuid(),
  message: z.string().trim().min(1).max(8000),
}).strict();

export const coachMessageSchema = z.object({
  role: z.enum(["client", "assistant"]),
  content: z.string().min(1).max(8000),
}).strict();

export const brandEvidenceSchema = z.object({
  id: z.string().min(1).max(128),
  text: z.string().min(1).max(2000),
  kind: z.enum(["explicit", "interpreted"]),
  confirmed: z.boolean(),
  provenance: z.object({ sourceId: z.string().uuid(), title: z.string().min(1).max(200),
    referenceUrl: z.string().max(2048).optional(), rightsBasis: z.enum(["client_owned", "permission_granted"]),
    start: z.number().int().nonnegative(), end: z.number().int().positive(),
  }).strict().optional(),
}).strict();

export const coachDraftSchema = z.object({
  interviewStates: interviewStateObservationsSchema.optional(),
  interviewProposals: interviewMappingsSchema.optional(),
  response: z.string().trim().min(1).max(8000),
  // Proposals are never applied to approved brand memory by this workflow.
  memoryProposals: z.array(z.object({
    text: z.string().trim().min(1).max(2000),
    kind: z.enum(["explicit", "interpreted"]),
  }).strict()).max(10),
}).strict();

export type CoachTurnInput = z.infer<typeof coachTurnInputSchema>;
export type CoachMessage = z.infer<typeof coachMessageSchema>;
export type BrandEvidence = z.infer<typeof brandEvidenceSchema>;
export type CoachDraft = z.infer<typeof coachDraftSchema>;

// Application-owned entry metadata. Models cannot supply it through coachDraftSchema.
export const coachInterviewOpeningSchema = z.object({
  version: z.literal("mira-opening-v1"),
  segment: z.enum(["personal", "personal_brand"]),
  question: z.string().min(1).max(500),
}).strict();
export type CoachInterviewOpening = z.infer<typeof coachInterviewOpeningSchema>;

export const completedCoachTurnSchema = z.object({
  interviewStates: interviewStateObservationsSchema.optional(),
  interviewProposals: interviewMappingsSchema.optional(),
  interviewPlan: interviewPlanSchema.optional(),
  interviewOpening: coachInterviewOpeningSchema.optional(),
  knowledgeTrace: coachKnowledgeTraceSchema.optional(),
  response: coachDraftSchema.shape.response,
  memoryProposals: z.array(coachDraftSchema.shape.memoryProposals.element.extend({
    status: z.literal("pending_confirmation"),
    sourceRequestId: z.string().uuid(),
  }).strict()).max(10),
}).strict();
export type CompletedCoachTurn = z.infer<typeof completedCoachTurnSchema>;
export type PendingMemoryProposal = CompletedCoachTurn["memoryProposals"][number];

// Memory stays private to the authenticated conversation owner.
export const coachConversationInputSchema = z.object({
  workspaceId: z.number().int().positive(), conversationId: z.string().uuid(),
}).strict();
export const coachMemoryListInputSchema = coachConversationInputSchema.extend({
  beforeId: z.string().uuid().optional(),
}).strict();
export const coachMemoryDecisionInputSchema = coachConversationInputSchema.extend({
  proposalId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["confirmed", "rejected"]),
}).strict();
export type CoachMemoryDecisionInput = z.infer<typeof coachMemoryDecisionInputSchema>;
