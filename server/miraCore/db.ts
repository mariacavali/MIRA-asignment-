import { and, asc, count, desc, eq, inArray, lt } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  miraCallEvents,
  miraCallQaEvents,
  miraCallSessions,
  miraClientInvitations,
  miraDiscoverySummaries,
  miraPhotographerProfiles,
  miraShootCreativeDna,
  miraShootMemoryRevisions,
  miraShootMoodboard,
  miraShoots,
  users,
} from "../../drizzle/schema";
import {
  MIRA_CLIENT_CONSENT_POLICY_VERSION,
  MIRA_MASTER_PROMPT_VERSION,
  MIRA_SHOOT_MEMORY_SCHEMA_VERSION,
  isStrongCompletionStatement,
  realtimeMemoryToolInputSchema,
  shootMemoryPatchSchema,
  type ShootMemory,
} from "../../shared/miraCore";
import { getDb } from "../db";
import {
  createLocalShoot,
  deleteLocalTextTestMessages,
  getLocalProfile,
  getLocalShoot,
  getLocalInvitation,
  createLocalInvitation,
  updateLocalInvitation,
  updateLocalShoot,
  getLocalInvitationForShoot,
  listLocalInvitations,
  acceptLocalInvitation,
  endLocalTextTestSession,
  isLocalFileStoreEnabled,
  listLocalTextTestSessions,
  listLocalShoots,
  saveLocalProfile,
  startLocalTextTestSession,
  submitLocalTextTestTurn,
  type LocalShoot,
} from "../localFileStore";
import { applyShootMemoryPatch, emptyShootMemory, memoryPatchForTextTestAnswer } from "./memory";
import { evaluateDiscoveryGate } from "./memory";
import { ENV } from "../_core/env";
import { buildShootPreparationBrief, type ShootPreparationBrief } from "./preparationBrief";
import { parseInvitationAccessToken, verifyInvitationAccessSignature } from "./invitationAccessLink";

const TEXT_TEST_QUESTIONS = [
  "To begin, what do you do—and what is this shoot meant to help you communicate?",
  "Who needs to recognise themselves in these images, and where will the images be used?",
  "How do you want to feel in the photographs, and how do you want others to see you?",
  "What kind of light, colour, place, material, or atmosphere feels most like you?",
  "What should this shoot never look or feel like?",
  "What practical details should your photographer know about the location, wardrobe, timing, or deliverables?",
] as const;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function localShootToDomain(shoot: LocalShoot) {
  return {
    ...shoot,
    scheduledAt: shoot.scheduledAt ? new Date(shoot.scheduledAt) : null,
    createdAt: new Date(shoot.createdAt),
    updatedAt: new Date(shoot.updatedAt),
  } as any;
}

function localProfileToDomain(profile: Awaited<ReturnType<typeof getLocalProfile>>) {
  if (!profile) return null;
  return { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt) } as any;
}

export function hashClientInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Resolves any client-presented credential (the original raw invitation
// token, or a signed access token minted later for outbox emails) down to a
// single SQL condition identifying the invitation row. Raw tokens are hashed
// and matched by tokenHash exactly as before (no extra query). A signed
// access token requires one lookup of the invitation's *current* tokenHash so
// the signature can be recomputed and compared in constant time - this is
// what makes token rotation silently invalidate every previously issued
// signed link. Returns null when the credential cannot possibly resolve to a
// valid invitation, which every caller treats identically to "not found".
async function resolveInvitationCondition(credential: string) {
  const parsed = parseInvitationAccessToken(credential);
  if (!parsed) return eq(miraClientInvitations.tokenHash, hashClientInvitationToken(credential));
  const db = await requireDb();
  const rows = await db.select({ tokenHash: miraClientInvitations.tokenHash })
    .from(miraClientInvitations)
    .where(eq(miraClientInvitations.id, parsed.invitationId))
    .limit(1);
  const current = rows[0];
  if (!current || !verifyInvitationAccessSignature(parsed, current.tokenHash, ENV.invitationLinkSecret)) return null;
  return eq(miraClientInvitations.id, parsed.invitationId);
}

type InvitationRoomRow = {
  invitation: typeof miraClientInvitations.$inferSelect;
  shoot: typeof miraShoots.$inferSelect;
  photographer: typeof miraPhotographerProfiles.$inferSelect | null;
};

// The single place that turns a freshly-loaded invitation/shoot row into the
// client-facing status: current access deadline (shoot end + 24h, recomputed
// from whatever the shoot is scheduled for *right now*, so a reschedule is
// picked up automatically), and whether the shoot or the window closed it.
// Shared by every entry point that loads a room by credential or by id.
function finalizeInvitationRoomRow(row: InvitationRoomRow): InvitationRoomRow {
  const accessDeadline = calculateShootAccessDeadline(row.shoot.scheduledAt, row.shoot.durationMinutes, row.invitation.expiresAt);
  const closedByShoot = row.shoot.status === "archived";
  const expired = accessDeadline.getTime() <= Date.now();
  row.invitation.expiresAt = accessDeadline;
  if (closedByShoot && row.invitation.status === "active") row.invitation.status = "revoked";
  if (expired && row.invitation.status === "active") row.invitation.status = "expired";
  return row;
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const localAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return localAsUtc - date.getTime();
}

// Invitations remain usable through the end of the day after the scheduled
// shoot in the shoot timezone. Unscheduled shoots retain the explicit short
// invitation window supplied by the photographer.
export function calculateInvitationExpiry(scheduledAt: Date | null, timeZone: string, fallbackDays: number, durationMinutes: number | null = null) {
  if (!scheduledAt) return new Date(Date.now() + fallbackDays * 86_400_000);
  if (durationMinutes && durationMinutes > 0) return new Date(scheduledAt.getTime() + durationMinutes * 60_000 + 86_400_000);
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(scheduledAt).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const midnightAfterFollowingDay = Date.UTC(
    Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day) + 2,
  );
  const approximate = new Date(midnightAfterFollowingDay);
  return new Date(midnightAfterFollowingDay - timeZoneOffsetMs(approximate, timeZone));
}

export function calculateShootAccessDeadline(scheduledAt: Date | null, durationMinutes: number | null, legacyExpiry: Date) {
  return scheduledAt && durationMinutes && durationMinutes > 0
    ? new Date(scheduledAt.getTime() + durationMinutes * 60_000 + 86_400_000)
    : legacyExpiry;
}

