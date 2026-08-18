import { createHash } from "node:crypto";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import type { HiddenRecognitionLayer } from "./birthData";
import type { ImageModuleEvidence } from "./imageAnalysis";

export const RECOGNITION_MODULE_TYPE = "recognition_gate";
export const RECOGNITION_MODEL_ID = "gpt-5-mini";

const evidenceReferenceSchema = z.object({
  source: z.enum(["conversation", "private_context", "image_reference"]),
  reference: z.string().trim().min(1).max(120),
});

const supportedPatternSchema = z.object({
  id: z.string().regex(/^P[1-6]$/),
  statement: z.string().trim().min(1).max(500),
  support: z.array(evidenceReferenceSchema).min(2).max(6),
  confidence: z.enum(["supporting", "tentative"]),
});

const guidanceItemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  patternIds: z.array(z.string().regex(/^P[1-6]$/)).min(1).max(3),
});

export const recognitionResultSchema = z.object({
  throughline: z.string().trim().min(1).max(900),
  supportedPatterns: z.array(supportedPatternSchema).min(3).max(6),
  tensionsToResolve: z.array(z.object({
    statement: z.string().trim().min(1).max(500),
    support: z.array(evidenceReferenceSchema).min(2).max(6),
  })).max(4),
  documentGuidance: z.object({
    brandSoul: z.array(guidanceItemSchema).min(1).max(5),
    brandExpression: z.array(guidanceItemSchema).min(1).max(5),
    shootMoodBoard: z.array(guidanceItemSchema).min(1).max(5),
  }),
  limits: z.array(z.string().trim().min(1).max(240)).max(4),
  generation: z.object({
    model: z.string(),
    fallback: z.boolean(),
    promptTokens: z.number().int().nullable(),
    completionTokens: z.number().int().nullable(),
    totalTokens: z.number().int().nullable(),
  }),
});

export type RecognitionResult = z.infer<typeof recognitionResultSchema>;

const recognitionJsonSchema = {
  type: "object",
  properties: {
    throughline: { type: "string" },
    supportedPatterns: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^P[1-6]$" },
          statement: { type: "string" },
          support: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: ["conversation", "private_context", "image_reference"] },
                reference: { type: "string" },
              },
              required: ["source", "reference"],
              additionalProperties: false,
            },
          },
          confidence: { type: "string", enum: ["supporting", "tentative"] },
        },
        required: ["id", "statement", "support", "confidence"],
        additionalProperties: false,
      },
    },
    tensionsToResolve: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          support: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: ["conversation", "private_context", "image_reference"] },
                reference: { type: "string" },
              },
              required: ["source", "reference"],
              additionalProperties: false,
            },
          },
        },
        required: ["statement", "support"],
        additionalProperties: false,
      },
    },
    documentGuidance: {
      type: "object",
      properties: {
        brandSoul: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              patternIds: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", pattern: "^P[1-6]$" } },
            },
            required: ["text", "patternIds"],
            additionalProperties: false,
          },
        },
        brandExpression: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              patternIds: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", pattern: "^P[1-6]$" } },
            },
            required: ["text", "patternIds"],
            additionalProperties: false,
          },
        },
        shootMoodBoard: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              patternIds: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", pattern: "^P[1-6]$" } },
            },
            required: ["text", "patternIds"],
            additionalProperties: false,
          },
        },
      },
      required: ["brandSoul", "brandExpression", "shootMoodBoard"],
      additionalProperties: false,
    },
    limits: { type: "array", maxItems: 4, items: { type: "string" } },
  },
  required: ["throughline", "supportedPatterns", "tensionsToResolve", "documentGuidance", "limits"],
  additionalProperties: false,
} as const;

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

function userAnswers(messages: Array<{ role: string; content: string }>) {
  return messages.filter(message => message.role === "user").map(message => message.content.trim()).slice(0, 8);
}

