import { z } from "zod";

export const MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION = "1.0" as const;
export const MIRA_V4_CREATIVE_DNA_PROMPT_VERSION = "creative-dna-v1" as const;

const conciseText = z.string().trim().min(1).max(600);
const tokenText = z.string().trim().min(1).max(160);
const tokenList = z.array(tokenText).max(16);

export const miraV4CreativeDnaSchema = z
  .object({
    schemaVersion: z.literal(MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION),
    identity: z
      .object({
        recognitionSummary: conciseText,
        brandRole: conciseText,
        coreValues: tokenList,
        coreTensions: tokenList,
        underrepresentedQuality: conciseText,
        becomingIdentity: conciseText,
        creativeBoundaries: tokenList,
      })
      .strict(),
    creativeEssence: z
      .object({
        philosophy: tokenList,
        ambition: tokenList,
        emotionalSignature: conciseText,
        desiredImpact: conciseText,
        energy: tokenList,
        atmosphere: tokenList,
        tempo: conciseText,
        contrast: tokenList,
      })
      .strict(),
    visualWorld: z
      .object({
        overallLanguage: conciseText,
        colourWorld: z
          .object({
            description: conciseText,
            colours: z
              .array(
                z
                  .object({
                    name: tokenText,
                    hex: z.string().regex(/^#[0-9a-f]{6}$/i),
                    role: conciseText,
                  })
                  .strict(),
              )
              .max(12),
          })
          .strict(),
        light: z
          .object({
            quality: conciseText,
            temperature: conciseText,
            contrast: conciseText,
            timeReference: conciseText,
          })
          .strict(),
        materials: tokenList,
        textures: tokenList,
        architecture: tokenList,
        nature: tokenList,
        movement: tokenList,
        composition: z
          .object({
            framing: conciseText,
            negativeSpace: conciseText,
            scale: conciseText,
            balance: conciseText,
            perspective: conciseText,
          })
          .strict(),
      })
      .strict(),
    creativeDirection: z
      .object({
        overallDirection: conciseText,
        photographyDirection: tokenList,
        stylingDirection: tokenList,
        locationDirection: tokenList,
        creativeRules: z
          .object({
            mustInclude: tokenList,
            avoid: tokenList,
          })
          .strict(),
        keywords: tokenList,
        creativeSummary: conciseText,
      })
      .strict(),
    implementationHints: z
      .object({
        shootType: conciseText,
        wardrobePriority: tokenList,
        lightingPriority: tokenList,
        locationPriority: tokenList,
        propsPriority: tokenList,
        practicalNotes: tokenList,
      })
      .strict(),
    renderTokens: z
      .object({
        palette: tokenList,
        materials: tokenList,
        architecture: tokenList,
        nature: tokenList,
        light: tokenList,
        composition: tokenList,
        fashion: tokenList,
        mood: tokenList,
        styleReferences: tokenList,
        avoid: tokenList,
      })
      .strict(),
    inspiration: z
      .object({
        imageReference: z.string().trim().min(1).max(1024).nullable(),
        userExplanation: z.string().trim().min(1).max(500).nullable(),
        influenceRule: z.literal("supporting_evidence_only"),
      })
      .strict(),
  })
  .strict();

export type MiraV4CreativeDna = z.infer<typeof miraV4CreativeDnaSchema>;

export const miraV4CreativeDnaJsonSchema = z.toJSONSchema(miraV4CreativeDnaSchema, {
  target: "draft-7",
});
