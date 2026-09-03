import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

export const MIRA_SHOOT_PREPARATION_BRIEF_SCHEMA_VERSION = "1.0" as const;

export type ShootPreparationBrief = {
  schemaVersion: typeof MIRA_SHOOT_PREPARATION_BRIEF_SCHEMA_VERSION;
  wardrobe: string[];
  deviceSetup: string[];
  locationNotes: string[];
  timingNotes: string[];
  generalTips: string[];
  avoid: string[];
};

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    result.push(item);
  }
  return result;
}

function formatScheduledAt(scheduledAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(scheduledAt);
  } catch {
    return scheduledAt.toISOString();
  }
}

/**
 * Deterministic, no network/model/random call - mirrors campaignCompiler.ts's
 * purity guarantee. Turns the already-persisted, schema-valid Creative DNA
 * plus shoot logistics into practical shoot-day guidance for the client's
 * "Ready to Shoot" section. Never invents facts the Creative DNA/shoot record
 * doesn't already contain.
 */
export function buildShootPreparationBrief(params: {
  creativeDna: MiraV4CreativeDna;
  shoot: {
    location: string | null;
    scheduledAt: Date | null;
    timezone: string;
  };
}): ShootPreparationBrief {
  const { creativeDna, shoot } = params;
  const hints = creativeDna.implementationHints;
  const light = creativeDna.visualWorld.light;

  const wardrobe = dedupe([
    ...hints.wardrobePriority,
    creativeDna.visualWorld.colourWorld.description,
  ]).slice(0, 8);

  const deviceSetup = dedupe([
    "Use your main (rear) camera rather than the front-facing camera for the sharpest result.",
    "Clean the lens before you start, and shoot in a quiet, stable space if this is a video call.",
    ...hints.lightingPriority,
  ]).slice(0, 8);

  const locationNotes = dedupe([
    ...(shoot.location ? [`Confirmed location: ${shoot.location}.`] : []),
    ...hints.locationPriority,
  ]).slice(0, 8);

  const timingNotes = dedupe([
    ...(shoot.scheduledAt ? [`Scheduled for ${formatScheduledAt(shoot.scheduledAt, shoot.timezone)}.`] : []),
    light.timeReference,
    light.quality,
  ]).slice(0, 6);

  const generalTips = dedupe([
    ...hints.practicalNotes,
    ...hints.propsPriority.map(prop => `Bring: ${prop}`),
  ]).slice(0, 8);

  const avoid = dedupe([
    ...creativeDna.creativeDirection.creativeRules.avoid,
    ...creativeDna.renderTokens.avoid,
  ]).slice(0, 8);

  return {
    schemaVersion: MIRA_SHOOT_PREPARATION_BRIEF_SCHEMA_VERSION,
    wardrobe,
    deviceSetup,
    locationNotes,
    timingNotes,
    generalTips,
    avoid,
  };
}
