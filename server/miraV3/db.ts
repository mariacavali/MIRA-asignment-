import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import {
  miraV3Consents,
  miraV3Journeys,
  miraV3MediaAssets,
  miraV3Messages,
  miraV3ModuleOutputs,
  miraV3ReflectionRevisions,
  miraV3RenderArtifacts,
  miraV3Sessions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type { ReflectionBundle } from "./bundle";
import { latestConsentStatus, type MiraV3ConsentScope } from "./media";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export const FIRST_REFLECTION_QUESTION =
  "When you feel most like yourself, what are you doing—and what becomes possible in that moment?";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function createMiraV3Journey(userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [created] = await tx
      .insert(miraV3Journeys)
      .values({ userId, status: "reflection", currentStep: "birth_context" })
      .$returningId();

    const journeyId = created.id;
    const sessionId = randomUUID();
    await tx.insert(miraV3Sessions).values({
      id: sessionId,
      journeyId,
      userId,
      status: "active",
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    });
    await tx
      .update(miraV3Journeys)
      .set({ activeSessionId: sessionId })
      .where(and(eq(miraV3Journeys.id, journeyId), eq(miraV3Journeys.userId, userId)));
    return { journeyId, sessionId };
  });
}

export async function listMiraV3Journeys(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(miraV3Journeys)
    .where(and(eq(miraV3Journeys.userId, userId), ne(miraV3Journeys.status, "deleted")))
    .orderBy(desc(miraV3Journeys.updatedAt));
}

