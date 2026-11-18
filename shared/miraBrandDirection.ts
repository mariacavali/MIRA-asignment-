import { z } from "zod";
import { coachConversationInputSchema } from "./miraCoach";

// Configuration describes discovery, never grants commercial access.
export const brandConfigurationSchema = z.object({
  segment: z.enum(["personal", "personal_brand", "small_business"]),
  accessMethod: z.enum(["paid_shoot", "standalone_brand", "social_plan"]),
  discoveryDepth: z.enum(["light", "refinement", "deep"]),
  brandStage: z.enum(["starting", "established", "evolving", "unknown"]),
  shootId: z.number().int().positive().nullable(),
  shootFormat: z.enum(["remote", "in_person"]).nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.shootId === null) !== (value.shootFormat === null)) ctx.addIssue({ code: "custom", message: "Shoot ID and format must be set together." });
  if (value.accessMethod === "standalone_brand" && (value.segment !== "personal_brand" || value.shootId !== null)) ctx.addIssue({ code: "custom", message: "Standalone direction uses personal brand discovery without a shoot." });
});
export type BrandConfiguration = z.infer<typeof brandConfigurationSchema>;
export function directionPolicy(config: BrandConfiguration) {
  const booked = config.shootId !== null;
  return {
    voice: config.segment !== "personal",
    deliverable: config.segment === "personal" ? "personal_preparation" : config.segment === "personal_brand" ? "brand_book" : "business_guidelines",
    moodboard: config.segment !== "small_business",
    posing: booked && config.segment !== "small_business",
    bookingEmails: booked,
    preserveExistingIdentity: config.segment === "small_business" && config.brandStage === "established",
  } as const;
}
const text = z.string().trim().min(1).max(2000);
const strings = z.array(text).min(1).max(20);
export const decisionValueSchemas = {
  "brand.meaning": z.object({ purpose: text, audience: text, intendedUse: strings }).strict(),
  "voice.profile": z.object({ traits: strings, avoid: strings, examples: strings }).strict(),
  "visual.direction": z.object({ light: text, colour: text, composition: text, references: strings, boundaries: strings }).strict(),
};
const evidence = z.object({ kind: z.enum(["memory", "source"]), id: z.string().uuid() }).strict();
const base = { id: z.string().uuid(), evidence: z.array(evidence).min(1).max(20), explanation: text,
  uncertainty: z.string().trim().max(2000), questionIds: z.array(z.string().uuid()).max(20),
  knowledge: z.array(z.object({ id: text, version: z.number().int().positive() }).strict()).max(20) };
export const directionDecisionSchema = z.discriminatedUnion("dimension", [
  z.object({ ...base, dimension: z.literal("brand.meaning"), value: decisionValueSchemas["brand.meaning"] }).strict(),
  z.object({ ...base, dimension: z.literal("voice.profile"), value: decisionValueSchemas["voice.profile"] }).strict(),
  z.object({ ...base, dimension: z.literal("visual.direction"), value: decisionValueSchemas["visual.direction"] }).strict(),
]);
export const directionDraftSchema = z.object({
  decisions: z.array(directionDecisionSchema).min(1).max(3), unknowns: z.array(text).max(30),
}).strict().superRefine(({ decisions }, ctx) => {
  if (new Set(decisions.map(d => d.dimension)).size !== decisions.length || new Set(decisions.map(d => d.id)).size !== decisions.length) ctx.addIssue({ code: "custom", message: "Decision IDs and dimensions must be unique." });
});
export type DirectionDraft = z.infer<typeof directionDraftSchema>;
export type DirectionReview = { decisionId: string; action: "accept" | "change" | "decline" | "unsure"; reason: string; actorUserId: number; at: string };
export type DirectionRecord = { id: string; parentId: string | null; evidenceRevision: number; configuration: BrandConfiguration;
  draft: DirectionDraft; reviews: DirectionReview[]; state: "draft" | "approved"; stale: boolean };
export const saveDirectionInputSchema = coachConversationInputSchema.extend({
  expectedRevision: z.number().int().nonnegative(), parentId: z.string().uuid().nullable(), draft: directionDraftSchema,
}).strict();
export const reviewDirectionInputSchema = coachConversationInputSchema.extend({
  expectedRevision: z.number().int().nonnegative(), directionId: z.string().uuid(), decisionId: z.string().uuid(),
  requestId: z.string().uuid(), action: z.enum(["accept", "change", "decline", "unsure"]), reason: z.string().trim().max(2000),
}).strict().superRefine((v, ctx) => { if (v.action === "change" && !v.reason) ctx.addIssue({ code: "custom", message: "Explain the correction." }); });
export const approveDirectionInputSchema = coachConversationInputSchema.extend({ expectedRevision: z.number().int().nonnegative(), directionId: z.string().uuid() }).strict();
export const configureDirectionInputSchema = coachConversationInputSchema.extend({ expectedRevision: z.number().int().nonnegative(), configuration: brandConfigurationSchema }).strict();