export async function getPhotographerProfile(userId: number) {
  if (isLocalFileStoreEnabled()) return localProfileToDomain(await getLocalProfile(userId));
  const db = await requireDb();
  const rows = await db.select().from(miraPhotographerProfiles)
    .where(eq(miraPhotographerProfiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function savePhotographerProfile(params: {
  userId: number;
  displayName: string;
  businessName: string | null;
  bio: string | null;
  photographyStyle: string | null;
  areasOfExpertise: string[];
  websiteUrl: string | null;
  instagramUrl: string | null;
  timezone: string;
}) {
  if (isLocalFileStoreEnabled()) {
    return localProfileToDomain(await saveLocalProfile({ ...params, onboardingStatus: "complete" }));
  }
  const db = await requireDb();
  await db.insert(miraPhotographerProfiles).values({
    ...params,
    onboardingStatus: "complete",
  }).onDuplicateKeyUpdate({
    set: {
      displayName: params.displayName,
      businessName: params.businessName,
      bio: params.bio,
      photographyStyle: params.photographyStyle,
      areasOfExpertise: params.areasOfExpertise,
      websiteUrl: params.websiteUrl,
      instagramUrl: params.instagramUrl,
      timezone: params.timezone,
      onboardingStatus: "complete",
    },
  });
  return getPhotographerProfile(params.userId);
}

export async function createCanonicalShoot(params: {
  photographerUserId: number;
  sourceMode: "maria_photography" | "mira_saas";
  externalSourceId?: string | null;
  title: string;
  shootType: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  invitationMessage: string | null;
  scheduledAt: Date | null;
  timezone: string;
  intendedUse: string | null;
  location: string | null;
  durationMinutes: number | null;
  photographerNotes: string | null;
  callAllowanceSeconds: number;
}) {
  if (isLocalFileStoreEnabled()) {
    const shoot = await createLocalShoot({
      ...params,
      externalSourceId: params.externalSourceId ?? null,
      scheduledAt: params.scheduledAt?.toISOString() ?? null,
      status: "draft",
      roomState: "welcome",
    });
    return { shoot: localShootToDomain(shoot), reused: false as const };
  }
  const db = await requireDb();
  if (params.externalSourceId) {
    const existing = await db.select().from(miraShoots).where(and(
      eq(miraShoots.sourceMode, params.sourceMode),
      eq(miraShoots.externalSourceId, params.externalSourceId),
    )).limit(1);
    if (existing[0]) return { shoot: existing[0], reused: true as const };
  }
  const [created] = await db.insert(miraShoots).values(params).$returningId();
  const shoot = await getOwnedShoot(params.photographerUserId, created.id);
  if (!shoot) throw new Error("Shoot was created but could not be loaded");
  return { shoot, reused: false as const };
}

export async function listOwnedShoots(photographerUserId: number) {
  if (isLocalFileStoreEnabled()) return (await listLocalShoots(photographerUserId)).map(localShootToDomain);
  const db = await requireDb();
  return db.select().from(miraShoots)
    .where(eq(miraShoots.photographerUserId, photographerUserId))
    .orderBy(desc(miraShoots.updatedAt));
}

export async function getOwnedShoot(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) {
    const shoot = await getLocalShoot(photographerUserId, shootId);
    return shoot ? localShootToDomain(shoot) : null;
  }
  const db = await requireDb();
  const rows = await db.select().from(miraShoots).where(and(
    eq(miraShoots.id, shootId),
    eq(miraShoots.photographerUserId, photographerUserId),
  )).limit(1);
  return rows[0] ?? null;
}

export async function getOwnedShootState(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) {
    const shoot = await getLocalShoot(photographerUserId, shootId);
    const invitations = await listLocalInvitations(shootId);
    return shoot ? { shoot: localShootToDomain(shoot), invitations: invitations.map(item => ({ id: item.id, status: item.status, deliveryStatus: item.deliveryStatus, expiresAt: new Date(item.expiresAt), createdAt: new Date(item.createdAt), consentAcknowledgedAt: item.consentAcknowledgedAt ? new Date(item.consentAcknowledgedAt) : null, preparationStartedAt: item.preparationStartedAt ? new Date(item.preparationStartedAt) : null, completedAt: item.completedAt ? new Date(item.completedAt) : null, preparationUrl: `/prepare/${item.token}` })) } : null;
  }
  const db = await requireDb();
  const shoot = await getOwnedShoot(photographerUserId, shootId);
  if (!shoot) return null;
  const invitations = await db.select({
    id: miraClientInvitations.id,
    status: miraClientInvitations.status,
    deliveryStatus: miraClientInvitations.deliveryStatus,
    deliveryProvider: miraClientInvitations.deliveryProvider,
    expiresAt: miraClientInvitations.expiresAt,
    sentAt: miraClientInvitations.sentAt,
    lastOpenedAt: miraClientInvitations.lastOpenedAt,
    preparationStartedAt: miraClientInvitations.preparationStartedAt,
    completedAt: miraClientInvitations.completedAt,
    consentAcknowledgedAt: miraClientInvitations.consentAcknowledgedAt,
    createdAt: miraClientInvitations.createdAt,
  }).from(miraClientInvitations).where(and(
    eq(miraClientInvitations.shootId, shootId),
    eq(miraClientInvitations.photographerUserId, photographerUserId),
  )).orderBy(desc(miraClientInvitations.createdAt));
  return { shoot, invitations };
}

export async function getShootQaInspection(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) {
    const shoot = await getOwnedShoot(photographerUserId, shootId);
    if (!shoot) return null;
    return { profile: await getPhotographerProfile(photographerUserId), shoot, sessions: await listLocalTextTestSessions(photographerUserId, shootId) ?? [], revisions: [], summaries: [] } as any;
  }
  const db = await requireDb();
  const shoot = await getOwnedShoot(photographerUserId, shootId);
  if (!shoot) return null;
  const [profile, sessions, revisions, summaries] = await Promise.all([
    getPhotographerProfile(photographerUserId),
    db.select().from(miraCallSessions).where(and(
      eq(miraCallSessions.shootId, shootId),
      eq(miraCallSessions.photographerUserId, photographerUserId),
    )).orderBy(asc(miraCallSessions.startedAt)),
    db.select().from(miraShootMemoryRevisions).where(and(
      eq(miraShootMemoryRevisions.shootId, shootId),
      eq(miraShootMemoryRevisions.photographerUserId, photographerUserId),
    )).orderBy(asc(miraShootMemoryRevisions.version)),
    db.select().from(miraDiscoverySummaries).where(and(
      eq(miraDiscoverySummaries.shootId, shootId),
      eq(miraDiscoverySummaries.photographerUserId, photographerUserId),
    )).orderBy(asc(miraDiscoverySummaries.createdAt)),
  ]);
  return { profile, shoot, sessions, revisions, summaries };
}