export async function getOwnedMiraV3Journey(userId: number, journeyId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(miraV3Journeys)
    .where(
      and(
        eq(miraV3Journeys.id, journeyId),
        eq(miraV3Journeys.userId, userId),
        ne(miraV3Journeys.status, "deleted"),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getLatestMiraV3ModuleOutput(
  userId: number,
  journeyId: number,
  moduleType: string,
) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return undefined;
  const rows = await db
    .select()
    .from(miraV3ModuleOutputs)
    .where(
      and(
        eq(miraV3ModuleOutputs.userId, userId),
        eq(miraV3ModuleOutputs.journeyId, journeyId),
        eq(miraV3ModuleOutputs.module, moduleType),
      ),
    )
    .orderBy(desc(miraV3ModuleOutputs.updatedAt))
    .limit(1);
  return rows[0];
}

export async function saveMiraV3ModuleOutput(params: {
  userId: number;
  journeyId: number;
  moduleType: string;
  status: "pending" | "complete" | "unavailable" | "failed";
  provider?: string | null;
  providerVersion?: string | null;
  input?: unknown;
  output?: unknown;
  provenance?: unknown;
}) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(params.userId, params.journeyId);
  if (!journey) return undefined;
  const existing = await getLatestMiraV3ModuleOutput(params.userId, params.journeyId, params.moduleType);
  const values = {
    status: params.status,
    provider: params.provider || "none",
    providerVersion: params.providerVersion ?? null,
    rawResult: params.input ?? null,
    normalizedResult: {
      input: params.input ?? null,
      output: params.output ?? null,
      provenance: params.provenance ?? null,
    },
    errorMessage: params.status === "failed" ? "Optional module provider failed" : null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(miraV3ModuleOutputs)
      .set(values)
      .where(
        and(
          eq(miraV3ModuleOutputs.id, existing.id),
          eq(miraV3ModuleOutputs.userId, params.userId),
          eq(miraV3ModuleOutputs.journeyId, params.journeyId),
        ),
      );
    return getLatestMiraV3ModuleOutput(params.userId, params.journeyId, params.moduleType);
  }
  const [created] = await db
    .insert(miraV3ModuleOutputs)
    .values({
      userId: params.userId,
      journeyId: params.journeyId,
      module: params.moduleType,
      ...values,
    })
    .$returningId();
  const rows = await db
    .select()
    .from(miraV3ModuleOutputs)
    .where(and(eq(miraV3ModuleOutputs.id, created.id), eq(miraV3ModuleOutputs.userId, params.userId)))
    .limit(1);
  return rows[0];
}

export async function resumeMiraV3ReflectionAfterBirthInterlude(userId: number, journeyId: number) {
  const db = await requireDb();
  const result = await db
    .update(miraV3Journeys)
    .set({ currentStep: "conversation" })
    .where(
      and(
        eq(miraV3Journeys.id, journeyId),
        eq(miraV3Journeys.userId, userId),
        eq(miraV3Journeys.status, "reflection"),
        eq(miraV3Journeys.currentStep, "birth_context"),
        eq(miraV3Journeys.turnCount, 0),
      ),
    );
  const resumed = ((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) === 1;
  if (resumed) {
    const journey = await getOwnedMiraV3Journey(userId, journeyId);
    if (journey?.activeSessionId) {
      await db.insert(miraV3Messages).values({
        journeyId,
        userId,
        sessionId: journey.activeSessionId,
        ordinal: 1,
        role: "assistant",
        content: FIRST_REFLECTION_QUESTION,
        provenance: { type: "opening_prompt", model: null },
      });
    }
  }
  return resumed;
}

export async function getMiraV3ConsentState(userId: number, journeyId: number) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return undefined;
  const rows = await db
    .select()
    .from(miraV3Consents)
    .where(and(eq(miraV3Consents.userId, userId), eq(miraV3Consents.journeyId, journeyId)))
    .orderBy(desc(miraV3Consents.createdAt));
  return latestConsentStatus(rows);
}

export async function recordMiraV3Consent(params: {
  userId: number;
  journeyId: number;
  scope: MiraV3ConsentScope;
  status: "granted" | "revoked";
  policyVersion: string;
}) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(params.userId, params.journeyId);
  if (!journey) return undefined;
  await db.transaction(async tx => {
    await tx.insert(miraV3Consents).values({
      userId: params.userId,
      journeyId: params.journeyId,
      scope: params.scope,
      status: params.status,
      policyVersion: params.policyVersion,
      grantedAt: params.status === "granted" ? new Date() : null,
      revokedAt: params.status === "revoked" ? new Date() : null,
    });
    if (params.status === "revoked") {
      await tx
        .update(miraV3MediaAssets)
        .set({ status: "removed", storageKey: "revoked", storageUrl: "", originalName: null, analysis: null, removedAt: new Date() })
        .where(and(eq(miraV3MediaAssets.userId, params.userId), eq(miraV3MediaAssets.journeyId, params.journeyId), ne(miraV3MediaAssets.status, "removed")));
    }
  });
  return getMiraV3ConsentState(params.userId, params.journeyId);
}

export async function createMiraV3MediaAsset(params: {
  id: string;
  userId: number;
  journeyId: number;
  sessionId?: string | null;
  storageKey: string;
  storageUrl: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
}) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(params.userId, params.journeyId);
  if (!journey) return undefined;
  await db.insert(miraV3MediaAssets).values({ ...params, sessionId: params.sessionId ?? null, kind: "reference_image", status: "uploaded" });
  return { id: params.id, originalName: params.originalName, mimeType: params.mimeType, byteSize: params.byteSize, status: "uploaded" as const };
}

export async function listMiraV3MediaAssets(userId: number, journeyId: number) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return undefined;
  return db
    .select({ id: miraV3MediaAssets.id, originalName: miraV3MediaAssets.originalName, mimeType: miraV3MediaAssets.mimeType, byteSize: miraV3MediaAssets.byteSize, status: miraV3MediaAssets.status, analysis: miraV3MediaAssets.analysis, createdAt: miraV3MediaAssets.createdAt })
    .from(miraV3MediaAssets)
    .where(and(eq(miraV3MediaAssets.userId, userId), eq(miraV3MediaAssets.journeyId, journeyId), ne(miraV3MediaAssets.status, "removed")))
    .orderBy(desc(miraV3MediaAssets.createdAt));
}

