import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { miraShootMoodboard } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { createLocalPlaceholderImage } from "../_core/imageGeneration";
import { getDb } from "../db";
import { isLocalFileStoreEnabled } from "../localFileStore";
import { generateMoodboardImageViaOpenAI } from "./openAiMoodboardImage";
import { compileCampaignPlanAndPrompt } from "../miraV4/campaignCompiler";
import { buildFinalMoodboardPrompts, type MiraV4SelectedVisualReference } from "../miraV4/moodboard";
import { miraV4CreativeDnaSchema, type MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function isImageProviderNotConfigured(error: unknown) {
  return error instanceof Error && /OPENAI_API_KEY is not configured/.test(error.message);
}

// Defensive normalization boundary, mirroring normalizeShootMemorySnapshot in
// creativeDnaAdapter.ts: some MariaDB driver/connection configurations
// return a JSON column's value as a raw string rather than an already-parsed
// object, even though Drizzle's `.$type<MiraV4CreativeDna>()` declares
// mira_shoot_creative_dna.creativeDnaJson as always-parsed at the type
// level. Passing a raw string straight into compileCampaignPlanAndPrompt
// throws a root-level ZodError ("expected object", path []) before any
// moodboard prompt can be built, so every caller must go through this
// normalizer first. A string is parsed and then validated against the same
// authoritative, strict Creative DNA schema the rest of the app already
// uses (miraV4CreativeDnaSchema) - malformed JSON, primitives, arrays, and
// non-conforming objects are all rejected with a clear error rather than
// silently compiled anyway. The persisted content and the schema itself are
// never changed here.
export function normalizeCreativeDnaInput(value: unknown): MiraV4CreativeDna {
  let candidate: unknown = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      throw new Error("Persisted Creative DNA is not valid JSON");
    }
  }
  const parsed = miraV4CreativeDnaSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("Persisted Creative DNA does not match the expected Creative DNA shape");
  }
  return parsed.data;
}

// Distinct from MIRA_V4_VISUAL_PROMPT_VERSION (moodboard.ts's own versioning
// for the five-exploration-direction round) - this identifies the shoot
// pipeline's own strategy of skipping the interactive select/refine round
// and going straight to one coherent five-scene campaign deliverable.
export const MIRA_CORE_MOODBOARD_PROMPT_VERSION = "shoot-coherent-v1";

// The Shoot Room has no UI for the V4 pipeline's interactive select/refine
// round (a deliberate, documented scope choice - see the module doc below),
// so this synthesizes the one input buildFinalMoodboardPrompts actually
// reads from its "selected" and "refinement" parameters: a short direction
// label (from the campaign's own confirmed title) and default continuity
// rules. No exploration image, human choice, or refinement text is
// fabricated - the campaign plan itself, compiled deterministically from the
// confirmed Creative DNA, is the sole authority for what gets built.
function buildAutoSelectedDirection(compositeImagePrompt: string, campaignTitle: string): MiraV4SelectedVisualReference {
  return { id: "auto_selected_primary_direction", url: "", direction: campaignTitle, prompt: compositeImagePrompt };
}

/**
 * Wires the existing V4 moodboard compiler's *coherent five-scene* campaign
 * deliverable (buildFinalMoodboardPrompts) to a confirmed shoot's Creative
 * DNA, producing one moodboard direction with five continuity-linked images
 * rather than five unrelated exploration directions.
 *
 * The deterministic part (compiling the campaign plan and the five scene
 * prompts) never calls an external provider and cannot fail once Creative
 * DNA is schema-valid. Actual pixel rendering calls OpenAI's Images API
 * directly (OPENAI_API_KEY) and is tracked separately via renderStatus so a
 * missing/unavailable image provider never blocks the shoot from reaching
 * Preparation. When no OPENAI_API_KEY is configured, this renders five real,
 * deterministically-generated local placeholder images instead of silently
 * producing nothing - reusing the exact same local placeholder renderer the
 * V4/Level2Create pipeline already uses for its own local development mode -
 * so the moodboard gallery always has something real and persisted to show
 * without ever calling a paid image API.
 */