export async function createClientInvitation(params: {
  photographerUserId: number;
  shootId: number;
  expiresAt: Date;
}) {
  if (isLocalFileStoreEnabled()) {
    const shoot = await getLocalShoot(params.photographerUserId, params.shootId);
    if (!shoot) return null;
    const token = randomBytes(32).toString("base64url");
    const invitation = await createLocalInvitation({
      id: randomUUID(), shootId: params.shootId, photographerUserId: params.photographerUserId,
      token, status: "active", deliveryStatus: "created", expiresAt: params.expiresAt.toISOString(),
      consentAcknowledgedAt: null, lastOpenedAt: null, preparationStartedAt: null, completedAt: null,
      scheduleResponse: null,
    });
    await updateLocalShoot(params.photographerUserId, params.shootId, { status: "client_invited" });
    return { invitationId: invitation.id, token, expiresAt: params.expiresAt };
  }
  const db = await requireDb();
  const shoot = await getOwnedShoot(params.photographerUserId, params.shootId);
  if (!shoot) return null;
  const token = randomBytes(32).toString("base64url");
  const invitationId = randomUUID();
  await db.transaction(async tx => {
    await tx.update(miraClientInvitations).set({ status: "revoked" }).where(and(
      eq(miraClientInvitations.shootId, params.shootId),
      eq(miraClientInvitations.photographerUserId, params.photographerUserId),
      eq(miraClientInvitations.status, "active"),
    ));
    await tx.insert(miraClientInvitations).values({
      id: invitationId,
      shootId: params.shootId,
      photographerUserId: params.photographerUserId,
      tokenHash: hashClientInvitationToken(token),
      expiresAt: params.expiresAt,
      consentPolicyVersion: MIRA_CLIENT_CONSENT_POLICY_VERSION,
    });
    await tx.update(miraShoots).set({ status: "client_invited" }).where(and(
      eq(miraShoots.id, params.shootId),
      eq(miraShoots.photographerUserId, params.photographerUserId),
    ));
  });
  return { invitationId, token, expiresAt: params.expiresAt };
}

export async function getClientInvitation(token: string, markOpened = false) {
  if (isLocalFileStoreEnabled()) {
    const state = await getLocalInvitation(token, markOpened);
    if (!state) return null;
    const storedExpiry = new Date(state.invitation.expiresAt);
    const accessDeadline = calculateShootAccessDeadline(
      state.shoot.scheduledAt ? new Date(state.shoot.scheduledAt) : null,
      state.shoot.durationMinutes,
      storedExpiry,
    );
    const closedByShoot = state.shoot.status === "cancelled" || state.shoot.status === "archived";
    const invitationStatus = state.invitation.status === "active" && (closedByShoot || accessDeadline.getTime() <= Date.now())
      ? (closedByShoot ? "revoked" : "expired")
      : state.invitation.status;
    return {
      invitation: {
        ...state.invitation,
        status: invitationStatus,
        expiresAt: accessDeadline,
        consentAcknowledgedAt: state.invitation.consentAcknowledgedAt ? new Date(state.invitation.consentAcknowledgedAt) : null,
        lastOpenedAt: state.invitation.lastOpenedAt ? new Date(state.invitation.lastOpenedAt) : null,
        preparationStartedAt: state.invitation.preparationStartedAt ? new Date(state.invitation.preparationStartedAt) : null,
        completedAt: state.invitation.completedAt ? new Date(state.invitation.completedAt) : null,
      },
      shoot: localShootToDomain(state.shoot),
      photographer: localProfileToDomain(state.photographer),
    } as any;
  }
  const db = await requireDb();
  const condition = await resolveInvitationCondition(token);
  if (!condition) return null;
  const rows = await db.select({
    invitation: miraClientInvitations,
    shoot: miraShoots,
    photographer: miraPhotographerProfiles,
  }).from(miraClientInvitations)
    .innerJoin(miraShoots, eq(miraShoots.id, miraClientInvitations.shootId))
    .leftJoin(miraPhotographerProfiles, eq(miraPhotographerProfiles.userId, miraShoots.photographerUserId))
    .where(condition)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  finalizeInvitationRoomRow(row);
  if (markOpened && row.invitation.status === "active") {
    const openedAt = row.invitation.lastOpenedAt ?? new Date();
    await db.update(miraClientInvitations).set({
      lastOpenedAt: openedAt,
      ...(row.invitation.deliveryStatus === "created" || row.invitation.deliveryStatus === "sent"
        ? { deliveryStatus: "opened" as const }
        : {}),
    }).where(eq(miraClientInvitations.id, row.invitation.id));
    row.invitation.lastOpenedAt = openedAt;
    if (row.invitation.deliveryStatus === "created" || row.invitation.deliveryStatus === "sent") {
      row.invitation.deliveryStatus = "opened";
    }
  }
  return row;
}

// Internal, credential-free lookup used by the email outbox worker: it
// already knows the invitationId (from the job it claimed) and needs the
// authoritative current state to both re-check deliverability and mint a
// fresh signed access link. Never exposed to a client-facing procedure.
export async function getInvitationRoomStateById(invitationId: string) {
  if (isLocalFileStoreEnabled()) return null;
  const db = await requireDb();
  const rows = await db.select({
    invitation: miraClientInvitations,
    shoot: miraShoots,
    photographer: miraPhotographerProfiles,
  }).from(miraClientInvitations)
    .innerJoin(miraShoots, eq(miraShoots.id, miraClientInvitations.shootId))
    .leftJoin(miraPhotographerProfiles, eq(miraPhotographerProfiles.userId, miraShoots.photographerUserId))
    .where(eq(miraClientInvitations.id, invitationId))
    .limit(1);
  const row = rows[0];
  return row ? finalizeInvitationRoomRow(row) : null;
}

export async function acknowledgeClientInvitation(token: string) {
  if (!isLocalFileStoreEnabled()) return null;
  const invitation = await acceptLocalInvitation(token);
  return invitation ? { accepted: true as const } : null;
}

export async function updateOwnedShootContact(params: {
  photographerUserId: number;
  shootId: number;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  invitationMessage: string | null;
}) {
  if (isLocalFileStoreEnabled()) {
    const shoot = await updateLocalShoot(params.photographerUserId, params.shootId, { clientName: params.clientName, clientEmail: params.clientEmail, clientPhone: params.clientPhone, invitationMessage: params.invitationMessage });
    if (!shoot) return null;
    return getOwnedShoot(params.photographerUserId, params.shootId);
  }
  const db = await requireDb();
  const result = await db.update(miraShoots).set({
    clientName: params.clientName,
    clientEmail: params.clientEmail,
    clientPhone: params.clientPhone,
    invitationMessage: params.invitationMessage,
  }).where(and(
    eq(miraShoots.id, params.shootId),
    eq(miraShoots.photographerUserId, params.photographerUserId),
  ));
  return Number(result[0].affectedRows) === 1
    ? getOwnedShoot(params.photographerUserId, params.shootId)
    : null;
}

export async function markInvitationSent(params: {
  invitationId: string;
  photographerUserId: number;
  provider: string;
  messageId: string;
}) {
  const db = await requireDb();
  await db.update(miraClientInvitations).set({
    deliveryStatus: "sent",
    deliveryProvider: params.provider,
    providerMessageId: params.messageId,
    sentAt: new Date(),
  }).where(and(
    eq(miraClientInvitations.id, params.invitationId),
    eq(miraClientInvitations.photographerUserId, params.photographerUserId),
  ));
}

