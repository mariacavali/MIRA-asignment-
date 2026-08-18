import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "../_core/llm";

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

const mockedInvokeLLM = vi.mocked(invokeLLM);

import {
  generateRecognitionResult,
  hasConversationFirstSupport,
  readCachedRecognitionResult,
  recognitionInputFingerprint,
  recognitionResultSchema,
} from "./recognition";

const messages = Array.from({ length: 8 }, (_, index) => ({
  role: "user",
  content: `Answer ${index + 1} names a precise recurring truth from the user's work.`,
}));

const recognitionLayer = {
  confidence: "tentative" as const,
  contextSummary: "Across the private context, measured expression may coexist with a stronger wish for visibility.",
  adaptiveQuestionLens: "Test whether restraint protects precision or hides a conviction already present in the conversation.",
};

const imageEvidence = [{
  sourceType: "image_reference" as const,
  sourceId: "asset-1",
  quote: "Quiet asymmetry: Use an off-center editorial grid.",
  supports: ["visual_direction"] as ["visual_direction"],
}];

function validRecognitionContent() {
  const pattern = (id: string, first: string, second: string) => ({
    id,
    statement: `Pattern ${id} is supported by recurring evidence.`,
    support: [
      { source: "conversation", reference: first },
      { source: "conversation", reference: second },
    ],
    confidence: "supporting",
  });
  return {
    throughline: "Precision becomes recognizable when it is stated without performance.",
    supportedPatterns: [pattern("P1", "turn:1", "turn:2"), pattern("P2", "turn:3", "turn:4"), pattern("P3", "turn:5", "turn:8")],
    tensionsToResolve: [{
      statement: "Restraint protects depth but can obscure the clearest conviction.",
      support: [
        { source: "conversation", reference: "turn:2" },
        { source: "conversation", reference: "turn:6" },
        { source: "private_context", reference: "private:1" },
      ],
    }],
    documentGuidance: {
      brandSoul: [{ text: "Let precise recognition lead.", patternIds: ["P1"] }],
      brandExpression: [{ text: "Make restraint intentional rather than vague.", patternIds: ["P2"] }],
      shootMoodBoard: [{ text: "Use quiet asymmetry to carry editorial tension.", patternIds: ["P3"] }],
    },
    limits: ["Private context remains a hypothesis, not a personal fact."],
  };
}

describe("Mira V3 final Recognition gate", () => {
  beforeEach(() => invokeLLM.mockReset());

  it("compares conversation, one private Recognition Layer, and image observations without attribution", async () => {
    invokeLLM.mockResolvedValueOnce({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify(validRecognitionContent()) } }],
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
    });

    const recognition = await generateRecognitionResult({ messages, recognitionLayer, imageEvidence });
    const request = invokeLLM.mock.calls[0][0];
    const prompt = request.messages.map((message: { content: string }) => message.content).join("\n");

    expect(recognition.generation.fallback).toBe(false);
    expect(recognition.supportedPatterns).toHaveLength(3);
    expect(recognition.supportedPatterns.every(pattern => pattern.support.length >= 2)).toBe(true);
    expect(prompt).toContain(recognitionLayer.contextSummary);
    expect(prompt).toContain(imageEvidence[0].quote);
    expect(prompt).not.toContain('"dimension":"expression"');
    expect(prompt).not.toContain('"tendency":"measured"');
    expect(JSON.stringify(recognition)).not.toMatch(/Dakidarts|astrolog|numerolog|zodiac|horoscope|life path|heart desire/i);
  });

  it("accepts text-part structured content and sends a fully inlined strict schema", async () => {
    invokeLLM.mockResolvedValueOnce({
      model: "gpt-5-mini",
      choices: [{ message: { content: [{ type: "text", text: JSON.stringify(validRecognitionContent()) }] } }],
      usage: {},
    } as never);

    const recognition = await generateRecognitionResult({ messages, recognitionLayer, imageEvidence });
    const request = invokeLLM.mock.calls[0][0] as {
      response_format?: { json_schema?: { schema?: unknown } };
    };
    const strictSchema = JSON.stringify(request.response_format?.json_schema?.schema);

    expect(recognition.generation.fallback).toBe(false);
    expect(strictSchema).not.toContain("$ref");
    expect(strictSchema).not.toContain("$defs");
    expect(strictSchema).toContain('"brandSoul"');
    expect(strictSchema).toContain('"additionalProperties":false');
  });

  it("rejects unsupported single-reference patterns at the schema boundary", () => {
    const invalid = validRecognitionContent();
    invalid.supportedPatterns[0].support = [{ source: "conversation", reference: "turn:1" }];
    expect(() => recognitionResultSchema.omit({ generation: true }).parse(invalid)).toThrow();
  });

  it("rejects schema-valid optional evidence when it replaces repeated conversation support", () => {
    const invalid = validRecognitionContent();
    invalid.tensionsToResolve[0].support = [
      { source: "conversation", reference: "turn:2" },
      { source: "private_context", reference: "private:1" },
    ];

    expect(recognitionResultSchema.omit({ generation: true }).safeParse(invalid).success).toBe(true);
    expect(hasConversationFirstSupport(invalid)).toBe(false);
  });

  it("reuses only a complete schema-valid result with the same evidence fingerprint", async () => {
    invokeLLM.mockResolvedValueOnce({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify(validRecognitionContent()) } }],
      usage: {},
    });
    const recognition = await generateRecognitionResult({ messages, recognitionLayer, imageEvidence });
    const fingerprint = recognitionInputFingerprint({ messages, recognitionLayer, imageEvidence });
    const cached = readCachedRecognitionResult({
      status: "complete",
      normalizedResult: { input: { fingerprint }, output: recognition },
    }, fingerprint);

    expect(cached).toEqual(recognition);
    expect(readCachedRecognitionResult({
      status: "complete",
      normalizedResult: { input: { fingerprint: "stale" }, output: recognition },
    }, fingerprint)).toBeNull();
  });

  it("returns a schema-valid conversation-only fallback when Recognition is unavailable", async () => {
    invokeLLM.mockRejectedValueOnce(new Error("offline"));
    const recognition = await generateRecognitionResult({ messages, recognitionLayer, imageEvidence });

    expect(recognition.generation.fallback).toBe(true);
    expect(recognitionResultSchema.parse(recognition)).toEqual(recognition);
    expect(recognition.supportedPatterns.every(pattern => pattern.support.length >= 2)).toBe(true);
  });
});