export async function generateShootMoodboardForCreativeDna(params: {
  shootId: number;
  photographerUserId: number;
  confirmedMemoryVersion: number;
  // Declared `unknown`, not the column's nominal MiraV4CreativeDna type,
  // precisely because the raw driver value cannot be trusted to already be
  // an object - see normalizeCreativeDnaInput above.
  creativeDna: unknown;
}) {
  const db = await requireDb();
  const existing = await db.select().from(miraShootMoodboard).where(and(
    eq(miraShootMoodboard.shootId, params.shootId),
    eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
  )).limit(1);
  if (existing[0]?.status === "complete") return existing[0];

  const creativeDna = normalizeCreativeDnaInput(params.creativeDna);
  const { campaignPlan, compositeImagePrompt } = compileCampaignPlanAndPrompt(creativeDna);
  const selected = buildAutoSelectedDirection(compositeImagePrompt, campaignPlan.title);
  const refinement = {
    preserve: "the confirmed campaign world, palette, lighting, and continuity rules",
    avoid: "generic stock styling or any change of direction from the confirmed Creative DNA",
    note: null,
  };
  const prompts = buildFinalMoodboardPrompts({ creativeDna, campaignPlan, compositeImagePrompt, selected, refinement });
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify({ creativeDna, promptVersion: MIRA_CORE_MOODBOARD_PROMPT_VERSION }))
    .digest("hex");
  const campaignPlanJson = campaignPlan as unknown as Record<string, unknown>;
  const references = prompts.map(prompt => ({ id: prompt.id, direction: prompt.direction, shotNumber: prompt.shotNumber, prompt: prompt.prompt }));

  if (!existing[0]) {
    await db.insert(miraShootMoodboard).values({
      shootId: params.shootId,
      photographerUserId: params.photographerUserId,
      confirmedMemoryVersion: params.confirmedMemoryVersion,
      promptVersion: MIRA_CORE_MOODBOARD_PROMPT_VERSION,
      sourceFingerprint,
      status: "in_progress",
      renderStatus: "pending",
      campaignPlanJson,
      referencesJson: references,
    });
  } else {
    await db.update(miraShootMoodboard).set({
      status: "in_progress",
      renderStatus: "pending",
      promptVersion: MIRA_CORE_MOODBOARD_PROMPT_VERSION,
      sourceFingerprint,
      campaignPlanJson,
      referencesJson: references,
      errorCode: null,
    }).where(eq(miraShootMoodboard.id, existing[0].id));
  }

  // The compiled campaign plan + five scene prompts are the real,
  // deterministic artifact. This is what gates Preparation - it never
  // requires an external provider.
  await db.update(miraShootMoodboard).set({ status: "complete" }).where(and(
    eq(miraShootMoodboard.shootId, params.shootId),
    eq(miraShootMoodboard.confirmedMemoryVersion, params.confirmedMemoryVersion),
  ));

  const usingDemoImages = !ENV.embeddingApiKey;
  try {
    const rendered = await Promise.all(prompts.map(async prompt => {
      const image = usingDemoImages
        ? await createLocalPlaceholderImage({ prompt: prompt.prompt, quality: "medium" })
        : await generateMoodboardImageViaOpenAI({ prompt: prompt.prompt, quality: "medium" });
      return { id: prompt.id, direction: prompt.direction, shotNumber: prompt.shotNumber, prompt: prompt.prompt, url: image.url ?? null };
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

export type ShootMoodboardImage = { id: string; direction: string; url: string };

// Same MariaDB JSON-column string/object boundary as normalizeCreativeDnaInput
// above, applied to mira_shoot_moodboard.referencesJson: the driver can
// return this column as a raw string instead of an already-parsed array, so
// an Array.isArray check alone silently discarded five valid, persisted
// scenes. There is no existing shared schema for this shape (unlike Creative
// DNA/ShootMemory), so this is the smallest local parse-and-validate
// boundary - only the fields mapCompletedMoodboardImages actually reads are
// required; other persisted fields (shotNumber, prompt, status, errorCode)
// are passed through untouched. Malformed JSON or a structure that doesn't
// match is treated the same as "no moodboard yet": an empty array, never a
// thrown error or an invented image.
const moodboardReferenceSchema = z
  .object({ id: z.string(), direction: z.string(), url: z.string().nullable().optional() })
  .passthrough();
const moodboardReferencesSchema = z.array(moodboardReferenceSchema);

// Shared by both visibility surfaces - the client Shoot Room
// (getShootRoomStatusForClient in db.ts) and the photographer dashboard
// (getShootMoodboardForOwner below) - so "what counts as a displayable
// moodboard image" is defined exactly once. Never renders a placeholder or
// partial image: only a "complete" moodboard with a real, rendered url
// counts, for either audience.
export function mapCompletedMoodboardImages(status: string, referencesJson: unknown): ShootMoodboardImage[] {
  if (status !== "complete") return [];
  let candidate: unknown = referencesJson;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }
  const parsed = moodboardReferencesSchema.safeParse(candidate);
  if (!parsed.success) return [];
  return parsed.data
    .filter((reference): reference is { id: string; direction: string; url: string } => Boolean(reference.url))
    .map(reference => ({ id: reference.id, direction: reference.direction, url: reference.url as string }));
}

// Photographer-dashboard read of the latest moodboard for a shoot they own.
// Mirrors getShootCreativeDnaForOwner's ownership-scoped, read-only shape.
export async function getShootMoodboardForOwner(photographerUserId: number, shootId: number): Promise<{ status: string; renderStatus: string; images: ShootMoodboardImage[] } | null> {
  if (isLocalFileStoreEnabled()) {
    const { findRecordingDemoShoot } = await import("../localFileStore");
    const { isRecordingDemoEnabled } = await import("./recordingDemo");
    const shoot = await findRecordingDemoShoot();
    if (shoot && shoot.id === shootId && shoot.photographerUserId === photographerUserId && isRecordingDemoEnabled() && shoot.roomState === "preparation_active") {
      const { buildRecordingDemoMoodboard } = await import("./recordingDemoAssets");
      return { status: "complete", renderStatus: "complete", images: buildRecordingDemoMoodboard(shoot.id) };
    }
    return null;
  }
  const db = await requireDb();
  const rows = await db.select().from(miraShootMoodboard).where(and(
    eq(miraShootMoodboard.photographerUserId, photographerUserId),
    eq(miraShootMoodboard.shootId, shootId),
  )).orderBy(desc(miraShootMoodboard.confirmedMemoryVersion)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { status: row.status, renderStatus: row.renderStatus, images: mapCompletedMoodboardImages(row.status, row.referencesJson) };
}
