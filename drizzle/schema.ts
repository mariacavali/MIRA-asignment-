import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import type { MiraV4CreativeDna } from "../shared/miraV4CreativeDna";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const miraV3Journeys = mysqlTable(
  "mira_v3_journeys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", [
      "meditation",
      "reflection",
      "mirror_draft",
      "mirror_confirmed",
      "complete",
      "deleted",
    ])
      .default("meditation")
      .notNull(),
    currentStep: varchar("currentStep", { length: 64 }).default("meditation").notNull(),
    turnCount: int("turnCount").default(0).notNull(),
    activeSessionId: varchar("activeSessionId", { length: 36 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("mira_v3_journeys_user_status_idx").on(table.userId, table.status)],
);

export const miraV3Sessions = mysqlTable(
  "mira_v3_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["active", "expired", "closed"]).default("active").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mira_v3_sessions_journey_idx").on(table.journeyId),
    index("mira_v3_sessions_user_status_idx").on(table.userId, table.status),
  ],
);

export const miraV3Messages = mysqlTable(
  "mira_v3_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("sessionId", { length: 36 }).references(() => miraV3Sessions.id, {
      onDelete: "set null",
    }),
    ordinal: int("ordinal").notNull(),
    role: mysqlEnum("role", ["system", "assistant", "user"]).notNull(),
    content: text("content").notNull(),
    provenance: json("provenance"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mira_v3_messages_journey_ordinal_uq").on(table.journeyId, table.ordinal),
    index("mira_v3_messages_user_idx").on(table.userId),
  ],
);

export const miraV3MediaAssets = mysqlTable(
  "mira_v3_media_assets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("sessionId", { length: 36 }).references(() => miraV3Sessions.id, {
      onDelete: "set null",
    }),
    kind: mysqlEnum("kind", ["reference_image"]).default("reference_image").notNull(),
    status: mysqlEnum("status", ["uploaded", "analyzed", "removed", "failed"])
      .default("uploaded")
      .notNull(),
    storageKey: varchar("storageKey", { length: 768 }).notNull(),
    storageUrl: text("storageUrl").notNull(),
    originalName: varchar("originalName", { length: 255 }),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    byteSize: int("byteSize").notNull(),
    analysis: json("analysis"),
    removedAt: timestamp("removedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("mira_v3_media_assets_journey_status_idx").on(table.journeyId, table.status)],
);

export const miraV3Consents = mysqlTable(
  "mira_v3_consents",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: mysqlEnum("scope", ["image_upload", "image_analysis"]).notNull(),
    status: mysqlEnum("status", ["granted", "revoked"]).notNull(),
    policyVersion: varchar("policyVersion", { length: 32 }).notNull(),
    grantedAt: timestamp("grantedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("mira_v3_consents_journey_scope_idx").on(table.journeyId, table.scope)],
);

export const miraV3ReflectionRevisions = mysqlTable(
  "mira_v3_reflection_revisions",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    status: mysqlEnum("status", ["draft", "confirmed", "superseded"]).default("draft").notNull(),
    source: mysqlEnum("source", ["ai", "user_edit"]).default("ai").notNull(),
    bundle: json("bundle").notNull(),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mira_v3_reflection_revisions_journey_version_uq").on(
      table.journeyId,
      table.version,
    ),
    index("mira_v3_reflection_revisions_journey_status_idx").on(table.journeyId, table.status),
  ],
);

export const miraV3ModuleOutputs = mysqlTable(
  "mira_v3_module_outputs",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerVersion: varchar("providerVersion", { length: 64 }),
    status: mysqlEnum("status", ["pending", "complete", "unavailable", "failed"])
      .default("pending")
      .notNull(),
    rawResult: json("rawResult"),
    normalizedResult: json("normalizedResult"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("mira_v3_module_outputs_journey_module_idx").on(table.journeyId, table.module)],
);

export const miraV3RenderArtifacts = mysqlTable(
  "mira_v3_render_artifacts",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV3Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reflectionRevisionId: int("reflectionRevisionId")
      .notNull()
      .references(() => miraV3ReflectionRevisions.id, { onDelete: "cascade" }),
    deliverable: mysqlEnum("deliverable", ["mirror", "brand_soul", "visual_direction"]).notNull(),
    format: mysqlEnum("format", ["html", "pdf"]).notNull(),
    status: mysqlEnum("status", ["pending", "ready", "failed"]).default("pending").notNull(),
    storageKey: varchar("storageKey", { length: 768 }),
    storageUrl: text("storageUrl"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mira_v3_render_artifacts_journey_idx").on(table.journeyId),
    uniqueIndex("mira_v3_render_artifacts_revision_kind_format_uq").on(
      table.reflectionRevisionId,
      table.deliverable,
      table.format,
    ),
  ],
);

export type MiraV3Journey = typeof miraV3Journeys.$inferSelect;
export type InsertMiraV3Journey = typeof miraV3Journeys.$inferInsert;
export type MiraV3Session = typeof miraV3Sessions.$inferSelect;
export type MiraV3Message = typeof miraV3Messages.$inferSelect;
export type MiraV3ReflectionRevision = typeof miraV3ReflectionRevisions.$inferSelect;
export type MiraV3RenderArtifact = typeof miraV3RenderArtifacts.$inferSelect;