export async function startTextTestSession(token: string, consentAcknowledged: boolean) {
  if (!consentAcknowledged) throw new Error("Consent acknowledgement is required");
  if (isLocalFileStoreEnabled()) {
    const state = await getClientInvitation(token);
    if (!state || state.invitation.status !== "active") return null;
    return startLocalTextTestSession({
      token,
      prompts: TEXT_TEST_QUESTIONS,
      allowedSeconds: state.shoot.callAllowanceSeconds,
      maxSessions: state.invitation.maxSessions ?? 3,
    });
  }
  const db = await requireDb();
  const state = await getClientInvitation(token);
  if (!state || state.invitation.status !== "active") return null;
  const sessionCount = await db.select({ value: count() }).from(miraCallSessions)
    .where(eq(miraCallSessions.invitationId, state.invitation.id));
  if ((sessionCount[0]?.value ?? 0) >= state.invitation.maxSessions) return null;
  const sessionId = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(miraCallSessions).values({
      id: sessionId,
      invitationId: state.invitation.id,
      shootId: state.shoot.id,
      photographerUserId: state.shoot.photographerUserId,
      mode: "text_test",
      allowedSeconds: state.shoot.callAllowanceSeconds,
      promptVersion: MIRA_MASTER_PROMPT_VERSION,
    });
    await tx.insert(miraCallEvents).values({
      id: randomUUID(), sessionId, shootId: state.shoot.id, ordinal: 1,
      role: "assistant", content: TEXT_TEST_QUESTIONS[0],
    });
    await tx.update(miraClientInvitations).set({
      consentAcknowledgedAt: new Date(), lastOpenedAt: new Date(),
      deliveryStatus: "preparation_in_progress", preparationStartedAt: new Date(),
    }).where(eq(miraClientInvitations.id, state.invitation.id));
    await tx.update(miraShoots).set({ status: "conversation_in_progress" })
      .where(eq(miraShoots.id, state.shoot.id));
  });
  return {
    sessionId,
    prompt: TEXT_TEST_QUESTIONS[0],
    allowedSeconds: state.shoot.callAllowanceSeconds,
  };
}

export async function submitTextTestTurn(params: { token: string; sessionId: string; answer: string }) {
  if (isLocalFileStoreEnabled()) {
    const result = await submitLocalTextTestTurn({ ...params, prompts: TEXT_TEST_QUESTIONS });
    if (!result) return null;
    return {
      shootId: result.shootId,
      turnCount: result.turnCount,
      response: result.nextPrompt ?? "Thank you. I have enough for this preparation. Your photographer will review what you shared.",
      complete: result.complete,
    };
  }
  const db = await requireDb();
  const invitationCondition = await resolveInvitationCondition(params.token);
  if (!invitationCondition) return null;
  return db.transaction(async tx => {
    const rows = await tx.select({ session: miraCallSessions, invitation: miraClientInvitations })
      .from(miraCallSessions)
      .innerJoin(miraClientInvitations, eq(miraClientInvitations.id, miraCallSessions.invitationId))
      .where(and(
        eq(miraCallSessions.id, params.sessionId),
        eq(miraCallSessions.status, "active"),
        invitationCondition,
        eq(miraClientInvitations.status, "active"),
      )).limit(1);
    const row = rows[0];
    if (!row) return null;
    const consumedSeconds = Math.max(0, Math.floor((Date.now() - row.session.startedAt.getTime()) / 1000));
    if (consumedSeconds >= row.session.allowedSeconds) {
      await tx.update(miraCallSessions).set({
        status: "ended",
        consumedSeconds: row.session.allowedSeconds,
        endedAt: new Date(),
        endReason: "allowance_exhausted",
      }).where(eq(miraCallSessions.id, params.sessionId));
      await tx.update(miraClientInvitations).set({ status: "completed" })
        .where(eq(miraClientInvitations.id, row.invitation.id));
      return null;
    }
    const nextTurn = row.session.turnCount + 1;
    const latest = await tx.select({ ordinal: miraCallEvents.ordinal }).from(miraCallEvents)
      .where(eq(miraCallEvents.sessionId, params.sessionId))
      .orderBy(desc(miraCallEvents.ordinal)).limit(1);
    let ordinal = (latest[0]?.ordinal ?? 0) + 1;
    const clientEventId = randomUUID();
    await tx.insert(miraCallEvents).values({
      id: clientEventId, sessionId: params.sessionId, shootId: row.session.shootId,
      ordinal, role: "client", content: params.answer,
    });
    const previousRevisions = await tx.select().from(miraShootMemoryRevisions)
      .where(eq(miraShootMemoryRevisions.shootId, row.session.shootId))
      .orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
    const previousMemory = previousRevisions[0]?.snapshotJson ?? emptyShootMemory();
    const memoryPatch = memoryPatchForTextTestAnswer({
      answerIndex: row.session.turnCount,
      answer: params.answer,
      sourceEventId: clientEventId,
    });
    const nextMemory = applyShootMemoryPatch(previousMemory, memoryPatch);
    const memoryVersion = (previousRevisions[0]?.version ?? 0) + 1;
    await tx.insert(miraShootMemoryRevisions).values({
      shootId: row.session.shootId,
      photographerUserId: row.session.photographerUserId,
      version: memoryVersion,
      schemaVersion: MIRA_SHOOT_MEMORY_SCHEMA_VERSION,
      source: "call",
      snapshotJson: nextMemory,
      patchJson: memoryPatch,
    });
    const nextQuestion = TEXT_TEST_QUESTIONS[nextTurn] ?? null;
    if (nextQuestion) {
      ordinal += 1;
      await tx.insert(miraCallEvents).values({
        id: randomUUID(), sessionId: params.sessionId, shootId: row.session.shootId,
        ordinal, role: "assistant", content: nextQuestion,
      });
    }
    await tx.update(miraCallSessions).set({
      turnCount: nextTurn,
      consumedSeconds,
      memoryVersionEnd: memoryVersion,
      ...(nextQuestion ? {} : { status: "ended" as const, endedAt: new Date(), endReason: "test_complete" }),
    })
      .where(eq(miraCallSessions.id, params.sessionId));
    if (!nextQuestion) {
      await tx.update(miraClientInvitations).set({
        status: "completed", deliveryStatus: "completed", completedAt: new Date(),
      })
        .where(eq(miraClientInvitations.id, row.invitation.id));
    }
    return {
      shootId: row.session.shootId,
      turnCount: nextTurn,
      response: nextQuestion ?? "Thank you. I have enough for this preparation test. Your photographer will review what you shared.",
      complete: !nextQuestion,
    };
  });
}

export async function endTextTestSession(params: { token: string; sessionId: string }) {
  if (isLocalFileStoreEnabled()) return endLocalTextTestSession(params);
  const db = await requireDb();
  const invitation = await getClientInvitation(params.token);
  if (!invitation) return false;
  const result = await db.update(miraCallSessions).set({
    status: "ended", endedAt: new Date(), endReason: "client_ended",
  }).where(and(
    eq(miraCallSessions.id, params.sessionId),
    eq(miraCallSessions.invitationId, invitation.invitation.id),
    eq(miraCallSessions.status, "active"),
  ));
  const ended = Number(result[0].affectedRows) === 1;
  if (ended) {
    await db.update(miraClientInvitations).set({ status: "completed" })
      .where(eq(miraClientInvitations.id, invitation.invitation.id));
  }
  return ended;
}

