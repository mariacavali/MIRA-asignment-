import { z } from "zod";

export const MIRA_SHOOT_MEMORY_SCHEMA_VERSION = "1.0" as const;
export const MIRA_MASTER_PROMPT_VERSION = "shoot-preparation-v1" as const;
export const MIRA_CLIENT_CONSENT_POLICY_VERSION = "call-preparation-v1" as const;

export const shootSourceModeSchema = z.enum(["maria_photography", "mira_saas"]);
export const shootStatusSchema = z.enum([
  "draft",
  "client_invited",
  "conversation_in_progress",
  "preparation_ready",
  "photographer_review",
  "revisions_requested",
  "approved",
  "ready_to_shoot",
  "archived",
]);

export const shootRoomStateSchema = z.enum([
  "welcome",
  "discovery_offered",
  "discovery_in_progress",
  "summary_pending",
  "discovery_confirmed",
  "preparation_active",
]);
export type ShootRoomState = z.infer<typeof shootRoomStateSchema>;

const memoryValueSchema = z
  .object({
    value: z.union([
      z.string().trim().min(1).max(1200),
      z.array(z.string().trim().min(1).max(300)).max(20),
    ]),
    kind: z.enum(["explicit", "interpreted"]),
    confidence: z.enum(["high", "medium", "low"]),
    // Every current writer (server/miraCore/db.ts's persistRealtimeMemoryTool,
    // recordShootScheduleResponse, and the text-test flow via
    // memoryPatchForTextTestAnswer) happens to generate these with
    // crypto.randomUUID(), but nothing guarantees that: the parameter type
    // (`sourceEventId: string`) and the storage column
    // (`mira_call_events.id`, a plain varchar(36) with no format
    // constraint) never enforce UUID shape. Confirmed live data contains
    // legitimate, non-empty internal string identifiers that are not
    // UUID-formatted, so this only bounds length/emptiness - it never
    // requires, invents, or reformats a UUID.
    sourceEventIds: z.array(z.string().trim().min(1).max(128)).min(1).max(20),
    clientConfirmed: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const identitySchema = z.object({
  profession: memoryValueSchema.optional(),
  role: memoryValueSchema.optional(),
  business: memoryValueSchema.optional(),
  relevantContext: memoryValueSchema.optional(),
  values: memoryValueSchema.optional(),
  personality: memoryValueSchema.optional(),
  recurringThemes: memoryValueSchema.optional(),
}).strict();

const brandSchema = z.object({
  audience: memoryValueSchema.optional(),
  offer: memoryValueSchema.optional(),
  businessGoals: memoryValueSchema.optional(),
  intendedUses: memoryValueSchema.optional(),
  desiredPerception: memoryValueSchema.optional(),
  selfLanguage: memoryValueSchema.optional(),
}).strict();

const expressionSchema = z.object({
  desiredFeeling: memoryValueSchema.optional(),
  wantsToBeSeenAs: memoryValueSchema.optional(),
  discomforts: memoryValueSchema.optional(),
  performativeSignals: memoryValueSchema.optional(),
  tensions: memoryValueSchema.optional(),
}).strict();

const visualWorldSchema = z.object({
  colours: memoryValueSchema.optional(),
  light: memoryValueSchema.optional(),
  environments: memoryValueSchema.optional(),
  materials: memoryValueSchema.optional(),
  movement: memoryValueSchema.optional(),
  styling: memoryValueSchema.optional(),
  wardrobe: memoryValueSchema.optional(),
  composition: memoryValueSchema.optional(),
  references: memoryValueSchema.optional(),
  dislikes: memoryValueSchema.optional(),
  avoid: memoryValueSchema.optional(),
}).strict();

const shootContextSchema = z.object({
  location: memoryValueSchema.optional(),
  channels: memoryValueSchema.optional(),
  deliverables: memoryValueSchema.optional(),
  constraints: memoryValueSchema.optional(),
  availableSpaces: memoryValueSchema.optional(),
  wardrobeOptions: memoryValueSchema.optional(),
  timingContext: memoryValueSchema.optional(),
  // The client's own confirm/request-change response to the scheduled date,
  // time, and location shown in "Your Shoot". Deliberately a separate field
  // from timingContext (which holds genuine Discovery-collected timing
  // preferences) so a scheduling click never overwrites conversation content.
  // Stored here (an existing flexible JSON column) instead of a new table/
  // column - no migration required. Not part of DISCOVERY_SIGNALS, so it
  // never affects the Discovery-completion gate.
  scheduleConfirmation: memoryValueSchema.optional(),
}).strict();

const completenessValueSchema = z.enum(["missing", "partial", "enough"]);

export const shootMemorySchema = z.object({
  schemaVersion: z.literal(MIRA_SHOOT_MEMORY_SCHEMA_VERSION),
  identity: identitySchema,
  brand: brandSchema,
  expression: expressionSchema,
  visualWorld: visualWorldSchema,
  shootContext: shootContextSchema,
  openQuestions: z.array(z.string().trim().min(1).max(300)).max(20),
  completeness: z.object({
    identity: completenessValueSchema,
    brand: completenessValueSchema,
    expression: completenessValueSchema,
    visualWorld: completenessValueSchema,
    shootContext: completenessValueSchema,
  }).strict(),
}).strict();

export type ShootMemory = z.infer<typeof shootMemorySchema>;
export type ShootMemoryValue = z.infer<typeof memoryValueSchema>;

export const SHOOT_MEMORY_PATHS = [
  "identity.profession", "identity.role", "identity.business", "identity.relevantContext",
  "identity.values", "identity.personality", "identity.recurringThemes",
  "brand.audience", "brand.offer", "brand.businessGoals", "brand.intendedUses",
  "brand.desiredPerception", "brand.selfLanguage",
  "expression.desiredFeeling", "expression.wantsToBeSeenAs", "expression.discomforts",
  "expression.performativeSignals", "expression.tensions",
  "visualWorld.colours", "visualWorld.light", "visualWorld.environments",
  "visualWorld.materials", "visualWorld.movement", "visualWorld.styling",
  "visualWorld.wardrobe", "visualWorld.composition", "visualWorld.references",
  "visualWorld.dislikes", "visualWorld.avoid",
  "shootContext.location", "shootContext.channels", "shootContext.deliverables",
  "shootContext.constraints", "shootContext.availableSpaces", "shootContext.wardrobeOptions",
  "shootContext.timingContext", "shootContext.scheduleConfirmation",
] as const;

export const shootMemoryPatchSchema = z.object({
  changes: z.array(z.discriminatedUnion("operation", [
    z.object({ operation: z.literal("set"), path: z.enum(SHOOT_MEMORY_PATHS), value: memoryValueSchema }).strict(),
    z.object({ operation: z.literal("unset"), path: z.enum(SHOOT_MEMORY_PATHS), reason: z.string().trim().min(1).max(300) }).strict(),
  ])).min(1).max(24),
  openQuestions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
}).strict();

export type ShootMemoryPatch = z.infer<typeof shootMemoryPatchSchema>;

export const realtimeMemoryToolInputSchema = z.object({
  statement: z.string().trim().min(2).max(4000),
  significance: z.enum(["routine", "significant_unexplored", "significant_explored"]).default("routine"),
  changes: z.array(z.discriminatedUnion("operation", [
    z.object({
      operation: z.literal("set"),
      path: z.enum(SHOOT_MEMORY_PATHS),
      value: z.union([z.string().trim().min(1).max(1200), z.array(z.string().trim().min(1).max(300)).max(20)]),
      kind: z.enum(["explicit", "interpreted"]),
      confidence: z.enum(["high", "medium", "low"]),
      clientConfirmed: z.boolean(),
    }).strict(),
    z.object({
      operation: z.literal("unset"),
      path: z.enum(SHOOT_MEMORY_PATHS),
      reason: z.string().trim().min(1).max(300),
    }).strict(),
  ])).min(1).max(12),
  openQuestions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
}).strict();

export type RealtimeMemoryToolInput = z.infer<typeof realtimeMemoryToolInputSchema>;

export const photographerProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  businessName: z.string().trim().max(200).nullable(),
  bio: z.string().trim().max(2000).nullable().default(null),
  photographyStyle: z.string().trim().max(1200).nullable().default(null),
  areasOfExpertise: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  websiteUrl: z.union([z.string().trim().max(1024), z.null()]).transform(value => normalizeWebsiteUrl(value)).default(null),
  instagramUrl: z.union([z.string().trim().max(1024), z.null()]).transform(value => normalizeInstagramUsername(value)).default(null),
  timezone: z.string().trim().min(1).max(128),
}).strict();