export async function getMiraV3MediaAssetForAnalysis(userId: number, journeyId: number, assetId: string) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return undefined;
  const rows = await db
    .select()
    .from(miraV3MediaAssets)
    .where(and(eq(miraV3MediaAssets.id, assetId), eq(miraV3MediaAssets.userId, userId), eq(miraV3MediaAssets.journeyId, journeyId), ne(miraV3MediaAssets.status, "removed")))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveMiraV3MediaAnalysis(params: {
  userId: number;
  journeyId: number;
  assetId: string;
  status: "analyzed" | "failed";
  analysis: unknown;
}) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(params.userId, params.journeyId);
  if (!journey) return undefined;
  const result = await db
    .update(miraV3MediaAssets)
    .set({ status: params.status, analysis: params.analysis, updatedAt: new Date() })
    .where(and(eq(miraV3MediaAssets.id, params.assetId), eq(miraV3MediaAssets.userId, params.userId), eq(miraV3MediaAssets.journeyId, params.journeyId), ne(miraV3MediaAssets.status, "removed")));
  return ((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) === 1;
}

export async function removeMiraV3MediaAsset(userId: number, journeyId: number, assetId: string) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return undefined;
  const result = await db
    .update(miraV3MediaAssets)
    .set({ status: "removed", storageKey: "removed", storageUrl: "", originalName: null, analysis: null, removedAt: new Date() })
    .where(and(eq(miraV3MediaAssets.id, assetId), eq(miraV3MediaAssets.userId, userId), eq(miraV3MediaAssets.journeyId, journeyId), ne(miraV3MediaAssets.status, "removed")));
  return ((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) === 1;
}