export async function getCompletionNotificationContext(shootId: number) {
  const db = await requireDb();
  const rows = await db.select({
    shoot: miraShoots,
    invitation: miraClientInvitations,
    photographerEmail: users.email,
  }).from(miraClientInvitations)
    .innerJoin(miraShoots, eq(miraShoots.id, miraClientInvitations.shootId))
    .innerJoin(users, eq(users.id, miraShoots.photographerUserId))
    .where(and(
      eq(miraClientInvitations.shootId, shootId),
      eq(miraClientInvitations.deliveryStatus, "completed"),
    )).orderBy(desc(miraClientInvitations.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function markPhotographerNotified(invitationId: string) {
  const db = await requireDb();
  await db.update(miraClientInvitations).set({ photographerNotifiedAt: new Date() })
    .where(eq(miraClientInvitations.id, invitationId));
}

export async function listTextTestEventsForOwner(photographerUserId: number, shootId: number) {
  const db = await requireDb();
  const shoot = await getOwnedShoot(photographerUserId, shootId);
  if (!shoot) return null;
  return db.select().from(miraCallEvents)
    .where(eq(miraCallEvents.shootId, shootId)).orderBy(asc(miraCallEvents.ordinal));
}

export async function getLatestShootMemory(shootId: number) {
  const db = await requireDb();
  const rows = await db.select().from(miraShootMemoryRevisions)
    .where(eq(miraShootMemoryRevisions.shootId, shootId))
    .orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
  return rows[0]?.snapshotJson ?? emptyShootMemory();
}

export async function startOrResumeRealtimeSession(token: string) {
  const db = await requireDb();
  const state = await getClientInvitation(token, true);
  if (!state || state.invitation.status !== "active") return null;
  const now = new Date();
  const reconnectUntil = new Date(now.getTime() + 60_000);
  return db.transaction(async tx => {
    const active = await tx.select().from(miraCallSessions).where(and(
      eq(miraCallSessions.shootId, state.shoot.id),
      eq(miraCallSessions.activeSlot, 1),
    )).limit(1);
    if (active[0]) {
      if (active[0].invitationId !== state.invitation.id || active[0].mode !== "realtime") return null;
      if (active[0].reconnectUntil && active[0].reconnectUntil.getTime() < now.getTime()) {
        await tx.update(miraCallSessions).set({ status: "ended", activeSlot: null, endedAt: now, endReason: "reconnect_grace_expired", reconnectUntil: null })
          .where(eq(miraCallSessions.id, active[0].id));
      } else {
        await tx.update(miraCallSessions).set({ status: "active", lastConnectedAt: now, reconnectUntil })
          .where(eq(miraCallSessions.id, active[0].id));
        return { session: { ...active[0], status: "active" as const, lastConnectedAt: now, reconnectUntil }, reused: true as const, shoot: state.shoot };
      }
    }
    const sessionId = randomUUID();
    await tx.insert(miraCallSessions).values({
      id: sessionId,
      invitationId: state.invitation.id,
      shootId: state.shoot.id,
      photographerUserId: state.shoot.photographerUserId,
      mode: "realtime",
      activeSlot: 1,
      allowedSeconds: state.shoot.callAllowanceSeconds,
      promptVersion: MIRA_MASTER_PROMPT_VERSION,
      lastConnectedAt: now,
      reconnectUntil,
    });
    await tx.update(miraClientInvitations).set({
      consentAcknowledgedAt: state.invitation.consentAcknowledgedAt ?? now,
      lastOpenedAt: state.invitation.lastOpenedAt ?? now,
      deliveryStatus: "preparation_in_progress",
      preparationStartedAt: state.invitation.preparationStartedAt ?? now,
    }).where(eq(miraClientInvitations.id, state.invitation.id));
    await tx.update(miraShoots).set({
      status: state.shoot.status === "preparation_ready" ? "preparation_ready" : "conversation_in_progress",
      roomState: state.shoot.roomState === "welcome" ? "discovery_offered" : state.shoot.roomState,
    })
      .where(eq(miraShoots.id, state.shoot.id));
    const created = await tx.select().from(miraCallSessions)
      .where(eq(miraCallSessions.id, sessionId)).limit(1);
    return {
      session: created[0]!,
      reused: false as const,
      shoot: {
        ...state.shoot,
        roomState: state.shoot.roomState === "welcome" ? "discovery_offered" as const : state.shoot.roomState,
      },
    };
  });
}

export async function updateRealtimeProviderCall(sessionId: string, providerCallId: string | null) {
  const db = await requireDb();
  await db.update(miraCallSessions).set({ providerCallId, lastConnectedAt: new Date() })
    .where(and(eq(miraCallSessions.id, sessionId), eq(miraCallSessions.activeSlot, 1)));
}

export async function setRealtimeSessionPaused(params: { token: string; sessionId: string; paused: boolean }) {
  const db = await requireDb();
  const state = await getClientInvitation(params.token);
  if (!state) return false;
  const result = await db.update(miraCallSessions).set({ status: params.paused ? "paused" : "active" })
    .where(and(
      eq(miraCallSessions.id, params.sessionId),
      eq(miraCallSessions.invitationId, state.invitation.id),
      eq(miraCallSessions.activeSlot, 1),
    ));
  return Number(result[0].affectedRows) === 1;
}

export async function persistRealtimeMemoryTool(params: {
  token: string;
  sessionId: string;
  input: unknown;
}) {
  const parsed = realtimeMemoryToolInputSchema.parse(params.input);
  const db = await requireDb();
  const invitationCondition = await resolveInvitationCondition(params.token);
  if (!invitationCondition) return null;
  return db.transaction(async tx => {
    const rows = await tx.select({ session: miraCallSessions, invitation: miraClientInvitations })
      .from(miraCallSessions)
      .innerJoin(miraClientInvitations, eq(miraClientInvitations.id, miraCallSessions.invitationId))
      .where(and(
        eq(miraCallSessions.id, params.sessionId),
        eq(miraCallSessions.activeSlot, 1),
        invitationCondition,
        eq(miraClientInvitations.status, "active"),
      )).limit(1);
    const row = rows[0];
    if (!row || (row.session.status !== "active" && row.session.status !== "paused")) return null;
    const consumedSeconds = Math.max(0, Math.floor((Date.now() - row.session.startedAt.getTime()) / 1000));
    if (consumedSeconds >= row.session.allowedSeconds) return null;
    const latestEvent = await tx.select({ ordinal: miraCallEvents.ordinal }).from(miraCallEvents)
      .where(eq(miraCallEvents.sessionId, params.sessionId)).orderBy(desc(miraCallEvents.ordinal)).limit(1);
    const eventId = randomUUID();
    await tx.insert(miraCallEvents).values({
      id: eventId,
      sessionId: params.sessionId,
      shootId: row.session.shootId,
      ordinal: (latestEvent[0]?.ordinal ?? 0) + 1,
      role: "client",
      content: parsed.statement,
    });
    const previousRevisions = await tx.select().from(miraShootMemoryRevisions)
      .where(eq(miraShootMemoryRevisions.shootId, row.session.shootId))
      .orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
    const now = new Date().toISOString();
    const patch = shootMemoryPatchSchema.parse({
      changes: parsed.changes.map(change => change.operation === "set" ? {
        operation: "set" as const,
        path: change.path,
        value: {
          value: change.value,
          kind: change.kind,
          confidence: change.confidence,
          sourceEventIds: [eventId],
          clientConfirmed: change.clientConfirmed,
          updatedAt: now,
        },
      } : change),
      openQuestions: parsed.significance === "significant_unexplored"
        ? (parsed.openQuestions?.length ? parsed.openQuestions : ["Explore the important new material before summarising."])
        : parsed.openQuestions,
    });
    const nextMemory = applyShootMemoryPatch(previousRevisions[0]?.snapshotJson ?? emptyShootMemory(), patch);
    const version = (previousRevisions[0]?.version ?? 0) + 1;
    await tx.insert(miraShootMemoryRevisions).values({
      shootId: row.session.shootId,
      photographerUserId: row.session.photographerUserId,
      version,
      schemaVersion: MIRA_SHOOT_MEMORY_SCHEMA_VERSION,
      source: "call",
      snapshotJson: nextMemory,
      patchJson: patch,
    });
    await tx.update(miraCallSessions).set({ memoryVersionEnd: version, consumedSeconds })
      .where(eq(miraCallSessions.id, params.sessionId));
    if (row.session.status === "active") {
      // Session start already advances welcome -> discovery_offered before any
      // memory tool call can arrive, so this must also accept discovery_offered
      // as a source state or discovery_in_progress becomes unreachable.
      await tx.update(miraShoots).set({ roomState: "discovery_in_progress" })
        .where(and(
          eq(miraShoots.id, row.session.shootId),
          inArray(miraShoots.roomState, ["welcome", "discovery_offered"]),
        ));
    }
    return { version, completeness: nextMemory.completeness, discoveryGate: evaluateDiscoveryGate(nextMemory) };
  });
}

export async function createRealtimeDiscoverySummary(params: { token: string; sessionId: string; summaryText: string }) {
  const db = await requireDb();
  const state = await getClientInvitation(params.token);
  if (!state) return null;
  const memoryRows = await db.select().from(miraShootMemoryRevisions)
    .where(eq(miraShootMemoryRevisions.shootId, state.shoot.id))
    .orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
  const memory = memoryRows[0]?.snapshotJson ?? emptyShootMemory();
  const gate = evaluateDiscoveryGate(memory);
  if (!gate.ready || !memoryRows[0]) return { created: false as const, gate };
  const sessions = await db.select().from(miraCallSessions).where(and(
    eq(miraCallSessions.id, params.sessionId),
    eq(miraCallSessions.invitationId, state.invitation.id),
    eq(miraCallSessions.activeSlot, 1),
  )).limit(1);
  if (!sessions[0]) return null;
  const existing = await db.select().from(miraDiscoverySummaries).where(and(
    eq(miraDiscoverySummaries.sessionId, params.sessionId),
    eq(miraDiscoverySummaries.memoryVersion, memoryRows[0].version),
  )).limit(1);
  const summaryId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await db.insert(miraDiscoverySummaries).values({
      id: summaryId,
      shootId: state.shoot.id,
      sessionId: params.sessionId,
      photographerUserId: state.shoot.photographerUserId,
      memoryVersion: memoryRows[0].version,
      summaryText: params.summaryText,
    });
  }
  await db.update(miraShoots).set({ roomState: "summary_pending" }).where(eq(miraShoots.id, state.shoot.id));
  return { created: true as const, summaryId, memoryVersion: memoryRows[0].version, summaryText: existing[0]?.summaryText ?? params.summaryText, gate };
}

export async function confirmRealtimeDiscoverySummary(params: { token: string; sessionId: string; summaryId: string }) {
  const db = await requireDb();
  const state = await getClientInvitation(params.token);
  if (!state) return null;
  const memoryRows = await db.select().from(miraShootMemoryRevisions)
    .where(eq(miraShootMemoryRevisions.shootId, state.shoot.id))
    .orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
  const memory = memoryRows[0]?.snapshotJson ?? emptyShootMemory();
  const gate = evaluateDiscoveryGate(memory);
  if (!gate.ready || !memoryRows[0]) return { confirmed: false as const, gate };
  const summaries = await db.select().from(miraDiscoverySummaries).where(and(
    eq(miraDiscoverySummaries.id, params.summaryId),
    eq(miraDiscoverySummaries.sessionId, params.sessionId),
    eq(miraDiscoverySummaries.shootId, state.shoot.id),
  )).limit(1);
  const summary = summaries[0];
  if (!summary || summary.memoryVersion !== memoryRows[0].version) {
    return { confirmed: false as const, staleSummary: true as const, gate };
  }
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(miraDiscoverySummaries).set({ confirmedAt: summary.confirmedAt ?? now })
      .where(eq(miraDiscoverySummaries.id, summary.id));
    await tx.update(miraCallSessions).set({ summaryConfirmedAt: now })
      .where(and(eq(miraCallSessions.id, params.sessionId), eq(miraCallSessions.activeSlot, 1)));
    await tx.update(miraShoots).set({ roomState: "discovery_confirmed" })
      .where(eq(miraShoots.id, state.shoot.id));
  });
  return { confirmed: true as const, summaryId: summary.id, memoryVersion: summary.memoryVersion, gate };
}

