import { z } from "zod";
import { coachConversationInputSchema } from "./miraCoach";

export const sourceContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(20_000),
  // A reference only: the server never fetches this URL.
  referenceUrl: z.string().url().max(2048).refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
    catch { return false; }
  }).optional(),
  rightsBasis: z.enum(["client_owned", "permission_granted"]),
  approvedForCoaching: z.literal(true),
}).strict();
export const addCoachSourceInputSchema = coachConversationInputSchema.extend({
  expectedRevision: z.number().int().nonnegative(), source: sourceContentSchema,
}).strict();
export const withdrawCoachSourceInputSchema = coachConversationInputSchema.extend({
  sourceId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
}).strict();
export const listCoachSourcesInputSchema = coachConversationInputSchema.extend({
  beforeId: z.string().uuid().optional(),
}).strict();
export type AddCoachSourceInput = z.infer<typeof addCoachSourceInputSchema>;
export type WithdrawCoachSourceInput = z.infer<typeof withdrawCoachSourceInputSchema>;
