import {
  miraV4CampaignPlanSchema,
  MIRA_V4_CAMPAIGN_PLAN_SCHEMA_VERSION,
  type MiraV4CampaignPlan,
} from "../../shared/miraV4CampaignPlan";
import { miraV4CreativeDnaSchema, type MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

const fallback = "the approved creative language";

function uniqueTokens(values: string[], fallbackValue = fallback): string[] {
  const tokens = Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
  return tokens.length > 0 ? tokens : [fallbackValue];
}

function joined(values: string[], fallbackValue = fallback): string {
  return uniqueTokens(values, fallbackValue).join(", ");
}

function first(values: string[], fallbackValue = fallback): string {
  return uniqueTokens(values, fallbackValue)[0] ?? fallbackValue;
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, "");
}

function toCampaignLanguage(creativeDna: MiraV4CreativeDna): MiraV4CampaignPlan["campaignLanguage"] {
  return {
    colourPalette: creativeDna.visualWorld.colourWorld.colours,
    lighting: creativeDna.visualWorld.light,
    styling: uniqueTokens(creativeDna.creativeDirection.stylingDirection),
    wardrobe: uniqueTokens(creativeDna.implementationHints.wardrobePriority),
    architectureEnvironment: uniqueTokens([
      ...creativeDna.visualWorld.architecture,
      ...creativeDna.creativeDirection.locationDirection,
      ...creativeDna.implementationHints.locationPriority,
    ]),
    materialsTextures: uniqueTokens([
      ...creativeDna.visualWorld.materials,
      ...creativeDna.visualWorld.textures,
      ...creativeDna.implementationHints.propsPriority,
    ]),
    composition: creativeDna.visualWorld.composition,
    cameraFeeling: `${joined(creativeDna.creativeDirection.photographyDirection)}; ${creativeDna.visualWorld.composition.perspective}`,
  };
}

function toScene(
  name: string,
  narrativeRole: string,
  subject: string,
  creativeDna: MiraV4CreativeDna,
  overrides: Partial<Pick<MiraV4CampaignPlan["scene_1"], "environment" | "styling" | "materialFocus" | "composition" | "movement">> = {},
): MiraV4CampaignPlan["scene_1"] {
  const campaignLanguage = toCampaignLanguage(creativeDna);
  return {
    name,
    narrativeRole,
    subject,
    environment: overrides.environment ?? joined(campaignLanguage.architectureEnvironment),
    styling: overrides.styling ?? joined([...campaignLanguage.styling, ...campaignLanguage.wardrobe]),
    lighting: `${campaignLanguage.lighting.quality}; ${campaignLanguage.lighting.temperature}; ${campaignLanguage.lighting.contrast}; ${campaignLanguage.lighting.timeReference}`,
    materialFocus: overrides.materialFocus ?? joined(campaignLanguage.materialsTextures),
    composition:
      overrides.composition ??
      `${campaignLanguage.composition.framing}; ${campaignLanguage.composition.negativeSpace}; ${campaignLanguage.composition.balance}`,
    movement: overrides.movement ?? joined(creativeDna.visualWorld.movement),
    mustInclude: uniqueTokens(creativeDna.creativeDirection.creativeRules.mustInclude),
    avoid: uniqueTokens(creativeDna.creativeDirection.creativeRules.avoid),
  };
}

/**
 * Deterministically maps a validated Creative DNA record into the fixed five-scene
 * campaign grammar approved for Moodboard V1. It performs no network, provider,
 * database, storage, date, random, or model operation.
 */
export function compileCampaignPlan(input: MiraV4CreativeDna): MiraV4CampaignPlan {
  const creativeDna = miraV4CreativeDnaSchema.parse(input);
  const campaignLanguage = toCampaignLanguage(creativeDna);
  const continuityRules = uniqueTokens([
    `Hold ${creativeDna.visualWorld.overallLanguage} across all five scenes`,
    `Keep the palette to ${campaignLanguage.colourPalette.map(colour => colour.name).join(", ")}`,
    `Use ${campaignLanguage.lighting.quality.toLowerCase()} in every scene`,
    `Maintain ${campaignLanguage.composition.negativeSpace.toLowerCase()}`,
    `Preserve the campaign atmosphere: ${joined(creativeDna.creativeEssence.atmosphere)}`,
  ]);

  const plan: MiraV4CampaignPlan = {
    schemaVersion: MIRA_V4_CAMPAIGN_PLAN_SCHEMA_VERSION,
    title: creativeDna.identity.becomingIdentity,
    creativeThesis: creativeDna.creativeDirection.creativeSummary,
    emotionalArc: `Open with ${withoutTerminalPunctuation(creativeDna.visualWorld.overallLanguage)}. Hold ${withoutTerminalPunctuation(creativeDna.creativeEssence.emotionalSignature)}. Resolve toward ${withoutTerminalPunctuation(creativeDna.creativeEssence.desiredImpact)}.`,
    campaignLanguage,
    overallConsistencyRules: {
      campaignGrammar: `${creativeDna.creativeDirection.overallDirection} ${creativeDna.visualWorld.overallLanguage}`,
      continuityRules,
      mustInclude: uniqueTokens(creativeDna.creativeDirection.creativeRules.mustInclude),
      avoid: uniqueTokens(creativeDna.creativeDirection.creativeRules.avoid),
    },
    scene_1: toScene(
      "The world opens",
      "Establish the complete campaign world before introducing a human subject.",
      creativeDna.visualWorld.overallLanguage,
      creativeDna,
      { movement: "Stillness establishes the campaign rhythm" },
    ),
    scene_2: toScene(
      "The human presence",
      "Make the identity visible through one understated human gesture and tonal styling.",
      creativeDna.identity.brandRole,
      creativeDna,
      { movement: first(creativeDna.visualWorld.movement, "A measured, observed gesture") },
    ),
    scene_3: toScene(
      "Material intelligence",
      "Use a close detail to make the visual world tactile rather than decorative.",
      joined([...creativeDna.visualWorld.materials, ...creativeDna.visualWorld.textures]),
      creativeDna,
      {
        composition: "Close editorial material study with intentional negative space",
        movement: "Quiet still life; no illustrative symbolism",
      },
    ),
    scene_4: toScene(
      "Architectural pause",
      "Create a breath of place that reinforces the same environment and emotional pace.",
      joined(creativeDna.visualWorld.architecture),
      creativeDna,
      {
        styling: "No additional styling layer; let architecture and material restraint lead",
        movement: "An unhurried pause in the same campaign world",
      },
    ),
    scene_5: toScene(
      "Closing continuity",
      "Resolve the campaign with a final human or spatial gesture that returns to the opening world.",
      creativeDna.identity.becomingIdentity,
      creativeDna,
      { movement: `A quiet closing gesture that carries ${creativeDna.creativeEssence.desiredImpact}` },
    ),
  };

  return miraV4CampaignPlanSchema.parse(plan);
}

