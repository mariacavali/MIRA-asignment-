import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import type { RecognitionResult } from "./recognition";

const MODEL_ID = "gpt-5-mini";

function boundedStringArray(minItems: number, maxItems: number, maxLength: number) {
  return z.preprocess(
    value => (Array.isArray(value) ? value.slice(0, maxItems) : value),
    z.array(z.string().trim().min(1).max(maxLength)).min(minItems).max(maxItems)
  );
}

const mirrorSchema = z.object({
  whatHasAlwaysBeenTrue: z.string().trim().min(1).max(1600),
  thread: z.string().trim().min(1).max(900),
  whoThisIsFor: z.string().trim().min(1).max(1200),
  returningSentence: z.string().trim().min(1).max(240),
  recognition: z.string().trim().min(1).max(900),
});

const essenceSchema = z.object({
  coreTruth: z.string().trim().min(1).max(1200),
  naturalGift: z.string().trim().min(1).max(1200),
  feltExperience: z.string().trim().min(1).max(1200),
  peoplePortrait: z.string().trim().min(1).max(1200),
  direction: z.string().trim().min(1).max(1200),
  voiceQualities: boundedStringArray(3, 5, 120),
  currentChapter: z.string().trim().min(1).max(1200),
  strengths: boundedStringArray(3, 5, 220),
  zoneOfGenius: z.string().trim().min(1).max(1200),
  shadows: boundedStringArray(2, 4, 260),
  decisionCompass: z.string().trim().min(1).max(1200),
  naturalContribution: z.string().trim().min(1).max(1200),
  growthEdge: z.string().trim().min(1).max(1200),
});

const visualDirectionSchema = z.object({
  atmosphere: z.string().trim().min(1).max(900),
  colorIntentions: boundedStringArray(3, 5, 180),
  materialCues: boundedStringArray(3, 5, 180),
  compositionPrinciples: boundedStringArray(3, 5, 220),
  photographicDirection: z.string().trim().min(1).max(1000),
});

const evidenceSchema = z.object({
  turn: z.number().int().min(1).max(8),
  quote: z.string().trim().min(1).max(900),
  supports: boundedStringArray(1, 4, 120),
});

const moduleEvidenceSchema = z.object({
  sourceType: z.literal("image_reference"),
  sourceId: z.string().trim().min(1).max(256),
  quote: z.string().trim().min(1).max(900),
  supports: z.tuple([z.literal("visual_direction")]),
});

const generatedContentSchema = z.object({
  mirror: mirrorSchema,
  essence: essenceSchema,
  visualDirection: visualDirectionSchema,
  evidence: z.preprocess(
    value => (Array.isArray(value) ? value.slice(0, 8) : value),
    z.array(evidenceSchema).min(4).max(8)
  ),
  moduleEvidence: z.array(moduleEvidenceSchema).max(8).default([]),
});

export const reflectionBundleSchema = generatedContentSchema.extend({
  generation: z.object({
    model: z.string(),
    fallback: z.boolean(),
    promptTokens: z.number().int().nullable(),
    completionTokens: z.number().int().nullable(),
    totalTokens: z.number().int().nullable(),
  }),
});

export type ReflectionBundle = z.infer<typeof reflectionBundleSchema>;

export function canRetryReflectionBundle(revisionStatus: string | undefined, bundle: unknown): boolean {
  const parsed = reflectionBundleSchema.safeParse(bundle);
  return revisionStatus === "draft" && parsed.success && parsed.data.generation.fallback;
}