export async function getMiraV3JourneyState(userId: number, journeyId: number) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return undefined;

  let activeSessionId = journey.activeSessionId;
  const activeSession = activeSessionId
    ? (
        await db
          .select()
          .from(miraV3Sessions)
          .where(
            and(
              eq(miraV3Sessions.id, activeSessionId),
              eq(miraV3Sessions.userId, userId),
              eq(miraV3Sessions.status, "active"),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  if (!activeSession || activeSession.expiresAt.getTime() <= Date.now()) {
    const newSessionId = randomUUID();
    activeSessionId = newSessionId;
    await db.transaction(async tx => {
      if (activeSession) {
        await tx
          .update(miraV3Sessions)
          .set({ status: "expired" })
          .where(
            and(eq(miraV3Sessions.id, activeSession.id), eq(miraV3Sessions.userId, userId)),
          );
      }
      await tx.insert(miraV3Sessions).values({
        id: newSessionId,
        journeyId,
        userId,
        status: "active",
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      });
      await tx
        .update(miraV3Journeys)
        .set({ activeSessionId })
        .where(and(eq(miraV3Journeys.id, journeyId), eq(miraV3Journeys.userId, userId)));
    });
  }

  const messages = await db
    .select()
    .from(miraV3Messages)
    .where(and(eq(miraV3Messages.journeyId, journeyId), eq(miraV3Messages.userId, userId)))
    .orderBy(asc(miraV3Messages.ordinal));
  const revisions = await db
    .select()
    .from(miraV3ReflectionRevisions)
    .where(
      and(
        eq(miraV3ReflectionRevisions.journeyId, journeyId),
        eq(miraV3ReflectionRevisions.userId, userId),
      ),
    )
    .orderBy(desc(miraV3ReflectionRevisions.version));

  return { journey: { ...journey, activeSessionId }, messages, revisions };
}

export async function softDeleteMiraV3Journey(userId: number, journeyId: number) {
  const db = await requireDb();
  const journey = await getOwnedMiraV3Journey(userId, journeyId);
  if (!journey) return false;

  await db.transaction(async tx => {
    await tx
      .update(miraV3Journeys)
      .set({ status: "deleted", currentStep: "deleted", deletedAt: new Date() })
      .where(and(eq(miraV3Journeys.id, journeyId), eq(miraV3Journeys.userId, userId)));
    await tx
      .update(miraV3Sessions)
      .set({ status: "closed" })
      .where(and(eq(miraV3Sessions.journeyId, journeyId), eq(miraV3Sessions.userId, userId)));
  });
  return true;
}

export async function appendMiraV3ReflectionTurn(params: {
  userId: number;
  journeyId: number;
  sessionId: string;
  expectedTurnCount: number;
  answer: string;
  assistantQuestion?: string;
  assistantProvenance?: Record<string, unknown>;
}) {
  const db = await requireDb();
  const nextTurnCount = params.expectedTurnCount + 1;
  const userOrdinal = params.expectedTurnCount * 2 + 2;
  const readyForBrandSoul = nextTurnCount >= 8;

  return db.transaction(async tx => {
    const updateResult = await tx
      .update(miraV3Journeys)
      .set({
        turnCount: nextTurnCount,
        currentStep: readyForBrandSoul ? "mirror_ready" : "conversation",
      })
      .where(
        and(
          eq(miraV3Journeys.id, params.journeyId),
          eq(miraV3Journeys.userId, params.userId),
          eq(miraV3Journeys.status, "reflection"),
          eq(miraV3Journeys.turnCount, params.expectedTurnCount),
        ),
      );

    const affectedRows = (updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affectedRows !== 1) return { saved: false as const, readyForMirror: false };

    await tx.insert(miraV3Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      sessionId: params.sessionId,
      ordinal: userOrdinal,
      role: "user",
      content: params.answer,
      provenance: { type: "user_reflection", turn: nextTurnCount },
    });

    if (!readyForBrandSoul && params.assistantQuestion) {
      await tx.insert(miraV3Messages).values({
        journeyId: params.journeyId,
        userId: params.userId,
        sessionId: params.sessionId,
        ordinal: userOrdinal + 1,
        role: "assistant",
        content: params.assistantQuestion,
        provenance: params.assistantProvenance ?? null,
      });
    }

    await tx
      .update(miraV3Sessions)
      .set({ lastActivityAt: new Date() })
      .where(
        and(
          eq(miraV3Sessions.id, params.sessionId),
          eq(miraV3Sessions.userId, params.userId),
          eq(miraV3Sessions.status, "active"),
        ),
      );

    return { saved: true as const, readyForMirror: readyForBrandSoul, turnCount: nextTurnCount };
  });
}

export async function createMiraV3MirrorDraft(params: {
  userId: number;
  journeyId: number;
  bundle: ReflectionBundle;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const updateResult = await tx
      .update(miraV3Journeys)
      .set({ status: "mirror_draft", currentStep: "mirror_review" })
      .where(
        and(
          eq(miraV3Journeys.id, params.journeyId),
          eq(miraV3Journeys.userId, params.userId),
          eq(miraV3Journeys.status, "reflection"),
          eq(miraV3Journeys.currentStep, "mirror_ready"),
          gte(miraV3Journeys.turnCount, 8),
        ),
      );
    const affectedRows = (updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affectedRows !== 1) return undefined;

    const [created] = await tx
      .insert(miraV3ReflectionRevisions)
      .values({
        journeyId: params.journeyId,
        userId: params.userId,
        version: 1,
        status: "draft",
        source: "ai",
        bundle: params.bundle,
      })
      .$returningId();
    return { id: created.id, version: 1, status: "draft" as const, bundle: params.bundle };
  });
}