export async function activatePreparationRoom(shootId: number) {
  const db = await requireDb();
  await db.update(miraShoots).set({ roomState: "preparation_active", status: "preparation_ready" })
    .where(eq(miraShoots.id, shootId));
}

// The single photographer-driven action that closes the journey: only allowed
// once the creative pipeline has actually activated Preparation (roomState),
// never earlier. This is what the client-facing "Ready to Shoot" section
// reflects back once true.
export async function markShootReadyToShoot(params: { photographerUserId: number; shootId: number }) {
  const db = await requireDb();
  const result = await db.update(miraShoots).set({ status: "ready_to_shoot" }).where(and(
    eq(miraShoots.id, params.shootId),
    eq(miraShoots.photographerUserId, params.photographerUserId),
    eq(miraShoots.roomState, "preparation_active"),
  ));
  return Number(result[0].affectedRows) === 1;
}

// Records the client's confirm/request-change response to the scheduled
// date, time, and location shown in "Your Shoot". Deliberately reuses the
// existing versioned ShootMemory mechanism (a new revision under
// shootContext.scheduleConfirmation) rather than a new table/column - no
// migration required, and it stays functionally separate from Discovery
// (that field is excluded from DISCOVERY_SIGNALS in memory.ts).
export async function recordShootScheduleResponse(params: {
  shootId: number;
  photographerUserId: number;
  response: "confirmed" | "change_requested";
  note: string | null;
}) {
  if (isLocalFileStoreEnabled()) {
    const invitation = await getLocalInvitationForShoot(params.shootId);
    if (invitation) await updateLocalInvitation(invitation.id, { scheduleResponse: { response: params.response, note: params.note } });
    return { response: params.response, note: params.note };
  }
  const db = await requireDb();
  const previousRevisions = await db.select().from(miraShootMemoryRevisions)
    .where(eq(miraShootMemoryRevisions.shootId, params.shootId))
    .orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
  const previousMemory = previousRevisions[0]?.snapshotJson ?? emptyShootMemory();
  const now = new Date().toISOString();
  const value = params.response === "change_requested" && params.note
    ? [params.response, params.note]
    : [params.response];
  const patch = shootMemoryPatchSchema.parse({
    changes: [{
      operation: "set" as const,
      path: "shootContext.scheduleConfirmation" as const,
      value: {
        value,
        kind: "explicit" as const,
        confidence: "high" as const,
        sourceEventIds: [randomUUID()],
        clientConfirmed: true,
        updatedAt: now,
      },
    }],
  });
  const nextMemory = applyShootMemoryPatch(previousMemory, patch);
  const version = (previousRevisions[0]?.version ?? 0) + 1;
  await db.insert(miraShootMemoryRevisions).values({
    shootId: params.shootId,
    photographerUserId: params.photographerUserId,
    version,
    schemaVersion: MIRA_SHOOT_MEMORY_SCHEMA_VERSION,
    source: "system",
    snapshotJson: nextMemory,
    patchJson: patch,
  });
  return { response: params.response, note: params.note };
}

