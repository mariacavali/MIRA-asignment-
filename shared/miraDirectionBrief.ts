import { z } from "zod";
import { interviewAreaSchema, interviewCoverageSchema } from "./miraInterview";

export const DIRECTION_DIMENSION_LABELS = {
  "brand.meaning": "Brand meaning", "voice.profile": "Communication voice", "visual.direction": "Visual direction",
} as const;
export const directionBriefSchema = z.object({
  version: z.literal("direction-brief-v1"), revision: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["unavailable", "needs_confirmation", "collecting", "partial", "ready"]),
  reflectionFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  statements: z.array(z.object({ memoryId: z.string().uuid(), text: z.string().min(1).max(2000),
    kind: z.enum(["explicit", "interpreted"]), areas: z.array(interviewAreaSchema).min(1).max(9),
  }).strict()).max(9),
  unresolved: z.array(z.object({ area: interviewAreaSchema, status: interviewCoverageSchema.shape.areas.element.shape.status }).strict()).max(9),
  dimensions: z.array(z.object({ dimension: z.enum(["brand.meaning", "voice.profile", "visual.direction"]),
    ready: z.boolean(), missing: z.array(interviewAreaSchema).max(9), memoryIds: z.array(z.string().uuid()).max(9),
  }).strict()).max(3),
}).strict();
export type DirectionBrief = z.infer<typeof directionBriefSchema>;
