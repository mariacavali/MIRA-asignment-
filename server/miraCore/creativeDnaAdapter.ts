import { and, desc, eq } from "drizzle-orm";
import {
  miraDiscoverySummaries,
  miraPhotographerProfiles,
  miraShootCreativeDna,
  miraShootMemoryRevisions,
  miraShoots,
} from "../../drizzle/schema";
import {
  MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
  MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
} from "../../shared/miraV4CreativeDna";
import { getDb } from "../db";
import { isLocalFileStoreEnabled } from "../localFileStore";
import {
  fingerprintMiraV4CreativeDnaSource,
  synthesizeMiraV4CreativeDna,
  type MiraV4CreativeDnaSource,
} from "../miraV4/creativeDna";

function memoryValue(value: unknown) {
  if (!value || typeof value !== "object" || !("value" in value)) return null;
  const raw = (value as { value: string | string[] }).value;
  return Array.isArray(raw) ? raw.join(", ") : raw;
}

export function buildShootCreativeDnaSource(params: {
  shoot: typeof miraShoots.$inferSelect;
  photographer: typeof miraPhotographerProfiles.$inferSelect | null;
  memory: (typeof miraShootMemoryRevisions.$inferSelect)["snapshotJson"];
  summaryText: string;
}): MiraV4CreativeDnaSource {
  const { shoot, photographer, memory } = params;
  return {
    journey: {
      building: memoryValue(memory.identity.business) ?? memoryValue(memory.identity.profession),
      currentPosition: memoryValue(memory.identity.role) ?? memoryValue(memory.identity.relevantContext),
      needMost: memoryValue(memory.brand.desiredPerception) ?? memoryValue(memory.expression.desiredFeeling),
      firstCreation: shoot.intendedUse ?? memoryValue(memory.brand.intendedUses),
      birthDate: null,
      birthTime: null,
      birthTimeUnknown: 1,
      birthCity: null,
      creativeInputs: {
        source: "confirmed_shoot_memory",
        shoot: {
          id: shoot.id,
          title: shoot.title,
          shootType: shoot.shootType,
          scheduledAt: shoot.scheduledAt,
          location: shoot.location,
          intendedUse: shoot.intendedUse,
          durationMinutes: shoot.durationMinutes,
        },
        photographer: photographer ? {
          displayName: photographer.displayName,
          photographyStyle: photographer.photographyStyle,
          areasOfExpertise: photographer.areasOfExpertise ?? [],
        } : null,
        confirmedMemory: memory,
        confirmedSummary: params.summaryText,
      },
    },
    conversation: [{
      phase: "creative_discovery",
      role: "user",
      content: params.summaryText,
    }],
    inspiration: {
      imageReference: null,
      userExplanation: null,
      influenceRule: "supporting_evidence_only",
    },
  };
}

export async function generateShootCreativeDnaForConfirmedMemory(params: {
  shootId: number;
  photographerUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const shootRows = await db.select().from(miraShoots).where(and(
    eq(miraShoots.id, params.shootId),
    eq(miraShoots.photographerUserId, params.photographerUserId),
  )).limit(1);
  const shoot = shootRows[0];
  if (!shoot) return null;
  const summaries = await db.select().from(miraDiscoverySummaries).where(and(
    eq(miraDiscoverySummaries.shootId, params.shootId),
    eq(miraDiscoverySummaries.photographerUserId, params.photographerUserId),
  )).orderBy(desc(miraDiscoverySummaries.createdAt)).limit(1);
  const summary = summaries[0];
  if (!summary?.confirmedAt) throw new Error("Creative DNA requires confirmed Discovery");
  const revisions = await db.select().from(miraShootMemoryRevisions).where(and(
    eq(miraShootMemoryRevisions.shootId, params.shootId),
    eq(miraShootMemoryRevisions.version, summary.memoryVersion),
  )).limit(1);
  const revision = revisions[0];
  if (!revision) throw new Error("Confirmed ShootMemory revision is unavailable");
  const profiles = await db.select().from(miraPhotographerProfiles)
    .where(eq(miraPhotographerProfiles.userId, params.photographerUserId)).limit(1);
  const source = buildShootCreativeDnaSource({ shoot, photographer: profiles[0] ?? null, memory: revision.snapshotJson, summaryText: summary.summaryText });
  const sourceFingerprint = fingerprintMiraV4CreativeDnaSource(source);
  const existing = await db.select().from(miraShootCreativeDna).where(and(
    eq(miraShootCreativeDna.shootId, params.shootId),
    eq(miraShootCreativeDna.confirmedMemoryVersion, summary.memoryVersion),
  )).limit(1);
  if (existing[0]?.status === "complete") return existing[0];
  if (!existing[0]) {
    await db.insert(miraShootCreativeDna).values({
      shootId: params.shootId,
      photographerUserId: params.photographerUserId,
      confirmedMemoryVersion: summary.memoryVersion,
      schemaVersion: MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
      promptVersion: MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
      sourceFingerprint,
      status: "in_progress",
    });
  } else {
    await db.update(miraShootCreativeDna).set({ status: "in_progress", sourceFingerprint, errorCode: null })
      .where(eq(miraShootCreativeDna.id, existing[0].id));
  }
  try {
    const generated = await synthesizeMiraV4CreativeDna({ source });
    await db.update(miraShootCreativeDna).set({
      status: "complete",
      creativeDnaJson: generated.creativeDna,
      model: generated.model,
      errorCode: null,
    }).where(and(
      eq(miraShootCreativeDna.shootId, params.shootId),
      eq(miraShootCreativeDna.confirmedMemoryVersion, summary.memoryVersion),
    ));
  } catch (error) {
    await db.update(miraShootCreativeDna).set({ status: "retryable_error", errorCode: "creative_dna_synthesis_failed" })
      .where(and(
        eq(miraShootCreativeDna.shootId, params.shootId),
        eq(miraShootCreativeDna.confirmedMemoryVersion, summary.memoryVersion),
      ));
    throw error;
  }
  const completed = await db.select().from(miraShootCreativeDna).where(and(
    eq(miraShootCreativeDna.shootId, params.shootId),
    eq(miraShootCreativeDna.confirmedMemoryVersion, summary.memoryVersion),
  )).limit(1);
  return completed[0] ?? null;
}

export async function getShootCreativeDnaForOwner(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) return [];
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(miraShootCreativeDna).where(and(
    eq(miraShootCreativeDna.photographerUserId, photographerUserId),
    eq(miraShootCreativeDna.shootId, shootId),
  )).orderBy(desc(miraShootCreativeDna.confirmedMemoryVersion));
}