export function normalizeWebsiteUrl(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname.includes(" ")) {
    throw new Error("Enter a valid website address, such as www.example.com.");
  }
  parsed.protocol = "https:";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function normalizeInstagramUsername(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const withoutHost = withoutProtocol.replace(/^(?:www\.)?instagram\.com\//i, "");
  const username = withoutHost.replace(/^@/, "").split(/[/?#]/, 1)[0];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    throw new Error("Enter an Instagram username, such as @example.");
  }
  return username;
}

export const createShootInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  shootType: z.string().trim().max(160).nullable().default(null),
  clientName: z.string().trim().max(160).nullable(),
  clientEmail: z.string().trim().email().max(320).nullable(),
  clientPhone: z.string().trim().max(32).nullable(),
  invitationMessage: z.string().trim().max(800).nullable(),
  scheduledAt: z.string().datetime().nullable(),
  timezone: z.string().trim().min(1).max(128),
  intendedUse: z.string().trim().max(2000).nullable(),
  location: z.string().trim().max(1000).nullable(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().default(null),
  photographerNotes: z.string().trim().max(4000).nullable().default(null),
  callAllowanceMinutes: z.number().int().min(5).max(60).default(20),
}).strict();

export const createDiscoverySummaryInputSchema = z.object({
  summaryText: z.string().trim().min(80).max(5000),
}).strict();

export const confirmDiscoverySummaryInputSchema = z.object({
  summaryId: z.string().uuid(),
  confirmed: z.literal(true),
}).strict();

export const respondToShootScheduleInputSchema = z.object({
  response: z.enum(["confirmed", "change_requested"]),
  note: z.string().trim().min(1).max(280).nullable().default(null),
}).strict();
export type RespondToShootScheduleInput = z.infer<typeof respondToShootScheduleInputSchema>;

// Requires clear, unambiguous completion language. Ordinary politeness
// ("thanks", "sounds good", "great") must never satisfy this on its own.
const STRONG_COMPLETION_PATTERN =
  /\b(we'?re\s+done|i'?m\s+done|that'?s\s+(everything|all(\s+i\s+need)?)|this\s+is\s+(all\s+)?exactly\s+what\s+i\s+need|i'?m\s+finished|nothing\s+else(\s+for\s+now)?|all\s+set|i\s+think\s+(that\s+)?we'?re\s+done)\b/i;

export function isStrongCompletionStatement(statement: string): boolean {
  return STRONG_COMPLETION_PATTERN.test(statement.trim());
}

// The single decision point for whether Preparation is allowed to activate.
// Both the Creative DNA synthesis and the moodboard/campaign compilation must
// have actually succeeded - a failure in either must leave the room in its
// confirmed-but-processing state, never advance it.
export function shouldActivateShootPreparation(
  creativeDnaStatus: "complete" | "retryable_error",
  moodboardStatus: "complete" | "retryable_error",
): boolean {
  return creativeDnaStatus === "complete" && moodboardStatus === "complete";
}
