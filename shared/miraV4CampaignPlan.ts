import { z } from "zod";

export const MIRA_V4_CAMPAIGN_PLAN_SCHEMA_VERSION = "1.0" as const;

const planText = z.string().trim().min(1).max(900);
const planToken = z.string().trim().min(1).max(200);
const planTokenList = z.array(planToken).min(1).max(24);

const campaignColourSchema = z
  .object({
    name: planToken,
    hex: z.string().regex(/^#[0-9a-f]{6}$/i),
    role: planText,
  })
  .strict();

const campaignSceneSchema = z
  .object({
    name: planText,
    narrativeRole: planText,
    subject: planText,
    environment: planText,
    styling: planText,
    lighting: planText,
    materialFocus: planText,
    composition: planText,
    movement: planText,
    mustInclude: planTokenList,
    avoid: planTokenList,
  })
  .strict();

export const miraV4CampaignPlanSchema = z
  .object({
    schemaVersion: z.literal(MIRA_V4_CAMPAIGN_PLAN_SCHEMA_VERSION),
    title: planText,
    creativeThesis: planText,
    emotionalArc: planText,
    campaignLanguage: z
      .object({
        colourPalette: z.array(campaignColourSchema).min(1).max(12),
        lighting: z
          .object({
            quality: planText,
            temperature: planText,
            contrast: planText,
            timeReference: planText,
          })
          .strict(),
        styling: planTokenList,
        wardrobe: planTokenList,
        architectureEnvironment: planTokenList,
        materialsTextures: planTokenList,
        composition: z
          .object({
            framing: planText,
            negativeSpace: planText,
            scale: planText,
            balance: planText,
            perspective: planText,
          })
          .strict(),
        cameraFeeling: planText,
      })
      .strict(),
    overallConsistencyRules: z
      .object({
        campaignGrammar: planText,
        continuityRules: planTokenList,
        mustInclude: planTokenList,
        avoid: planTokenList,
      })
      .strict(),
    scene_1: campaignSceneSchema,
    scene_2: campaignSceneSchema,
    scene_3: campaignSceneSchema,
    scene_4: campaignSceneSchema,
    scene_5: campaignSceneSchema,
  })
  .strict();

export type MiraV4CampaignPlan = z.infer<typeof miraV4CampaignPlanSchema>;
