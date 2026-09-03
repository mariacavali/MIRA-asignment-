import { z } from "zod";

export const MIRA_ONBOARDING_EVENT_NAMES = [
  "photographer.onboarding_started",
  "photographer.onboarding_completed",
  "subscription.test_activated",
] as const;

export const miraOnboardingEventSchema = z.object({
  eventName: z.enum(MIRA_ONBOARDING_EVENT_NAMES),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  photographer: z.object({
    photographerId: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    businessName: z.string().trim().max(200).nullable(),
    email: z.string().email().regex(/(?:^synthetic[+.]|@example\\.test$)/i),
    website: z.string().url().nullable(),
    instagramUsername: z.string().trim().max(80).nullable(),
    timeZone: z.string().trim().min(1).max(128),
    selectedPlan: z.string().trim().min(1).max(80),
    paymentStatus: z.enum(["not_started", "test_active", "paid", "failed"]),
    onboardingStatus: z.enum(["started", "complete"]),
    registrationDate: z.string().datetime(),
    numberOfShoots: z.number().int().nonnegative(),
    lastActivityDate: z.string().datetime(),
  }).strict(),
}).strict();

export type MiraOnboardingEvent = z.infer<typeof miraOnboardingEventSchema>;

export function buildMiraOnboardingEvent(input: {
  eventName: MiraOnboardingEvent["eventName"];
  photographerId: number;
  name: string;
  businessName?: string | null;
  syntheticEmail: string;
  website?: string | null;
  instagramUsername?: string | null;
  timeZone: string;
  selectedPlan: string;
  paymentStatus: MiraOnboardingEvent["photographer"]["paymentStatus"];
  onboardingStatus: MiraOnboardingEvent["photographer"]["onboardingStatus"];
  registrationDate: Date;
  numberOfShoots: number;
  lastActivityDate?: Date;
}): MiraOnboardingEvent {
  return miraOnboardingEventSchema.parse({
    eventName: input.eventName,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    photographer: {
      photographerId: input.photographerId,
      name: input.name,
      businessName: input.businessName ?? null,
      email: input.syntheticEmail,
      website: input.website ?? null,
      instagramUsername: input.instagramUsername ?? null,
      timeZone: input.timeZone,
      selectedPlan: input.selectedPlan,
      paymentStatus: input.paymentStatus,
      onboardingStatus: input.onboardingStatus,
      registrationDate: input.registrationDate.toISOString(),
      numberOfShoots: input.numberOfShoots,
      lastActivityDate: (input.lastActivityDate ?? new Date()).toISOString(),
    },
  });
}
