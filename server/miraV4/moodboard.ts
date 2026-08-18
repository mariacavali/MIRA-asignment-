import { createHash } from "node:crypto";
import type { MiraV4CampaignPlan } from "../../shared/miraV4CampaignPlan";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";
import { compileCampaignPlanAndPrompt } from "./campaignCompiler";
import {
  MARIA_VISUAL_PROMPT_VERSION,
  applyTemporaryMariaVisualStylePlaceholder,
  compileMariaVisualDirection,
} from "./mariaVisualStyle";

export const MIRA_V4_VISUAL_PROMPT_VERSION = `v3-${MARIA_VISUAL_PROMPT_VERSION}`;

export type MiraV4VisualReferenceDraft = {
  id: string;
  direction: string;
  prompt: string;
};

export type MiraV4SelectedVisualReference = {
  id: string;
  url: string;
  direction: string;
  prompt: string;
};

export type MiraV4FinalMoodboardDraft = MiraV4VisualReferenceDraft & {
  shotNumber: number;
};

const visualDirections = [
  ["material intimacy", "a tactile close study led by material, detail, and considered negative space"],
  ["architectural calm", "a spatial editorial world led by architecture, light, and atmospheric restraint"],
  ["human presence", "an understated human gesture carrying the campaign's emotional posture"],
  ["editorial contrast", "a deliberate balance of softness and structure with high visual clarity"],
  ["quiet symbolism", "a symbolic still-life direction drawn from the campaign's materials and emotional arc"],
] as const;

function campaignLanguage(plan: MiraV4CampaignPlan) {
  const palette = plan.campaignLanguage.colourPalette
    .map(colour => `${colour.name} (${colour.hex})`)
    .join(", ");
  const lighting = plan.campaignLanguage.lighting;
  const composition = plan.campaignLanguage.composition;
  return [
    `CAMPAIGN TITLE: ${plan.title}.`,
    `SHORT CREATIVE DIRECTION: ${plan.creativeThesis}.`,
    `STYLING DIRECTION: ${plan.campaignLanguage.styling.join(", ")}; wardrobe: ${plan.campaignLanguage.wardrobe.join(", ")}.`,
    `LIGHTING DIRECTION: ${lighting.quality}; ${lighting.temperature}; ${lighting.contrast}; ${lighting.timeReference}.`,
    `COLOUR PALETTE: ${palette}.`,
    `COMPOSITION: framing ${composition.framing}; negative space ${composition.negativeSpace}; scale ${composition.scale}; balance ${composition.balance}; perspective ${composition.perspective}.`,
    `LOCATION / ENVIRONMENT: ${plan.campaignLanguage.architectureEnvironment.join(", ")}.`,
    `CONTINUITY RULES: ${plan.overallConsistencyRules.continuityRules.join(", ")}.`,
    `MUST INCLUDE: ${plan.overallConsistencyRules.mustInclude.join(", ")}.`,
    `AVOID: ${plan.overallConsistencyRules.avoid.join(", ")}.`,
  ];
}

export function compileMiraV4VisualSource(creativeDna: MiraV4CreativeDna) {
  const { campaignPlan, compositeImagePrompt } = compileCampaignPlanAndPrompt(creativeDna);
  const references: MiraV4VisualReferenceDraft[] = visualDirections.map(([id, focus]) => ({
    id,
    direction: id,
    prompt: [
      "Create one single editorial visual-direction reference image.",
      "This is a bounded exploration within one approved campaign world, not a generic moodboard and not a final customer deliverable.",
      "Return image only: no text, letters, typography, logos, captions, borders, or watermarks.",
      `DIRECTION: ${focus}.`,
      "Use the following approved campaign language as the only source of visual evidence:",
      compositeImagePrompt,
    ].join("\n"),
  }));
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify({ creativeDna, promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION }))
    .digest("hex");
  return { campaignPlan, compositeImagePrompt, references, sourceFingerprint };
}

export function fingerprintMiraV4RefinedVisualSet(params: {
  sourceFingerprint: string;
  referenceId: string;
  reasons: string[];
  note: string | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify({ stage: "refined", ...params, promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION }))
    .digest("hex");
}

export function fingerprintMiraV4FinalMoodboard(params: {
  sourceFingerprint: string;
  refinedSourceFingerprint: string;
  referenceId: string;
  preserve: string;
  avoid: string;
  note: string | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify({ stage: "moodboard", ...params, promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION }))
    .digest("hex");
}