export function recognitionInputFingerprint(params: {
  messages: Array<{ role: string; content: string }>;
  recognitionLayer: HiddenRecognitionLayer | null;
  imageEvidence: ImageModuleEvidence[];
}) {
  return createHash("sha256").update(JSON.stringify({
    answers: userAnswers(params.messages),
    privateRecognitionLayer: params.recognitionLayer,
    imageEvidence: params.imageEvidence.map(item => ({ sourceId: item.sourceId, quote: item.quote })),
  })).digest("hex");
}

export function readCachedRecognitionResult(module: { status: string; normalizedResult: unknown } | null, fingerprint: string) {
  if (!module || module.status !== "complete" || !module.normalizedResult || typeof module.normalizedResult !== "object") return null;
  const normalized = module.normalizedResult as Record<string, unknown>;
  const input = normalized.input && typeof normalized.input === "object" ? normalized.input as Record<string, unknown> : {};
  if (input.fingerprint !== fingerprint) return null;
  const parsed = recognitionResultSchema.safeParse(normalized.output);
  return parsed.success ? parsed.data : null;
}

function compact(value: string, maxWords = 28) {
  return value.trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function fallbackRecognition(answers: string[]): RecognitionResult {
  const answer = (index: number) => answers[index]?.trim() || answers[0]?.trim() || "The available conversation evidence is limited.";
  const pattern = (id: "P1" | "P2" | "P3", first: number, second: number) => ({
    id,
    statement: compact(`${answer(first)} ${answer(second)}`, 44),
    support: [
      { source: "conversation" as const, reference: `turn:${first + 1}` },
      { source: "conversation" as const, reference: `turn:${second + 1}` },
    ],
    confidence: "tentative" as const,
  });
  return recognitionResultSchema.parse({
    throughline: compact(`${answer(0)} ${answer(7)}`, 70),
    supportedPatterns: [pattern("P1", 0, 1), pattern("P2", 2, 4), pattern("P3", 5, 7)],
    tensionsToResolve: [{
      statement: compact(`${answer(2)} ${answer(5)}`, 44),
      support: [
        { source: "conversation", reference: "turn:3" },
        { source: "conversation", reference: "turn:6" },
      ],
    }],
    documentGuidance: {
      brandSoul: [{ text: "Keep the central identity claim anchored in the recurring language of the conversation.", patternIds: ["P1", "P2"] }],
      brandExpression: [{ text: "Translate the strongest repeated qualities into a restrained, specific voice and visual system.", patternIds: ["P1", "P3"] }],
      shootMoodBoard: [{ text: "Build the shoot direction from repeated visual and experiential cues rather than decorative trends.", patternIds: ["P2", "P3"] }],
    },
    limits: ["The model-based comparison was unavailable; only direct conversation evidence was retained."],
    generation: {
      model: RECOGNITION_MODEL_ID,
      fallback: true,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
  });
}

export function hasConversationFirstSupport(result: Omit<RecognitionResult, "generation">) {
  const hasRepeatedConversation = (support: Array<{ source: string }>) =>
    support.filter(item => item.source === "conversation").length >= 2;

  return result.supportedPatterns.every(pattern => hasRepeatedConversation(pattern.support))
    && result.tensionsToResolve.every(tension => hasRepeatedConversation(tension.support));
}

export async function generateRecognitionResult(params: {
  messages: Array<{ role: string; content: string }>;
  recognitionLayer: HiddenRecognitionLayer | null;
  imageEvidence: ImageModuleEvidence[];
}) {
  const answers = userAnswers(params.messages);
  if (answers.length < 8) throw new Error("Eight completed answers are required before Recognition");
  const transcript = answers.map((answer, index) => `TURN ${index + 1}: ${answer}`).join("\n\n");
  const privateRecognitionLayer = params.recognitionLayer ? {
    reference: "private:recognition-layer",
    confidence: params.recognitionLayer.confidence,
    context: params.recognitionLayer.contextSummary,
  } : null;
  const imageEvidence = params.imageEvidence.slice(0, 8).map(item => ({
    reference: `image:${item.sourceId}`,
    observation: item.quote,
  }));

  try {
    const result = await invokeLLM({
      model: RECOGNITION_MODEL_ID,
      messages: [
        {
          role: "system",
          content:
            "You are Mira's private Recognition Engine. Synthesize one coherent reflection from the person's answers and language, repeated conversational patterns, optional image observations, the single private Recognition Layer, and the adaptive follow-up conversation. Apply strict evidence priority: (1) the person's own answers and writing, (2) repeated patterns across the conversation, (3) uploaded-image observations, and (4) the private Recognition Layer. Every pattern and tension must be established by at least two conversation-turn references before any lower-priority evidence is considered. The private Recognition Layer is one weak contextual hypothesis: it may only increase confidence, flag a contradiction, or deepen a question already founded in the conversation. It must never create a claim, override the person's words, resolve ambiguity, predict outcomes, or be decomposed into separate calculations. Image references are visual evidence only and never support personal identity claims. Where repeated conversation evidence genuinely supports it, patterns may clarify natural strengths, current growth edges, recurring protective or shadow patterns, possible self-misalignment, zone of genius, and fitting work, environments, or ways of creating. Produce document guidance only from conversation-founded patterns. Do not diagnose, flatter, invent biography, use archetypes, or claim certainty. Never mention or reproduce any private source, provider, system, calculation, category, label, number, or terminology. Never include numerology, horoscope, zodiac, astrology, birth-date analysis, scores, profiles, types, dimensions, or tendencies. The purpose is recognition and alignment, not prediction. Output JSON only.",
        },
        {
          role: "user",
          content: `Run one final Recognition comparison for the Brand Soul File, Brand Expression Guide, and Shoot Mood Board. Every supported pattern and tension must cite at least two conversation turns; optional evidence may be added only after that foundation exists. Every document-guidance item must point to one or more conversation-founded pattern IDs. Reason from the whole evidence set using language such as “Across everything available, one pattern consistently appears,” never from an individual private calculation or source. Use the private Recognition Layer only to increase confidence or test a contradiction already present across the person's answers. Use image observations only for expression and shoot guidance. If lower-priority evidence conflicts with the person's words, the person's words win and the conflict may be retained only as a tentative tension.\n\nCONVERSATION AND WRITING STYLE:\n${transcript}\n\nPRIVATE RECOGNITION LAYER:\n${privateRecognitionLayer ? JSON.stringify(privateRecognitionLayer) : "Unavailable"}\n\nOPTIONAL IMAGE OBSERVATIONS:\n${imageEvidence.length ? JSON.stringify(imageEvidence) : "Unavailable"}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "mira_final_recognition", strict: true, schema: recognitionJsonSchema },
      },
    });
    const raw = readStructuredContent(result.choices?.[0]?.message?.content);
    if (!raw) throw new Error("Recognition model returned no structured content");
    const content = recognitionResultSchema.omit({ generation: true }).parse(JSON.parse(raw));
    if (!hasConversationFirstSupport(content)) {
      throw new Error("Recognition output was not founded on repeated conversation evidence");
    }
    const patternIds = new Set(content.supportedPatterns.map(pattern => pattern.id));
    const allGuidance = [...content.documentGuidance.brandSoul, ...content.documentGuidance.brandExpression, ...content.documentGuidance.shootMoodBoard];
    if (allGuidance.some(item => item.patternIds.some(patternId => !patternIds.has(patternId)))) {
      throw new Error("Recognition guidance referenced an unknown pattern");
    }
    return recognitionResultSchema.parse({
      ...content,
      generation: {
        model: result.model || RECOGNITION_MODEL_ID,
        fallback: false,
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
        totalTokens: result.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    console.error("Mira final Recognition fallback", error);
    return fallbackRecognition(answers);
  }
}