export async function createMiraV3MirrorEdit(params: {
  userId: number;
  journeyId: number;
  bundle: ReflectionBundle;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const journey = (
      await tx
        .select()
        .from(miraV3Journeys)
        .where(
          and(
            eq(miraV3Journeys.id, params.journeyId),
            eq(miraV3Journeys.userId, params.userId),
            eq(miraV3Journeys.status, "mirror_draft"),
            eq(miraV3Journeys.currentStep, "mirror_review"),
          ),
        )
        .limit(1)
    )[0];
    if (!journey) return undefined;

    const latest = (
      await tx
        .select()
        .from(miraV3ReflectionRevisions)
        .where(
          and(
            eq(miraV3ReflectionRevisions.journeyId, params.journeyId),
            eq(miraV3ReflectionRevisions.userId, params.userId),
          ),
        )
        .orderBy(desc(miraV3ReflectionRevisions.version))
        .limit(1)
    )[0];
    if (!latest || latest.status === "confirmed") return undefined;

    await tx
      .update(miraV3ReflectionRevisions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(miraV3ReflectionRevisions.id, latest.id),
          eq(miraV3ReflectionRevisions.userId, params.userId),
          eq(miraV3ReflectionRevisions.status, "draft"),
        ),
      );
    const version = latest.version + 1;
    const [created] = await tx
      .insert(miraV3ReflectionRevisions)
      .values({
        journeyId: params.journeyId,
        userId: params.userId,
        version,
        status: "draft",
        source: "user_edit",
        bundle: params.bundle,
      })
      .$returningId();
    return { id: created.id, version, status: "draft" as const, bundle: params.bundle };
  });
}

export async function confirmMiraV3MirrorRevision(params: {
  userId: number;
  journeyId: number;
  revisionId: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const revision = (
      await tx
        .select()
        .from(miraV3ReflectionRevisions)
        .where(
          and(
            eq(miraV3ReflectionRevisions.id, params.revisionId),
            eq(miraV3ReflectionRevisions.journeyId, params.journeyId),
            eq(miraV3ReflectionRevisions.userId, params.userId),
            eq(miraV3ReflectionRevisions.status, "draft"),
          ),
        )
        .limit(1)
    )[0];
    if (!revision) return undefined;

    const updateResult = await tx
      .update(miraV3Journeys)
      .set({ status: "mirror_confirmed", currentStep: "deliverables" })
      .where(
        and(
          eq(miraV3Journeys.id, params.journeyId),
          eq(miraV3Journeys.userId, params.userId),
          eq(miraV3Journeys.status, "mirror_draft"),
          eq(miraV3Journeys.currentStep, "mirror_review"),
        ),
      );
    const affectedRows = (updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affectedRows !== 1) return undefined;

    await tx
      .update(miraV3ReflectionRevisions)
      .set({ status: "superseded" })
      .where(
        and(
          eq(miraV3ReflectionRevisions.journeyId, params.journeyId),
          eq(miraV3ReflectionRevisions.userId, params.userId),
          ne(miraV3ReflectionRevisions.id, params.revisionId),
        ),
      );
    await tx
      .update(miraV3ReflectionRevisions)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(
        and(
          eq(miraV3ReflectionRevisions.id, params.revisionId),
          eq(miraV3ReflectionRevisions.userId, params.userId),
        ),
      );
    await tx
      .update(miraV3Sessions)
      .set({ status: "closed", lastActivityAt: new Date() })
      .where(
        and(eq(miraV3Sessions.journeyId, params.journeyId), eq(miraV3Sessions.userId, params.userId)),
      );
    return { ...revision, status: "confirmed" as const, confirmedAt: new Date() };
  });
}

export async function saveMiraV3RenderArtifact(params: {
  userId: number;
  journeyId: number;
  revisionId: number;
  deliverable: "mirror" | "brand_soul" | "visual_direction";
  status: "pending" | "ready" | "failed";
  storageKey?: string | null;
  storageUrl?: string | null;
  errorMessage?: string | null;
}) {
  const db = await requireDb();
  await db.insert(miraV3RenderArtifacts).values({
    journeyId: params.journeyId,
    userId: params.userId,
    reflectionRevisionId: params.revisionId,
    deliverable: params.deliverable,
    format: "pdf",
    status: params.status,
    storageKey: params.storageKey ?? null,
    storageUrl: params.storageUrl ?? null,
    errorMessage: params.errorMessage ?? null,
  }).onDuplicateKeyUpdate({ set: {
    status: params.status,
    storageKey: params.storageKey ?? null,
    storageUrl: params.storageUrl ?? null,
    errorMessage: params.errorMessage ?? null,
  } });
}