export async function appendRealtimeQaEvent(params: { token: string; sessionId: string; direction: "client" | "assistant"; modality: "voice_transcript" | "text_fallback"; content: string }) {
  const db = await requireDb();
  const state = await getClientInvitation(params.token);
  if (!state) return false;
  const sessions = await db.select().from(miraCallSessions).where(and(eq(miraCallSessions.id, params.sessionId), eq(miraCallSessions.invitationId, state.invitation.id))).limit(1);
  if (!sessions[0]) return false;
  const days = Number.isFinite(ENV.miraPilotQaRetentionDays) ? Math.min(30, Math.max(1, ENV.miraPilotQaRetentionDays)) : 7;
  await db.delete(miraCallQaEvents).where(lt(miraCallQaEvents.expiresAt, new Date()));
  await db.insert(miraCallQaEvents).values({ id: randomUUID(), sessionId: params.sessionId, shootId: state.shoot.id, direction: params.direction, modality: params.modality, content: params.content, expiresAt: new Date(Date.now() + days * 86_400_000) });
  return true;
}

export async function listRealtimeQaEventsForOwner(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) {
    const sessions = await listLocalTextTestSessions(photographerUserId, shootId);
    if (!sessions) return null;
    const retentionMs = (Number.isFinite(ENV.miraPilotQaRetentionDays) ? Math.min(30, Math.max(1, ENV.miraPilotQaRetentionDays)) : 7) * 86_400_000;
    const now = Date.now();
    return sessions.flatMap(session => session.messages.map((message, index) => ({
      id: `${session.id}:${index}`,
      direction: message.role,
      modality: "text_fallback" as const,
      content: message.content,
      createdAt: new Date(message.createdAt),
      expiresAt: new Date(new Date(message.createdAt).getTime() + retentionMs),
    }))).filter(event => event.expiresAt.getTime() > now).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
  const db = await requireDb();
  if (!await getOwnedShoot(photographerUserId, shootId)) return null;
  await db.delete(miraCallQaEvents).where(lt(miraCallQaEvents.expiresAt, new Date()));
  return db.select({ id: miraCallQaEvents.id, direction: miraCallQaEvents.direction, modality: miraCallQaEvents.modality, content: miraCallQaEvents.content, createdAt: miraCallQaEvents.createdAt, expiresAt: miraCallQaEvents.expiresAt })
    .from(miraCallQaEvents).where(eq(miraCallQaEvents.shootId, shootId)).orderBy(asc(miraCallQaEvents.createdAt));
}

export async function deleteRealtimeQaEventsForOwner(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) return deleteLocalTextTestMessages(photographerUserId, shootId);
  const db = await requireDb();
  if (!await getOwnedShoot(photographerUserId, shootId)) return false;
  await db.delete(miraCallQaEvents).where(eq(miraCallQaEvents.shootId, shootId));
  return true;
}

export async function finalizeRealtimeSession(params: {
  token: string;
  sessionId: string;
  completed: boolean;
  reason: string;
  clientStatement?: string | null;
}) {
  const db = await requireDb();
  const invitationCondition = await resolveInvitationCondition(params.token);
  if (!invitationCondition) return null;
  return db.transaction(async tx => {
    const rows = await tx.select({ session: miraCallSessions, invitation: miraClientInvitations })
      .from(miraCallSessions)
      .innerJoin(miraClientInvitations, eq(miraClientInvitations.id, miraCallSessions.invitationId))
      .where(and(
        eq(miraCallSessions.id, params.sessionId),
        invitationCondition,
      )).limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.session.status === "ended") {
      return { shootId: row.session.shootId, completed: row.invitation.deliveryStatus === "completed", alreadyFinalized: true };
    }
    if (params.completed) {
      const memoryRows = await tx.select().from(miraShootMemoryRevisions).where(eq(miraShootMemoryRevisions.shootId, row.session.shootId)).orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
      const gate = evaluateDiscoveryGate(memoryRows[0]?.snapshotJson ?? emptyShootMemory());
      if (!gate.ready || !row.session.summaryConfirmedAt) return { shootId: row.session.shootId, completed: false, alreadyFinalized: false, blocked: true, gate };
      // Explicit completion (as opposed to a manual "End call" click or the
      // allowance timer, neither of which set completed=true) requires clear,
      // unambiguous language. Ordinary politeness must not finalize the session.
      if (!isStrongCompletionStatement(params.clientStatement ?? "")) {
        return { shootId: row.session.shootId, completed: false, alreadyFinalized: false, insufficientConfirmation: true as const };
      }
    }
    const consumedSeconds = Math.min(row.session.allowedSeconds, Math.max(0, Math.floor((Date.now() - row.session.startedAt.getTime()) / 1000)));
    await tx.update(miraCallSessions).set({
      status: "ended",
      activeSlot: null,
      consumedSeconds,
      endedAt: new Date(),
      reconnectUntil: null,
      endReason: params.reason,
    }).where(eq(miraCallSessions.id, params.sessionId));
    if (params.completed) {
      await tx.update(miraClientInvitations).set({ deliveryStatus: "completed", completedAt: new Date() })
        .where(eq(miraClientInvitations.id, row.invitation.id));
    }
    if (params.completed) {
      // Ending the call is a separate concern from the creative pipeline's
      // readiness: roomState must stay wherever the Creative DNA/moodboard gate
      // (see confirmRealtimeSummary) has actually put it, never be forced to
      // preparation_active just because the human conversation ended.
      await tx.update(miraShoots).set({ status: "preparation_ready" })
        .where(eq(miraShoots.id, row.session.shootId));
    }
    return { shootId: row.session.shootId, completed: params.completed, alreadyFinalized: false };
  });
}

