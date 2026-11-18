import { z } from "zod";

export const interviewAreaSchema = z.enum(["intended_use", "offer", "audience", "desired_understanding", "meaningful_evidence", "voice", "visual_preferences", "visual_boundaries", "existing_identity"]);
export type InterviewArea = z.infer<typeof interviewAreaSchema>;
export const INTERVIEW_AREA_LABELS: Record<InterviewArea, string> = {
  intended_use: "What this work should help you do", offer: "Your offer", audience: "People you want to reach",
  desired_understanding: "What you want people to understand", meaningful_evidence: "A meaningful example",
  voice: "Your preferred voice", visual_preferences: "Visual preferences", visual_boundaries: "Visual boundaries",
  existing_identity: "What to preserve from your existing brand",
};
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const interviewStateObservationSchema = z.object({ area: interviewAreaSchema, status: z.enum(["unknown", "declined", "needs_review"]), quote: z.string().trim().min(1).max(1000) }).strict();
export const interviewStateObservationsSchema = z.array(interviewStateObservationSchema).max(9).superRefine((items, ctx) => {
  if (new Set(items.map(item => item.area)).size !== items.length) ctx.addIssue({ code: "custom", message: "Use one conversational state per area." });
});
// Models may suggest a supplied confirmed memory or a new memory from this reply.
export const interviewMappingSchema = z.object({ area: interviewAreaSchema, memoryId: z.string().uuid().nullable(), memoryProposalIndex: z.number().int().min(0).max(9).nullable(), correctionQuote: z.string().trim().min(1).max(1000).nullable().optional() }).strict();
export const interviewMappingsSchema = z.array(interviewMappingSchema).max(9).superRefine((items, ctx) => {
  if (new Set(items.map(item => item.area)).size !== items.length || items.some(item => (item.memoryId === null) === (item.memoryProposalIndex === null))) {
    ctx.addIssue({ code: "custom", message: "Suggest one source per area, using either saved memory or a new memory index." });
  }
});
const savedProposalSchema = z.object({ id: hashSchema, area: interviewAreaSchema, memoryId: z.string().uuid(), memoryHash: hashSchema,
  sourceRequestId: z.string().uuid(), status: z.enum(["pending", "dismissed", "accepted", "superseded"]), correctionQuote: z.string().min(1).max(1000).optional() }).strict();
const decisionSchema = z.object({ area: interviewAreaSchema, status: z.enum(["answered", "unknown", "declined", "needs_review"]), memoryId: z.string().uuid().nullable(), memoryHash: hashSchema.optional() }).strict().superRefine((value, ctx) => {
  if ((value.status === "answered") !== (value.memoryId !== null)) ctx.addIssue({ code: "custom", message: "An answered area needs a confirmed memory reference; other states have no answer." });
});
export const interviewLedgerSchema = z.object({
  version: z.literal("interview-coverage-v1"), configurationKey: z.string().regex(/^[a-f0-9]{64}$/),
  decisions: z.array(decisionSchema).max(9), reviewedFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  proposals: z.array(savedProposalSchema).max(90).optional(),
  stateObservations: z.array(interviewStateObservationSchema.extend({ sourceRequestId: z.string().uuid() }).strict()).max(9).optional(),
}).strict().superRefine(({ decisions }, ctx) => {
  if (new Set(decisions.map(item => item.area)).size !== decisions.length) ctx.addIssue({ code: "custom", message: "Coverage areas must be unique." });
});
export type InterviewLedger = z.infer<typeof interviewLedgerSchema>;
export const interviewCoverageSchema = z.object({
  version: z.literal("interview-coverage-v1"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  areas: z.array(z.object({ area: interviewAreaSchema, status: z.enum(["missing", "answered", "unknown", "declined", "needs_review"]), memoryId: z.string().uuid().nullable(), answer: z.string().min(1).max(2000).nullable() }).strict()).max(9),
  answered: z.number().int().min(0).max(9), unresolved: z.number().int().min(0).max(9),
  reviewed: z.boolean(), progressPercent: z.number().int().min(10).max(100),
  proposals: z.array(savedProposalSchema.pick({ id: true, area: true, memoryId: true, sourceRequestId: true }).extend({
    answer: z.string().min(1).max(2000), memoryStatus: z.enum(["confirmed", "pending_confirmation"]),
  }).strict()).max(90).optional(),
}).strict();
export type InterviewCoverage = z.infer<typeof interviewCoverageSchema>;
const interviewScopeInputSchema = z.object({
  workspaceId: z.number().int().positive(), conversationId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
}).strict();
export const interviewReviewInputSchema = interviewScopeInputSchema.extend({
  area: interviewAreaSchema, status: decisionSchema.shape.status, memoryId: z.string().uuid().nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.status === "answered") !== (value.memoryId !== null)) ctx.addIssue({ code: "custom", message: "Select a confirmed answer, or leave the area unresolved." });
});
export const interviewConfirmInputSchema = interviewScopeInputSchema;
export const interviewReflectionInputSchema = interviewScopeInputSchema.extend({ fingerprint: hashSchema }).strict();
export type InterviewReflectionInput = z.infer<typeof interviewReflectionInputSchema>;
export const interviewProposalReviewInputSchema = interviewScopeInputSchema.extend({ proposalId: hashSchema, action: z.enum(["accept", "dismiss"]) }).strict();
export type InterviewProposalReviewInput = z.infer<typeof interviewProposalReviewInputSchema>;
export type InterviewReviewInput = z.infer<typeof interviewReviewInputSchema>;
export type InterviewConfirmInput = z.infer<typeof interviewConfirmInputSchema>;
export const interviewPlanSchema = z.object({
  mode: z.literal("adaptive").optional(),
  version: z.literal("interview-planner-v1"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  phase: z.enum(["discovery", "reflection", "reviewed", "closing"]), nextArea: interviewAreaSchema.nullable(),
  question: z.string().max(500).nullable(), alternative: z.string().max(500).nullable(),
  answered: z.number().int().min(0).max(9), required: z.number().int().min(1).max(9), unresolved: z.number().int().min(0).max(9),
  coverage: z.array(interviewCoverageSchema.shape.areas.element.pick({ area: true, status: true })).max(9),
  progressPercent: z.number().int().min(10).max(100), remainingMs: z.number().int().nonnegative().nullable(),
  pendingAreas: z.array(interviewAreaSchema).max(9).optional(),
}).strict();
export type InterviewPlan = z.infer<typeof interviewPlanSchema>;

// This snapshot is built by the server from exact source-linked text. Accepting it
// approves only these displayed answers, never a generated Brand Book or direction.
export const interviewReflectionSchema = z.object({
  fingerprint: hashSchema, reviewed: z.boolean(),
  answers: z.array(z.object({ area: interviewAreaSchema, memoryId: z.string().uuid(), text: z.string().min(1).max(2000),
    status: z.enum(["confirmed", "proposed"]), kind: z.enum(["explicit", "interpreted"]), proposalId: hashSchema.nullable(),
  }).strict()).max(9),
  unresolved: z.array(z.object({ area: interviewAreaSchema, status: interviewCoverageSchema.shape.areas.element.shape.status }).strict()).max(9),
}).strict();
export type InterviewReflection = z.infer<typeof interviewReflectionSchema>;
export const interviewWorkingEvidenceSchema = z.array(z.object({ area: interviewAreaSchema, memoryId: z.string().uuid(), text: z.string().min(1).max(2000), kind: z.enum(["explicit", "interpreted"]) }).strict()).max(9);
