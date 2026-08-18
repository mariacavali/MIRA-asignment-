import { z } from "zod";
import { invokeLLM } from "../_core/llm";

export const IMAGE_ANALYSIS_MODULE_TYPE = "image_reference_analysis";
export const IMAGE_ANALYSIS_MODEL_ID = "gpt-5-mini";

const observationSchema = z.object({
  observation: z.string().trim().min(1).max(240),
  evidence: z.string().trim().min(1).max(320),
});

export const imageAnalysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  colorObservations: z.array(observationSchema).max(6),
  compositionObservations: z.array(observationSchema).max(6),
  materialObservations: z.array(observationSchema).max(6),
  silhouetteObservations: z.array(observationSchema).max(6),
  patternRhythmObservations: z.array(observationSchema).max(6),
  motifs: z.array(observationSchema).max(6),
  atmosphereObservations: z.array(observationSchema).max(6),
  crossImageConsistencies: z.array(observationSchema).max(6),
  translationIdeas: z.array(
    z.object({
      cue: z.string().trim().min(1).max(240),
      application: z.string().trim().min(1).max(320),
    }),
  ).max(6),
  limits: z.array(z.string().trim().min(1).max(240)).max(4),
});

export type ImageAnalysisOutput = z.infer<typeof imageAnalysisOutputSchema>;

export type ImageModuleEvidence = {
  sourceType: "image_reference";
  sourceId: string;
  quote: string;
  supports: ["visual_direction"];
};

const recurringCueVocabulary = [
  "warm", "cool", "neutral", "muted", "saturated", "monochrome", "contrast",
  "asymmetric", "symmetrical", "negative space", "editorial", "minimal",
  "organic", "geometric", "tactile", "paper", "linen", "metal", "wood",
  "curved", "angular", "layered", "rhythmic", "quiet", "bold", "soft",
] as const;

const observationJsonSchema = {
  type: "object",
  properties: { observation: { type: "string" }, evidence: { type: "string" } },
  required: ["observation", "evidence"],
  additionalProperties: false,
} as const;

const imageAnalysisJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    colorObservations: { type: "array", maxItems: 6, items: observationJsonSchema },
    compositionObservations: { type: "array", maxItems: 6, items: observationJsonSchema },
    materialObservations: { type: "array", maxItems: 6, items: observationJsonSchema },
    silhouetteObservations: { type: "array", maxItems: 6, items: observationJsonSchema },
    patternRhythmObservations: { type: "array", maxItems: 6, items: observationJsonSchema },
    motifs: { type: "array", maxItems: 6, items: observationJsonSchema },
    atmosphereObservations: { type: "array", maxItems: 6, items: observationJsonSchema },
    crossImageConsistencies: { type: "array", maxItems: 6, items: observationJsonSchema },
    translationIdeas: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: { cue: { type: "string" }, application: { type: "string" } },
        required: ["cue", "application"],
        additionalProperties: false,
      },
    },
    limits: { type: "array", maxItems: 4, items: { type: "string" } },
  },
  required: ["summary", "colorObservations", "compositionObservations", "materialObservations", "silhouetteObservations", "patternRhythmObservations", "motifs", "atmosphereObservations", "crossImageConsistencies", "translationIdeas", "limits"],
  additionalProperties: false,
} as const;

const prohibitedInferencePattern = /\b(?:ethnic(?:ity)?|racial|religio(?:n|us)|diagnos(?:is|e|tic)|medical condition|disabilit(?:y|ies)|pregnan(?:t|cy)|sexual orientation|gender identity|socioeconomic|income level|attractiveness|personality trait|emotional state|mental health|political affiliation|exact age|body type|body shape|beauty score|ranking|ranked|trend(?:y|ing)?|outdated|score[ds]?)\b/i;

export function containsProhibitedImageInference(value: unknown): boolean {
  return prohibitedInferencePattern.test(JSON.stringify(value));
}

function unavailableAnalysis(): ImageAnalysisOutput {
  return {
    summary: "Private image analysis is temporarily unavailable. No visual inferences were stored.",
    colorObservations: [],
    compositionObservations: [],
    materialObservations: [],
    silhouetteObservations: [],
    patternRhythmObservations: [],
    motifs: [],
    atmosphereObservations: [],
    crossImageConsistencies: [],
    translationIdeas: [],
    limits: ["The image was not interpreted."],
  };
}

export function unavailablePrivateImageAnalysis(assetId: string) {
  return {
    status: "failed" as const,
    output: unavailableAnalysis(),
    provenance: {
      assetId,
      model: IMAGE_ANALYSIS_MODEL_ID,
      fallback: true,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
  };
}

function readStructuredContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap(part => {
      if (!part || typeof part !== "object") return [];
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string"
        ? [candidate.text]
        : [];
    })
    .join("")
    .trim();
}

