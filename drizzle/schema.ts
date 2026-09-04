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
import type { ShootMemory } from "../shared/miraCore";

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

export const miraPendingCheckouts = mysqlTable(
  "mira_pending_checkouts",
  {
    id: int("id").autoincrement().primaryKey(),
    clientReferenceId: varchar("clientReferenceId", { length: 200 }).notNull(),
    photographerUserId: int("photographerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    expectedPriceId: varchar("expectedPriceId", { length: 191 }).notNull(),
    expectedCurrency: varchar("expectedCurrency", { length: 3 }).notNull(),
    status: mysqlEnum("status", ["pending", "consumed", "expired"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
  },
  table => [
    uniqueIndex("mira_pending_checkouts_reference_uidx").on(table.clientReferenceId),
    index("mira_pending_checkouts_status_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const miraStripeBillingIdentities = mysqlTable(
  "mira_stripe_billing_identities",
  {
    id: int("id").autoincrement().primaryKey(),
    photographerUserId: int("photographerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: varchar("stripeCustomerId", { length: 191 }).notNull(),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 191 }),
    stripePriceId: varchar("stripePriceId", { length: 191 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    paymentState: mysqlEnum("paymentState", ["pending", "active", "past_due", "cancelled", "expired"]).default("pending").notNull(),
    cancelAtPeriodEnd: int("cancelAtPeriodEnd").default(0).notNull(),
    cancelAt: timestamp("cancelAt"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    cancellationAt: timestamp("cancellationAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_stripe_billing_user_uidx").on(table.photographerUserId),
    uniqueIndex("mira_stripe_billing_customer_uidx").on(table.stripeCustomerId),
    uniqueIndex("mira_stripe_billing_subscription_uidx").on(table.stripeSubscriptionId),
    index("mira_stripe_billing_state_idx").on(table.paymentState),
  ],
);

export const miraProcessedStripeEvents = mysqlTable(
  "mira_processed_stripe_events",
  {
    id: int("id").autoincrement().primaryKey(),
    stripeEventId: varchar("stripeEventId", { length: 191 }).notNull(),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    processingResult: varchar("processingResult", { length: 64 }).notNull(),
    processedAt: timestamp("processedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mira_processed_stripe_events_event_uidx").on(table.stripeEventId),
  ],
);

export const miraEmailOutbox = mysqlTable(
  "mira_email_outbox",
  {
    id: int("id").autoincrement().primaryKey(),
    shootId: int("shootId").notNull().references(() => miraShoots.id, { onDelete: "cascade" }),
    invitationId: varchar("invitationId", { length: 36 }).notNull().references(() => miraClientInvitations.id, { onDelete: "cascade" }),
    milestoneId: varchar("milestoneId", { length: 64 }).notNull(),
    scheduledAt: timestamp("scheduledAt").notNull(),
    status: mysqlEnum("status", ["pending", "processing", "sent", "delivered", "failed", "suppressed", "cancelled"]).default("pending").notNull(),
    attemptCount: int("attemptCount").default(0).notNull(),
    lastErrorCategory: varchar("lastErrorCategory", { length: 64 }),
    idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull(),
    providerMessageId: varchar("providerMessageId", { length: 191 }),
    leaseUntil: timestamp("leaseUntil"),
    claimedAt: timestamp("claimedAt"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_email_outbox_invitation_milestone_uidx").on(table.invitationId, table.milestoneId),
    uniqueIndex("mira_email_outbox_idempotency_uidx").on(table.idempotencyKey),
    index("mira_email_outbox_due_idx").on(table.status, table.scheduledAt),
    index("mira_email_outbox_lease_idx").on(table.status, table.leaseUntil),
  ],
);

export const miraPhotographerProfiles = mysqlTable(
  "mira_photographer_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("displayName", { length: 160 }).notNull(),
    businessName: varchar("businessName", { length: 200 }),
    bio: text("bio"),
    photographyStyle: text("photographyStyle"),
    areasOfExpertise: json("areasOfExpertise").$type<string[]>(),
    websiteUrl: varchar("websiteUrl", { length: 1024 }),
    instagramUrl: varchar("instagramUrl", { length: 1024 }),
    timezone: varchar("timezone", { length: 128 }).notNull(),
    onboardingStatus: mysqlEnum("onboardingStatus", ["started", "complete"])
      .default("started")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("mira_photographer_profiles_user_uidx").on(table.userId)],
);

export const miraShoots = mysqlTable(
  "mira_shoots",
  {
    id: int("id").autoincrement().primaryKey(),
    photographerUserId: int("photographerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceMode: mysqlEnum("sourceMode", ["maria_photography", "mira_saas"]).notNull(),
    externalSourceId: varchar("externalSourceId", { length: 191 }),
    status: mysqlEnum("status", [
      "draft",
      "client_invited",
      "conversation_in_progress",
      "preparation_ready",
      "photographer_review",
      "revisions_requested",
      "approved",
      "ready_to_shoot",
      "archived",
    ])
      .default("draft")
      .notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    shootType: varchar("shootType", { length: 160 }),
    clientName: varchar("clientName", { length: 160 }),
    clientEmail: varchar("clientEmail", { length: 320 }),
    clientPhone: varchar("clientPhone", { length: 32 }),
    invitationMessage: text("invitationMessage"),
    scheduledAt: timestamp("scheduledAt"),
    timezone: varchar("timezone", { length: 128 }).notNull(),
    intendedUse: text("intendedUse"),
    location: text("location"),
    durationMinutes: int("durationMinutes"),
    photographerNotes: text("photographerNotes"),
    roomState: mysqlEnum("roomState", [
      "welcome",
      "discovery_offered",
      "discovery_in_progress",
      "summary_pending",
      "discovery_confirmed",
      "preparation_active",
    ]).default("welcome").notNull(),
    callAllowanceSeconds: int("callAllowanceSeconds").default(1200).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mira_shoots_photographer_status_idx").on(table.photographerUserId, table.status),
    uniqueIndex("mira_shoots_source_external_uidx").on(table.sourceMode, table.externalSourceId),
  ],
);

export const miraClientInvitations = mysqlTable(
  "mira_client_invitations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    shootId: int("shootId")
      .notNull()
      .references(() => miraShoots.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["active", "completed", "expired", "revoked"])
      .default("active")
      .notNull(),
    deliveryStatus: mysqlEnum("deliveryStatus", ["created", "queued", "sent", "delivered", "failed", "opened", "preparation_in_progress", "completed"])
      .default("created")
      .notNull(),
    deliveryProvider: varchar("deliveryProvider", { length: 32 }),
    providerMessageId: varchar("providerMessageId", { length: 191 }),
    expiresAt: timestamp("expiresAt").notNull(),
    maxSessions: int("maxSessions").default(1).notNull(),
    consentPolicyVersion: varchar("consentPolicyVersion", { length: 32 }).notNull(),
    consentAcknowledgedAt: timestamp("consentAcknowledgedAt"),
    lastOpenedAt: timestamp("lastOpenedAt"),
    sentAt: timestamp("sentAt"),
    preparationStartedAt: timestamp("preparationStartedAt"),
    completedAt: timestamp("completedAt"),
    photographerNotifiedAt: timestamp("photographerNotifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_client_invitations_token_uidx").on(table.tokenHash),
    index("mira_client_invitations_shoot_status_idx").on(table.shootId, table.status),
  ],
);

export const miraCallSessions = mysqlTable(
  "mira_call_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    invitationId: varchar("invitationId", { length: 36 })
      .notNull()
      .references(() => miraClientInvitations.id, { onDelete: "cascade" }),
    shootId: int("shootId")
      .notNull()
      .references(() => miraShoots.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: mysqlEnum("mode", ["text_test", "realtime"]).default("text_test").notNull(),
    status: mysqlEnum("status", ["active", "paused", "ended", "failed"])
      .default("active")
      .notNull(),
    activeSlot: int("activeSlot"),
    turnCount: int("turnCount").default(0).notNull(),
    allowedSeconds: int("allowedSeconds").notNull(),
    consumedSeconds: int("consumedSeconds").default(0).notNull(),
    providerCallId: varchar("providerCallId", { length: 191 }),
    lastConnectedAt: timestamp("lastConnectedAt"),
    reconnectUntil: timestamp("reconnectUntil"),
    summaryConfirmedAt: timestamp("summaryConfirmedAt"),
    promptVersion: varchar("promptVersion", { length: 64 }).notNull(),
    memoryVersionStart: int("memoryVersionStart").default(0).notNull(),
    memoryVersionEnd: int("memoryVersionEnd"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    endedAt: timestamp("endedAt"),
    endReason: varchar("endReason", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_call_sessions_shoot_active_uidx").on(table.shootId, table.activeSlot),
    index("mira_call_sessions_invitation_status_idx").on(table.invitationId, table.status),
    index("mira_call_sessions_shoot_idx").on(table.shootId),
  ],
);

export const miraCallEvents = mysqlTable(
  "mira_call_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 36 })
      .notNull()
      .references(() => miraCallSessions.id, { onDelete: "cascade" }),
    shootId: int("shootId")
      .notNull()
      .references(() => miraShoots.id, { onDelete: "cascade" }),
    ordinal: int("ordinal").notNull(),
    role: mysqlEnum("role", ["assistant", "client"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("mira_call_events_session_ordinal_uidx").on(table.sessionId, table.ordinal)],
);

export const miraCallQaEvents = mysqlTable(
  "mira_call_qa_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 36 }).notNull().references(() => miraCallSessions.id, { onDelete: "cascade" }),
    shootId: int("shootId").notNull().references(() => miraShoots.id, { onDelete: "cascade" }),
    direction: mysqlEnum("direction", ["client", "assistant"]).notNull(),
    modality: mysqlEnum("modality", ["voice_transcript", "text_fallback"]).notNull(),
    content: text("content").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("mira_call_qa_events_owner_lookup_idx").on(table.shootId, table.createdAt), index("mira_call_qa_events_expiry_idx").on(table.expiresAt)],
);

export const miraDiscoverySummaries = mysqlTable(
  "mira_discovery_summaries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    shootId: int("shootId").notNull().references(() => miraShoots.id, { onDelete: "cascade" }),
    sessionId: varchar("sessionId", { length: 36 }).notNull().references(() => miraCallSessions.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    memoryVersion: int("memoryVersion").notNull(),
    summaryText: text("summaryText").notNull(),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("mira_discovery_summaries_shoot_idx").on(table.shootId, table.createdAt),
    uniqueIndex("mira_discovery_summaries_session_memory_uidx").on(table.sessionId, table.memoryVersion),
  ],
);

export const miraShootMemoryRevisions = mysqlTable(
  "mira_shoot_memory_revisions",
  {
    id: int("id").autoincrement().primaryKey(),
    shootId: int("shootId")
      .notNull()
      .references(() => miraShoots.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    schemaVersion: varchar("schemaVersion", { length: 16 }).notNull(),
    source: mysqlEnum("source", ["call", "photographer", "system"]).notNull(),
    snapshotJson: json("snapshotJson").$type<ShootMemory>().notNull(),
    patchJson: json("patchJson").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mira_shoot_memory_revisions_shoot_version_uidx").on(table.shootId, table.version),
    index("mira_shoot_memory_revisions_owner_idx").on(table.photographerUserId, table.shootId),
  ],
);

export const miraShootCreativeDna = mysqlTable(
  "mira_shoot_creative_dna",
  {
    id: int("id").autoincrement().primaryKey(),
    shootId: int("shootId").notNull().references(() => miraShoots.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    confirmedMemoryVersion: int("confirmedMemoryVersion").notNull(),
    schemaVersion: varchar("schemaVersion", { length: 16 }).notNull(),
    promptVersion: varchar("promptVersion", { length: 64 }).notNull(),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "complete", "retryable_error"]).default("pending").notNull(),
    model: varchar("model", { length: 128 }),
    creativeDnaJson: json("creativeDnaJson").$type<MiraV4CreativeDna>(),
    errorCode: varchar("errorCode", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_shoot_creative_dna_memory_uidx").on(table.shootId, table.confirmedMemoryVersion),
    index("mira_shoot_creative_dna_owner_idx").on(table.photographerUserId, table.shootId),
  ],
);

export const miraShootMoodboard = mysqlTable(
  "mira_shoot_moodboard",
  {
    id: int("id").autoincrement().primaryKey(),
    shootId: int("shootId").notNull().references(() => miraShoots.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    confirmedMemoryVersion: int("confirmedMemoryVersion").notNull(),
    promptVersion: varchar("promptVersion", { length: 64 }).notNull(),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "complete", "retryable_error"]).default("pending").notNull(),
    renderStatus: mysqlEnum("renderStatus", ["not_configured", "pending", "complete", "failed"]).default("pending").notNull(),
    campaignPlanJson: json("campaignPlanJson"),
    referencesJson: json("referencesJson"),
    errorCode: varchar("errorCode", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mira_shoot_moodboard_memory_uidx").on(table.shootId, table.confirmedMemoryVersion),
    index("mira_shoot_moodboard_owner_idx").on(table.photographerUserId, table.shootId),
  ],
);

export const miraShootVisualReferences = mysqlTable(
  "mira_shoot_visual_references",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    shootId: int("shootId").notNull().references(() => miraShoots.id, { onDelete: "cascade" }),
    photographerUserId: int("photographerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    uploaderRole: mysqlEnum("uploaderRole", ["photographer", "client"]).notNull(),
    sourceKind: mysqlEnum("sourceKind", ["uploaded_image", "synthetic_fixture"]).default("uploaded_image").notNull(),
    evidenceKind: mysqlEnum("evidenceKind", ["observed", "explicit_preference", "mira_hypothesis", "confirmed_direction"]).default("observed").notNull(),
    // Client-facing categorical reason the reference was shared. Distinct from
    // evidenceKind (the provenance/confidence model MIRA reasons with) -
    // referencePurpose is display/intent metadata that maps onto it.
    referencePurpose: mysqlEnum("referencePurpose", ["like", "dislike", "current_identity", "direction_to_explore", "portrait", "location", "other"]),
    status: mysqlEnum("status", ["uploaded", "analyzed", "failed", "removed"]).default("uploaded").notNull(),
    storageKey: varchar("storageKey", { length: 768 }).notNull(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    byteSize: int("byteSize").notNull(),
    clientDescription: text("clientDescription"),
    analysisJson: json("analysisJson"),
    analysisModel: varchar("analysisModel", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mira_shoot_visual_refs_owner_idx").on(table.photographerUserId, table.shootId),
    index("mira_shoot_visual_refs_shoot_status_idx").on(table.shootId, table.status),
  ],
);

export type MiraPhotographerProfile = typeof miraPhotographerProfiles.$inferSelect;
export type MiraShoot = typeof miraShoots.$inferSelect;
export type MiraClientInvitation = typeof miraClientInvitations.$inferSelect;
export type MiraCallSession = typeof miraCallSessions.$inferSelect;

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