/**
 * Deterministic, server-authoritative snapshot of where the creative pipeline
 * actually stands. Realtime MIRA must call this (via check_preparation_status)
 * rather than narrating a moodboard it has never actually seen.
 */
export async function getShootPreparationStatusForRealtime(shootId: number) {
  const db = await requireDb();
  const shootRows = await db.select({ roomState: miraShoots.roomState, status: miraShoots.status })
    .from(miraShoots).where(eq(miraShoots.id, shootId)).limit(1);
  const creativeDnaRows = await db.select({
    status: miraShootCreativeDna.status,
    errorCode: miraShootCreativeDna.errorCode,
    confirmedMemoryVersion: miraShootCreativeDna.confirmedMemoryVersion,
  }).from(miraShootCreativeDna).where(eq(miraShootCreativeDna.shootId, shootId))
    .orderBy(desc(miraShootCreativeDna.confirmedMemoryVersion)).limit(1);
  const moodboardRows = await db.select({
    status: miraShootMoodboard.status,
    renderStatus: miraShootMoodboard.renderStatus,
    errorCode: miraShootMoodboard.errorCode,
  }).from(miraShootMoodboard).where(eq(miraShootMoodboard.shootId, shootId))
    .orderBy(desc(miraShootMoodboard.confirmedMemoryVersion)).limit(1);
  return {
    roomState: shootRows[0]?.roomState ?? "welcome",
    creativeDna: creativeDnaRows[0] ?? null,
    moodboard: moodboardRows[0] ?? null,
  };
}

/**
 * Client-facing room status for the "02 YOUR VISION" and "03 READY TO SHOOT"
 * sections. Deliberately returns only plain booleans and the persisted
 * moodboard images - never a raw status enum or error code - so the client
 * UI (and any future copy) can never surface internal implementation words.
 */
export async function getShootRoomStatusForClient(shootId: number) {
  if (isLocalFileStoreEnabled()) {
    const state = await (await import("../localFileStore")).getLocalState();
    const shoot = state.shoots.find(item => item.id === shootId);
    const invitation = await getLocalInvitationForShoot(shootId);
    return {
      roomState: shoot?.roomState ?? "welcome", creativeDirectionConfirmed: false, preparationReady: false,
      readyToShoot: shoot?.status === "ready_to_shoot", moodboardReady: false, moodboardStillWorking: false,
      moodboardNeedsRetry: false, images: [], preparationBrief: null,
      scheduledAt: shoot?.scheduledAt ?? null, timezone: shoot?.timezone ?? null,
      durationMinutes: shoot?.durationMinutes ?? null, location: shoot?.location ?? null,
      scheduleResponse: invitation?.scheduleResponse ?? null,
    };
  }
  const db = await requireDb();
  const shootRows = await db.select({
    roomState: miraShoots.roomState,
    status: miraShoots.status,
    location: miraShoots.location,
    scheduledAt: miraShoots.scheduledAt,
    timezone: miraShoots.timezone,
    durationMinutes: miraShoots.durationMinutes,
  }).from(miraShoots).where(eq(miraShoots.id, shootId)).limit(1);
  const shoot = shootRows[0];
  const roomState = shoot?.roomState ?? "welcome";
  const moodboardRows = await db.select({
    status: miraShootMoodboard.status,
    referencesJson: miraShootMoodboard.referencesJson,
  }).from(miraShootMoodboard).where(eq(miraShootMoodboard.shootId, shootId))
    .orderBy(desc(miraShootMoodboard.confirmedMemoryVersion)).limit(1);
  const moodboard = moodboardRows[0];
  const images = moodboard?.status === "complete" && Array.isArray(moodboard.referencesJson)
    ? (moodboard.referencesJson as Array<{ id: string; direction: string; url?: string | null }>)
        .filter((reference): reference is { id: string; direction: string; url: string } => Boolean(reference.url))
        .map(reference => ({ id: reference.id, direction: reference.direction, url: reference.url }))
    : [];
  const creativeDirectionConfirmed = roomState === "preparation_active" || roomState === "discovery_confirmed";
  const preparationReady = roomState === "preparation_active";

  let preparationBrief: ShootPreparationBrief | null = null;
  if (preparationReady && shoot) {
    const creativeDnaRows = await db.select({ creativeDnaJson: miraShootCreativeDna.creativeDnaJson })
      .from(miraShootCreativeDna).where(and(
        eq(miraShootCreativeDna.shootId, shootId),
        eq(miraShootCreativeDna.status, "complete"),
      )).orderBy(desc(miraShootCreativeDna.confirmedMemoryVersion)).limit(1);
    const creativeDna = creativeDnaRows[0]?.creativeDnaJson;
    if (creativeDna) {
      preparationBrief = buildShootPreparationBrief({
        creativeDna,
        shoot: { location: shoot.location, scheduledAt: shoot.scheduledAt, timezone: shoot.timezone },
      });
    }
  }

  const latestMemory = await getLatestShootMemory(shootId);
  const scheduleValue = latestMemory.shootContext.scheduleConfirmation?.value;
  const scheduleResponse = Array.isArray(scheduleValue) && (scheduleValue[0] === "confirmed" || scheduleValue[0] === "change_requested")
    ? { response: scheduleValue[0] as "confirmed" | "change_requested", note: scheduleValue[1] ?? null }
    : null;

  return {
    roomState,
    creativeDirectionConfirmed,
    preparationReady,
    readyToShoot: shoot?.status === "ready_to_shoot",
    moodboardReady: images.length > 0,
    moodboardStillWorking: creativeDirectionConfirmed && images.length === 0 && (!moodboard || moodboard.status !== "retryable_error"),
    moodboardNeedsRetry: creativeDirectionConfirmed && images.length === 0 && moodboard?.status === "retryable_error",
    images,
    preparationBrief,
    scheduledAt: shoot?.scheduledAt ?? null,
    timezone: shoot?.timezone ?? null,
    durationMinutes: shoot?.durationMinutes ?? null,
    location: shoot?.location ?? null,
    scheduleResponse,
  };
}

// Reserved for the Step 5 persistence adapter. Keeping the type here prevents
// the call layer from inventing a second memory shape.
export type PersistableShootMemory = ShootMemory;