export const miraV4Journeys = mysqlTable(
  "mira_v4_journeys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", [
      "intake",
      "recognition",
      "creative_discovery",
      "brand_dna_draft",
      "brand_dna_confirmed",
      "complete",
      "deleted",
    ])
      .default("intake")
      .notNull(),
    currentStep: mysqlEnum("currentStep", [
      "quick_context",
      "birth_details",
      "recognition_ready",
      "recognition",
      "creative_brief",
      "creative_discovery",
      "inspiration",
      "pre_generation_mirror",
      "visual_discovery",
      "visual_refinement",
      "moodboard",
      "brand_dna",
      "brand_book",
    ])
      .default("quick_context")
      .notNull(),
    building: text("building"),
    currentPosition: text("currentPosition"),
    needMost: text("needMost"),
    firstCreation: text("firstCreation"),
    birthDate: varchar("birthDate", { length: 10 }),
    birthTime: varchar("birthTime", { length: 5 }),
    birthTimeUnknown: int("birthTimeUnknown").default(0).notNull(),
    birthCity: varchar("birthCity", { length: 255 }),
    birthCountry: varchar("birthCountry", { length: 128 }),
    birthTimezone: varchar("birthTimezone", { length: 128 }),
    turnCount: int("turnCount").default(0).notNull(),
    creativeTurnCount: int("creativeTurnCount").default(0).notNull(),
    creativeInputs: json("creativeInputs").$type<{
      warmth: number;
      structure: number;
      expression: number;
      texture: string;
      colorAttraction: string;
      typography: string;
      imageryWorld: string;
    }>(),
    inspirationExplanation: text("inspirationExplanation"),
    inspirationAssetId: varchar("inspirationAssetId", { length: 36 }),
    inspirationStorageKey: varchar("inspirationStorageKey", { length: 768 }),
    inspirationOriginalName: varchar("inspirationOriginalName", { length: 255 }),
    inspirationMimeType: varchar("inspirationMimeType", { length: 64 }),
    inspirationByteSize: int("inspirationByteSize"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("mira_v4_journeys_user_status_idx").on(table.userId, table.status)],
);

export type MiraV4Journey = typeof miraV4Journeys.$inferSelect;
export type InsertMiraV4Journey = typeof miraV4Journeys.$inferInsert;

export const miraV4Messages = mysqlTable(
  "mira_v4_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV4Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ordinal: int("ordinal").notNull(),
    phase: mysqlEnum("phase", ["recognition", "creative_discovery"])
      .default("recognition")
      .notNull(),
    role: mysqlEnum("role", ["assistant", "user"]).notNull(),
    content: text("content").notNull(),
    provenance: json("provenance").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mira_v4_messages_journey_ordinal_uidx").on(table.journeyId, table.ordinal),
    index("mira_v4_messages_user_journey_idx").on(table.userId, table.journeyId),
  ],
);

export type MiraV4Message = typeof miraV4Messages.$inferSelect;

export const miraV4CreativeDna = mysqlTable(
  "mira_v4_creative_dna",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV4Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schemaVersion: varchar("schemaVersion", { length: 16 }).notNull(),
    promptVersion: varchar("promptVersion", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["in_progress", "complete", "retryable_error"])
      .default("in_progress")
      .notNull(),
    creativeDnaJson: json("creativeDnaJson").$type<MiraV4CreativeDna>(),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }),
    errorCode: varchar("errorCode", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_v4_creative_dna_journey_uidx").on(table.journeyId),
    index("mira_v4_creative_dna_user_journey_idx").on(table.userId, table.journeyId),
  ],
);

export type MiraV4CreativeDnaRecord = typeof miraV4CreativeDna.$inferSelect;
export type InsertMiraV4CreativeDnaRecord = typeof miraV4CreativeDna.$inferInsert;

export const miraV4VisualSets = mysqlTable(
  "mira_v4_visual_sets",
  {
    id: int("id").autoincrement().primaryKey(),
    journeyId: int("journeyId")
      .notNull()
      .references(() => miraV4Journeys.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stage: mysqlEnum("stage", ["initial", "refined", "moodboard"]).notNull(),
    status: mysqlEnum("status", ["in_progress", "complete", "retryable_error"])
      .default("in_progress")
      .notNull(),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }).notNull(),
    promptVersion: varchar("promptVersion", { length: 64 }).notNull(),
    campaignPlanJson: json("campaignPlanJson").$type<Record<string, unknown>>(),
    referencesJson: json("referencesJson").$type<Array<{
      id: string;
      url?: string;
      direction: string;
      prompt: string;
      status?: "pending" | "generating" | "complete" | "failed";
      errorCode?: string | null;
    }>>(),
    selectionJson: json("selectionJson").$type<{
      referenceIds: string[];
      reasons: string[];
      note?: string | null;
    }>(),
    refinementJson: json("refinementJson").$type<{
      preserve: string;
      avoid: string;
      note: string | null;
    }>(),
    finalMoodboardUrl: varchar("finalMoodboardUrl", { length: 1024 }),
    errorCode: varchar("errorCode", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_v4_visual_sets_journey_stage_uidx").on(table.journeyId, table.stage),
    index("mira_v4_visual_sets_user_journey_idx").on(table.userId, table.journeyId),
  ],
);

export type MiraV4VisualSet = typeof miraV4VisualSets.$inferSelect;
export type InsertMiraV4VisualSet = typeof miraV4VisualSets.$inferInsert;
