import { and, eq } from "drizzle-orm";
import { miraShootMoodboard } from "../../drizzle/schema";
import { getDb } from "../db";
import { generateMoodboardImageViaOpenAI } from "./openAiMoodboardImage";
import { compileMiraV4VisualSource, MIRA_V4_VISUAL_PROMPT_VERSION } from "../miraV4/moodboard";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function isImageProviderNotConfigured(error: unknown) {
  return error instanceof Error && /OPENAI_API_KEY is not configured/.test(error.message);
}

/**
 * Wires the existing V4/V5 moodboard entry point (compileMiraV4VisualSource ->
 * the five-scene campaign grammar) to a confirmed shoot's Creative DNA. This
 * intentionally reuses the "initial visual exploration" stage of the existing
 * V4 pipeline rather than its interactive select/refine rounds, since the
 * MIRA Core client room has no UI for that human-in-the-loop selection step.
 * That is a deliberate, documented scope choice, not a shortcut around a bug.
 *
 * The deterministic part (compiling the campaign plan and the five scene
 * prompts) never calls an external provider and cannot fail once Creative DNA
 * is schema-valid. Actual pixel rendering calls OpenAI's Images API directly
 * (OPENAI_API_KEY) and is tracked separately via renderStatus so a
 * missing/unavailable image provider never blocks the shoot from reaching
 * Preparation, and is never silently fabricated.
 */
export async function generateShootMoodboardForCreativeDna(params: {
  shootId: number;
  photographerUserId: number;
  confirmedMemoryVersion: number;
  creativeDna: MiraV4CreativeDna;
}) {
  const db = await requireDb();
  const existing = await db.select().from(miraShootMoodboard).where(and(
    eq(miraShootMoodboard.shootId, params.shootId),
    eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
  )).limit(1);
  if (existing[0]?.status === "complete") return existing[0];

  const source = compileMiraV4VisualSource(params.creativeDna);
  const campaignPlanJson = source.campaignPlan as unknown as Record<string, unknown>;

  if (!existing[0]) {
    await db.insert(miraShootMoodboard).values({
      shootId: params.shootId,
      photographerUserId: params.photographerUserId,
      confirmedMemoryVersion: params.confirmedMemoryVersion,
      promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION,
      sourceFingerprint: source.sourceFingerprint,
      status: "in_progress",
      renderStatus: "pending",
      campaignPlanJson,
      referencesJson: source.references,
    });
  } else {
    await db.update(miraShootMoodboard).set({
      status: "in_progress",
      renderStatus: "pending",
      promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION,
      sourceFingerprint: source.sourceFingerprint,
      campaignPlanJson,
      referencesJson: source.references,
      errorCode: null,
    }).where(eq(miraShootMoodboard.id, existing[0].id));
  }

  // The compiled campaign plan + prompts are the real, deterministic artifact.
  // This is what gates Preparation - it never requires an external provider.
  await db.update(miraShootMoodboard).set({ status: "complete" }).where(and(
    eq(miraShootMoodboard.shootId, params.shootId),
    eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
  ));

  try {
    const rendered = await Promise.all(source.references.map(async reference => {
      const image = await generateMoodboardImageViaOpenAI({ prompt: reference.prompt, quality: "medium" });
      return { ...reference, url: image.url ?? null };
    }));
    const allRendered = rendered.every(reference => Boolean(reference.url));
    await db.update(miraShootMoodboard).set({
      referencesJson: rendered,
      renderStatus: allRendered ? "complete" : "failed",
      errorCode: allRendered ? null : "moodboard_render_incomplete",
    }).where(and(
      eq(miraShootMoodboard.shootId, params.shootId),
      eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
    ));
  } catch (error) {
    await db.update(miraShootMoodboard).set({
      renderStatus: isImageProviderNotConfigured(error) ? "not_configured" : "failed",
      errorCode: isImageProviderNotConfigured(error) ? "image_provider_not_configured" : "moodboard_render_failed",
    }).where(and(
      eq(miraShootMoodboard.shootId, params.shootId),
      eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
    ));
  }

  const result = await db.select().from(miraShootMoodboard).where(and(
    eq(miraShootMoodboard.shootId, params.shootId),
    eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
  )).limit(1);
  return result[0] ?? null;
}