function scenePrompt(index: number, scene: MiraV4CampaignPlan["scene_1"]): string {
  return [
    `SCENE ${index} — ${scene.name.toUpperCase()}`,
    `Role: ${scene.narrativeRole}`,
    `Subject: ${scene.subject}`,
    `Environment: ${scene.environment}`,
    `Styling: ${scene.styling}`,
    `Lighting: ${scene.lighting}`,
    `Materials: ${scene.materialFocus}`,
    `Composition: ${scene.composition}`,
    `Movement: ${scene.movement}`,
    `Must include: ${scene.mustInclude.join(", ")}`,
    `Avoid: ${scene.avoid.join(", ")}`,
  ].join("\n");
}

/**
 * Serializes a validated Campaign Plan into the single composite-image prompt for
 * the later approved image request. This is text-only and intentionally never
 * calls an image or language provider.
 */
export function buildCompositeImagePrompt(input: MiraV4CampaignPlan): string {
  const plan = miraV4CampaignPlanSchema.parse(input);
  const palette = plan.campaignLanguage.colourPalette
    .map(colour => `${colour.name} (${colour.hex}; ${colour.role})`)
    .join(", ");

  return [
    "Create ONE single portrait editorial campaign composite image with five connected visual moments.",
    "This is one coherent visual world, not five unrelated references or a generic moodboard.",
    "Return image only: do not render text, letters, names, typography, logos, numbers, captions, borders, or watermarks inside the image.",
    "",
    `CAMPAIGN TITLE: ${plan.title}`,
    `CREATIVE THESIS: ${plan.creativeThesis}`,
    `EMOTIONAL ARC: ${plan.emotionalArc}`,
    "",
    "LOCKED CAMPAIGN LANGUAGE",
    `Colour palette: ${palette}`,
    `Lighting: ${plan.campaignLanguage.lighting.quality}; ${plan.campaignLanguage.lighting.temperature}; ${plan.campaignLanguage.lighting.contrast}; ${plan.campaignLanguage.lighting.timeReference}`,
    `Styling: ${plan.campaignLanguage.styling.join(", ")}`,
    `Wardrobe: ${plan.campaignLanguage.wardrobe.join(", ")}`,
    `Architecture/environment: ${plan.campaignLanguage.architectureEnvironment.join(", ")}`,
    `Materials/textures: ${plan.campaignLanguage.materialsTextures.join(", ")}`,
    `Composition: ${plan.campaignLanguage.composition.framing}; ${plan.campaignLanguage.composition.negativeSpace}; ${plan.campaignLanguage.composition.scale}; ${plan.campaignLanguage.composition.balance}; ${plan.campaignLanguage.composition.perspective}`,
    `Camera feeling: ${plan.campaignLanguage.cameraFeeling}`,
    "",
    "OVERALL CONSISTENCY RULES",
    plan.overallConsistencyRules.campaignGrammar,
    ...plan.overallConsistencyRules.continuityRules.map(rule => `- ${rule}`),
    `Across every scene, include: ${plan.overallConsistencyRules.mustInclude.join(", ")}`,
    `Across every scene, avoid: ${plan.overallConsistencyRules.avoid.join(", ")}`,
    "",
    scenePrompt(1, plan.scene_1),
    "",
    scenePrompt(2, plan.scene_2),
    "",
    scenePrompt(3, plan.scene_3),
    "",
    scenePrompt(4, plan.scene_4),
    "",
    scenePrompt(5, plan.scene_5),
    "",
    "Layout: one vertical editorial campaign composite with a clear opening world and four supporting moments. Maintain visual continuity in colour, styling, lighting, environment, material treatment, composition, and emotional atmosphere.",
  ].join("\n");
}

export function compileCampaignPlanAndPrompt(input: MiraV4CreativeDna): {
  campaignPlan: MiraV4CampaignPlan;
  compositeImagePrompt: string;
} {
  const campaignPlan = compileCampaignPlan(input);
  return { campaignPlan, compositeImagePrompt: buildCompositeImagePrompt(campaignPlan) };
}