const generatedContentJsonSchema = {
  type: "object",
  properties: {
    mirror: {
      type: "object",
      properties: {
        whatHasAlwaysBeenTrue: { type: "string" },
        thread: { type: "string" },
        whoThisIsFor: { type: "string" },
        returningSentence: { type: "string" },
        recognition: { type: "string" },
      },
      required: ["whatHasAlwaysBeenTrue", "thread", "whoThisIsFor", "returningSentence", "recognition"],
      additionalProperties: false,
    },
    essence: {
      type: "object",
      properties: {
        coreTruth: { type: "string" },
        naturalGift: { type: "string" },
        feltExperience: { type: "string" },
        peoplePortrait: { type: "string" },
        direction: { type: "string" },
        voiceQualities: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
        currentChapter: { type: "string" },
        strengths: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
        zoneOfGenius: { type: "string" },
        shadows: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
        decisionCompass: { type: "string" },
        naturalContribution: { type: "string" },
        growthEdge: { type: "string" },
      },
      required: ["coreTruth", "naturalGift", "feltExperience", "peoplePortrait", "direction", "voiceQualities", "currentChapter", "strengths", "zoneOfGenius", "shadows", "decisionCompass", "naturalContribution", "growthEdge"],
      additionalProperties: false,
    },
    visualDirection: {
      type: "object",
      properties: {
        atmosphere: { type: "string" },
        colorIntentions: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
        materialCues: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
        compositionPrinciples: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
        photographicDirection: { type: "string" },
      },
      required: ["atmosphere", "colorIntentions", "materialCues", "compositionPrinciples", "photographicDirection"],
      additionalProperties: false,
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          turn: { type: "integer" },
          quote: { type: "string" },
          supports: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
        },
        required: ["turn", "quote", "supports"],
        additionalProperties: false,
      },
      minItems: 4,
      maxItems: 8,
    },
  },
  required: ["mirror", "essence", "visualDirection", "evidence"],
  additionalProperties: false,
} as const;