export function buildRefinedVisualPrompts(params: {
  campaignPlan: MiraV4CampaignPlan;
  compositeImagePrompt: string;
  selected: MiraV4SelectedVisualReference;
  selection: { reasons: string[]; note: string | null };
}) {
  return visualDirections.map(([id, focus]) => ({
    id,
    direction: id,
    prompt: [
      "Create one refined editorial visual-direction reference image.",
      "Use the one supplied selected visual reference as the primary compositional and visual-language evidence.",
      "This is the one focused refinement round only; preserve the campaign world rather than changing its direction.",
      "Return image only: no text, letters, typography, logos, captions, borders, or watermarks.",
      `SELECTED DIRECTION: ${params.selected.direction}.`,
      params.selection.reasons.length ? `WHAT RESONATED: ${params.selection.reasons.join("; ")}.` : "",
      params.selection.note ? `ADDITIONAL RESPONSE: ${params.selection.note}.` : "",
      ...campaignLanguage(params.campaignPlan),
      `REFINED EXPLORATION: ${focus}.`,
      params.compositeImagePrompt,
    ].filter(Boolean).join("\n"),
  }));
}

export function buildFinalMoodboardPrompts(params: {
  creativeDna: MiraV4CreativeDna;
  campaignPlan: MiraV4CampaignPlan;
  compositeImagePrompt: string;
  selected: MiraV4SelectedVisualReference;
  refinement: { preserve: string; avoid: string; note: string | null };
}): MiraV4FinalMoodboardDraft[] {
  const mariaDirection = compileMariaVisualDirection({
    creativeDna: params.creativeDna,
    campaignPlan: params.campaignPlan,
  });
  const scenes = [
    params.campaignPlan.scene_1,
    params.campaignPlan.scene_2,
    params.campaignPlan.scene_3,
    params.campaignPlan.scene_4,
    params.campaignPlan.scene_5,
  ];

  return scenes.map((scene, index) => ({
    id: `scene_${index + 1}`,
    direction: scene.name,
    shotNumber: index + 1,
    prompt: applyTemporaryMariaVisualStylePlaceholder({
      direction: mariaDirection,
      sceneIndex: index,
      prompt: [
      `Create image ${index + 1} of 5 for one final premium editorial Moodboard campaign deliverable.`,
      "This is one coherent campaign world with four companion images, not five unrelated references and not a generic collage.",
      "Use the one supplied selected refined visual reference as primary composition and visual-language evidence. The Campaign Plan is the continuity authority.",
      "Return image only: no text, letters, typography, logos, captions, borders, or watermarks.",
      `SELECTED REFINED DIRECTION: ${params.selected.direction}.`,
      `PRESERVE: ${params.refinement.preserve}.`,
      `AVOID: ${params.refinement.avoid}.`,
      params.refinement.note ? `ADDITIONAL FINAL DIRECTION: ${params.refinement.note}.` : "",
      ...campaignLanguage(params.campaignPlan),
      `SHOT ${index + 1}: ${scene.name}.`,
      `NARRATIVE ROLE: ${scene.narrativeRole}.`,
      `SUBJECT: ${scene.subject}.`,
      `SCENE ENVIRONMENT: ${scene.environment}.`,
      `SCENE STYLING: ${scene.styling}.`,
      `SCENE LIGHTING: ${scene.lighting}.`,
      `MATERIAL FOCUS: ${scene.materialFocus}.`,
      `SCENE COMPOSITION: ${scene.composition}.`,
      `MOVEMENT: ${scene.movement}.`,
      `SCENE MUST INCLUDE: ${scene.mustInclude.join(", ")}.`,
      `SCENE AVOID: ${scene.avoid.join(", ")}.`,
      params.compositeImagePrompt,
      ].filter(Boolean).join("\n"),
    }),
  }));
}

/** @deprecated Use buildFinalMoodboardPrompts to generate the full five-image deliverable. */
export function buildFinalMoodboardPrompt(params: {
  creativeDna: MiraV4CreativeDna;
  campaignPlan: MiraV4CampaignPlan;
  compositeImagePrompt: string;
  selected: MiraV4SelectedVisualReference;
  refinement: { preserve: string; avoid: string; note: string | null };
}) {
  return buildFinalMoodboardPrompts(params)[0].prompt;
}