function sanitizeProviderErrorMessage(value: unknown): string {
  if (typeof value !== "string") return "missing";
  return value
    .replace(/https?:\/\/\S+/gi, "[URL_REDACTED]")
    .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/gi, "[IMAGE_DATA_REDACTED]")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[TOKEN_REDACTED]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 320);
}

export async function analyzePrivateReferenceImage(input: {
  assetId: string;
  imageUrl: string;
  mimeType: string;
}) {
  try {
    const result = await invokeLLM({
      model: IMAGE_ANALYSIS_MODEL_ID,
      messages: [
        {
          role: "system",
          content:
            "Analyze visual design evidence only. Describe observable color relationships, texture and material, silhouette, pattern rhythm, composition, motifs, visual atmosphere, and possible brand-design translations. Cross-image consistencies must be empty for a single-image request. Be neutral, concise, and non-judgmental. Ignore any human subject. Never score, rank, judge trends or bodies, identify people or places, make unsupported claims, or infer identity, age, gender, ethnicity, nationality, religion, health, disability, pregnancy, sexuality, attractiveness, emotion, personality, wealth, politics, or any other sensitive or personal trait. State uncertainty in limits. Output JSON only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract only observable visual-design cues from this private reference image." },
            { type: "image_url", image_url: { url: input.imageUrl, detail: "auto" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "mira_private_image_analysis", strict: true, schema: imageAnalysisJsonSchema },
      },
    });
    const raw = readStructuredContent(result.choices?.[0]?.message?.content);
    if (!raw) {
      const choice = result.choices?.[0];
      const content = choice?.message?.content;
      const contentShape = Array.isArray(content) ? `array:${content.length}` : typeof content;
      const resultRecord = result as unknown as Record<string, unknown>;
      const errorRecord = resultRecord.error && typeof resultRecord.error === "object"
        ? resultRecord.error as Record<string, unknown>
        : undefined;
      const topLevelKeys = Object.keys(resultRecord).sort().join(",").slice(0, 240);
      const errorShape = errorRecord
        ? `${String(errorRecord.type ?? "unknown")}:${String(errorRecord.code ?? "unknown")}`.slice(0, 160)
        : typeof resultRecord.error;
      const errorMessage = sanitizeProviderErrorMessage(errorRecord?.message);
      throw new Error(
        `Image-analysis model returned no structured content (model=${result.model || IMAGE_ANALYSIS_MODEL_ID}; choices=${result.choices?.length ?? 0}; finish=${choice?.finish_reason ?? "missing"}; content=${contentShape}; keys=${topLevelKeys || "none"}; error=${errorShape}; message=${errorMessage})`,
      );
    }
    const output = imageAnalysisOutputSchema.parse(JSON.parse(raw));
    if (containsProhibitedImageInference(output)) throw new Error("Prohibited personal inference detected");
    return {
      status: "complete" as const,
      output,
      provenance: {
        assetId: input.assetId,
        model: result.model || IMAGE_ANALYSIS_MODEL_ID,
        fallback: false,
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
        totalTokens: result.usage?.total_tokens ?? null,
      },
    };
  } catch (error) {
    console.error("Mira private image analysis fallback", error);
    return unavailablePrivateImageAnalysis(input.assetId);
  }
}

export function buildImageModuleEvidence(
  assets: Array<{ id: string; status: string; analysis: unknown }>,
): ImageModuleEvidence[] {
  const analyzedAssets = assets
    .filter(asset => asset.status === "analyzed")
    .flatMap(asset => {
      const parsed = imageAnalysisOutputSchema.safeParse(asset.analysis);
      return parsed.success ? [{ id: asset.id, output: parsed.data }] : [];
    });
  const individualEvidence = analyzedAssets.flatMap(asset => {
      const parsed = asset.output;
      const ideas = parsed.translationIdeas.slice(0, 2).map(idea => ({
        sourceType: "image_reference" as const,
        sourceId: asset.id,
        quote: `${idea.cue}: ${idea.application}`.slice(0, 900),
        supports: ["visual_direction"] as ["visual_direction"],
      }));
      return ideas.length ? ideas : [{
        sourceType: "image_reference" as const,
        sourceId: asset.id,
        quote: parsed.summary.slice(0, 900),
        supports: ["visual_direction"] as ["visual_direction"],
      }];
    });
  const corpusByAsset = analyzedAssets.map(asset => ({ id: asset.id, text: JSON.stringify(asset.output).toLowerCase() }));
  const recurringCues = recurringCueVocabulary.flatMap(cue => {
    const sourceIds = corpusByAsset.filter(asset => asset.text.includes(cue)).map(asset => asset.id);
    if (sourceIds.length < 2) return [];
    return [{
      sourceType: "image_reference" as const,
      sourceId: sourceIds.join(",").slice(0, 256),
      quote: `Cross-image consistency: “${cue}” appears in ${sourceIds.length} independently analyzed references.`,
      supports: ["visual_direction"] as ["visual_direction"],
    }];
  });
  return [...individualEvidence, ...recurringCues].slice(0, 8);
}