function compactQuote(value: string, maxWords = 28) {
  return value.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function fallbackContent(answers: string[]): z.infer<typeof generatedContentSchema> {
  const a = (index: number) => answers[index]?.trim() || answers[0]?.trim() || "";
  return {
    mirror: {
      whatHasAlwaysBeenTrue: a(0),
      thread: a(1),
      whoThisIsFor: a(4),
      returningSentence: compactQuote(a(0), 15),
      recognition: a(7),
    },
    essence: {
      coreTruth: a(0),
      naturalGift: a(1),
      feltExperience: a(3),
      peoplePortrait: a(4),
      direction: a(7),
      voiceQualities: [compactQuote(a(2), 8), compactQuote(a(3), 8), compactQuote(a(5), 8)],
      currentChapter: a(5),
      strengths: [compactQuote(a(0), 12), compactQuote(a(1), 12), compactQuote(a(4), 12)],
      zoneOfGenius: a(1),
      shadows: [compactQuote(a(2), 18), compactQuote(a(5), 18)],
      decisionCompass: a(6),
      naturalContribution: a(4),
      growthEdge: a(7),
    },
    visualDirection: {
      atmosphere: a(3),
      colorIntentions: [compactQuote(a(0), 8), compactQuote(a(3), 8), compactQuote(a(6), 8)],
      materialCues: [compactQuote(a(1), 8), compactQuote(a(2), 8), compactQuote(a(5), 8)],
      compositionPrinciples: [compactQuote(a(4), 10), compactQuote(a(6), 10), compactQuote(a(7), 10)],
      photographicDirection: a(6),
    },
    evidence: answers.slice(0, 8).map((answer, index) => ({
      turn: index + 1,
      quote: compactQuote(answer),
      supports: [index < 2 ? "mirror" : index < 5 ? "brand_soul" : "visual_direction"],
    })),
    moduleEvidence: [],
  };
}

function normalizeContent(content: z.infer<typeof generatedContentSchema>, answers: string[]) {
  const returningWords = content.mirror.returningSentence.trim().split(/\s+/);
  const evidence = content.evidence.map(item => {
    const source = answers[item.turn - 1] || "";
    const exact = source.toLocaleLowerCase().includes(item.quote.toLocaleLowerCase());
    return exact ? item : { ...item, quote: compactQuote(source) };
  });
  return {
    ...content,
    mirror: {
      ...content.mirror,
      returningSentence: returningWords.slice(0, 15).join(" "),
    },
    evidence,
  };
}

export function parseGeneratedContent(input: unknown) {
  return generatedContentSchema.parse(input);
}

export async function generateReflectionBundle(
  messages: Array<{ role: string; content: string }>,
  optionalEvidence: Array<z.infer<typeof moduleEvidenceSchema>> = [],
  recognition?: RecognitionResult,
) {
  const answers = messages.filter(message => message.role === "user").map(message => message.content.trim()).slice(0, 8);
  if (answers.length < 8) throw new Error("Eight completed answers are required");
  const transcript = answers.map((answer, index) => `TURN ${index + 1}: ${answer}`).join("\n\n");
  const normalizedOptionalEvidence = z.array(moduleEvidenceSchema).max(8).parse(optionalEvidence.slice(0, 8));
  const optionalEvidenceText = normalizedOptionalEvidence.length
    ? `\n\nOPTIONAL IMAGE-REFERENCE EVIDENCE (visual direction only):\n${normalizedOptionalEvidence.map(item => `[${item.sourceId}] ${item.quote}`).join("\n")}`
    : "";
  const recognitionBrief = recognition
    ? {
        throughline: recognition.throughline,
        supportedPatterns: recognition.supportedPatterns.map(pattern => ({
          id: pattern.id,
          statement: pattern.statement,
          confidence: pattern.confidence,
        })),
        tensionsToResolve: recognition.tensionsToResolve.map(tension => tension.statement),
        documentGuidance: recognition.documentGuidance,
        limits: recognition.limits,
      }
    : null;
  const recognitionText = recognitionBrief
    ? `\n\nFINAL RECOGNITION BRIEF (already compared across available evidence):\n${JSON.stringify(recognitionBrief)}`
    : "\n\nFINAL RECOGNITION BRIEF: unavailable; use only direct conversation and optional visual evidence.";

  try {
    const result = await invokeLLM({
      model: MODEL_ID,
      messages: [
        {
          role: "system",
          content:
            "You are Mira: a precise mirror, not a coach, strategist, teacher, therapist, assessment, or personality system. Create one complete Brand Soul synthesis backward from the person's exact words and the final Recognition brief. Evidence priority is strict: the person's answers first, repeated conversation patterns second, and hidden birth context third. Reveal a specific recurring truth and hidden coherence without diagnosing, flattering, teaching, using archetypes, inventing biography, or making unsupported claims. Treat Recognition patterns as constraints, not copy to repeat. Every conclusion must remain traceable to conversation evidence. Hidden birth context can affect the synthesis only through already-gated Recognition guidance and must never override the person's words. Never mention private context, birth data, vendors, external systems, labels, categories, numbers, scores, profiles, dimensions, or tendencies. The returning sentence is the highest-stakes line: maximum 15 words, discovered rather than clever. Keep the voice calm, editorial, human, and concise. Required Brand Soul dimensions are: recognition, current chapter, strengths, zone of genius, shadows, decision compass, natural contribution, and growth edge.",
        },
        {
          role: "user",
          content: `Create the confirmed-data foundation for exactly three later documents: Brand Soul File, Brand Expression Guide, and Shoot Mood Board. Brand Soul is the only complete synthesis and must include all required Brand Soul dimensions. Use the eight-turn transcript for all personal claims. Evidence quotes must be verbatim excerpts and reference the correct turn. Optional image-reference evidence, when present, may inform only post-confirmation visual translation and must never support personal claims. Follow the final Recognition brief across all document foundations; preserve any stated tension rather than resolving it by invention.\n\n${transcript}${optionalEvidenceText}${recognitionText}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mira_reflection_bundle",
          strict: true,
          schema: generatedContentJsonSchema,
        },
      },
    });
    const raw = typeof result.choices?.[0]?.message?.content === "string" ? result.choices[0].message.content : "";
    if (!raw) throw new Error("Reflection bundle model returned no structured content");
    const content = normalizeContent(parseGeneratedContent(JSON.parse(raw)), answers);
    return reflectionBundleSchema.parse({
      ...content,
      moduleEvidence: normalizedOptionalEvidence,
      generation: {
        model: result.model || MODEL_ID,
        fallback: false,
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
        totalTokens: result.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    console.error("Mira reflection bundle fallback", error);
    return reflectionBundleSchema.parse({
      ...fallbackContent(answers),
      moduleEvidence: normalizedOptionalEvidence,
      generation: {
        model: MODEL_ID,
        fallback: true,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      },
    });
  }
}
