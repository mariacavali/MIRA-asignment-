import { z } from "zod";
import { coachConversationInputSchema } from "./miraCoach";
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
export const sessionReferenceSchema = z.object({ id: z.string().uuid(), workspaceId: z.number().int().positive(), conversationId: z.string().uuid(),
  name: z.string().min(1).max(200), mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]),
  size: z.number().int().positive().max(MAX_REFERENCE_BYTES), hash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(),
  status: z.enum(["saved", "text_ready", "needs_description", "withdrawn"]), note: z.string().max(1000), sourceId: z.string().uuid().nullable(), sourceIds: z.array(z.string().uuid()).max(3).optional(),
}).strict();
export type SessionReference = z.infer<typeof sessionReferenceSchema>;
export const uploadSessionReferenceSchema = coachConversationInputSchema.extend({
  requestId: z.string().uuid(), name: z.string().trim().min(1).max(200), mime: sessionReferenceSchema.shape.mime,
  base64: z.string().min(1).max(Math.ceil(MAX_REFERENCE_BYTES / 3) * 4), approvedForCoaching: z.literal(true),
  description: z.string().trim().max(4000).default(""),
}).strict();
export const localProviderTrialSchema = z.object({
  state: z.enum(["not_authorised", "active", "expired", "exhausted"]),
  maxRequests: z.number().int().min(0).max(12), usedRequests: z.number().int().min(0).max(12),
  remainingRequests: z.number().int().min(0).max(12), expiresAt: z.string().datetime().nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.usedRequests > value.maxRequests || value.remainingRequests > value.maxRequests - value.usedRequests
    || (value.state === "active" && (!value.remainingRequests || !value.expiresAt))
    || (value.state !== "active" && value.remainingRequests !== 0)) {
    ctx.addIssue({ code: "custom", message: "Invalid local trial allowance." });
  }
});
export type LocalProviderTrial = z.infer<typeof localProviderTrialSchema>;
export const sessionCapabilitiesSchema = z.object({ localReview: z.boolean(), text: z.boolean(), voice: z.boolean(), vision: z.boolean(), uploads: z.boolean(),
  providerMessage: z.string().max(500), publishedKnowledge: z.boolean(), trial: localProviderTrialSchema.optional() }).strict();
export type SessionCapabilities = z.infer<typeof sessionCapabilitiesSchema>;
