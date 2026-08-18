import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM }));

import { canRetryReflectionBundle, generateReflectionBundle, parseGeneratedContent, reflectionBundleSchema } from "./bundle";
import type { RecognitionResult } from "./recognition";

const messages = Array.from({ length: 8 }, (_, index) => ({
  role: "user",
  content: `Turn ${index + 1} contains the user's exact private reflection and the language that matters most to them`,
}));

function validGeneratedContent() {
  return {
    mirror: {
      whatHasAlwaysBeenTrue: "A grounded truth",
      thread: "A coherent thread",
      whoThisIsFor: "People facing consequential choices",
      returningSentence: "Clarity should return choice, not replace it.",
      recognition: "A recognizable pattern",
    },
    essence: {
      coreTruth: "Truth",
      naturalGift: "Gift",
      feltExperience: "Experience",
      peoplePortrait: "Portrait",
      direction: "Direction",
      voiceQualities: ["calm", "precise", "human"],
      currentChapter: "Choosing a truer direction",
      strengths: ["Discernment", "Pattern recognition", "Clear language"],
      zoneOfGenius: "Making complex inner knowledge usable without flattening it.",
      shadows: ["Waiting for certainty", "Over-editing instinct"],
      decisionCompass: "Choose what returns agency and preserves depth.",
      naturalContribution: "Helping people recognise what they already know.",
      growthEdge: "Let clarity become visible before it feels complete.",
    },
    visualDirection: {
      atmosphere: "Quiet and editorial",
      colorIntentions: ["warm ivory", "soft black", "muted brass"],
      materialCues: ["linen", "paper", "stone"],
      compositionPrinciples: ["negative space", "asymmetry", "clear hierarchy"],
      photographicDirection: "Natural light and unforced expressions",
    },
    evidence: Array.from({ length: 8 }, (_, index) => ({
      turn: index + 1,
      quote: `Evidence ${index + 1}`,
      supports: ["mirror"],
    })),
  };
}

describe("Mira V3 Reflection Bundle", () => {
  beforeEach(() => invokeLLM.mockReset());

  it("refuses synthesis before eight user answers", async () => {
    await expect(generateReflectionBundle(messages.slice(0, 7))).rejects.toThrow("Eight completed answers");
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("returns a schema-valid deterministic fallback when the model is unavailable", async () => {
    invokeLLM.mockRejectedValueOnce(new Error("offline"));
    const bundle = await generateReflectionBundle(messages);

    expect(reflectionBundleSchema.parse(bundle)).toEqual(bundle);
    expect(bundle.generation.fallback).toBe(true);
    expect(bundle.evidence).toHaveLength(8);
    expect(bundle.mirror.returningSentence.trim().split(/\s+/).length).toBeLessThanOrEqual(15);
    expect(bundle.evidence[0].quote).toContain("Turn 1");
  });

  it("preserves explicit image-reference provenance in successful and fallback bundles", async () => {
    const optionalEvidence = [{
      sourceType: "image_reference" as const,
      sourceId: "asset-1",
      quote: "Quiet asymmetry: Use off-center editorial grids.",
      supports: ["visual_direction"] as ["visual_direction"],
    }];
    invokeLLM.mockResolvedValueOnce({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify(validGeneratedContent()) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    const generated = await generateReflectionBundle(messages, optionalEvidence);
    invokeLLM.mockRejectedValueOnce(new Error("offline"));
    const fallback = await generateReflectionBundle(messages, optionalEvidence);

    expect(generated.moduleEvidence).toEqual(optionalEvidence);
    expect(fallback.moduleEvidence).toEqual(optionalEvidence);
    expect(fallback.generation.fallback).toBe(true);
  });

  it("uses one final Recognition brief for all three document foundations without exposing private source labels", async () => {
    const recognition = {
      throughline: "Precision becomes recognizable when it is stated without performance.",
      supportedPatterns: Array.from({ length: 3 }, (_, index) => ({
        id: `P${index + 1}`,
        statement: `Supported pattern ${index + 1}`,
        support: [
          { source: "conversation", reference: `turn:${index + 1}` },
          { source: "conversation", reference: `turn:${index + 2}` },
        ],
        confidence: "supporting",
      })),
      tensionsToResolve: [],
      documentGuidance: {
        brandSoul: [{ text: "Anchor identity in P1.", patternIds: ["P1"] }],
        brandExpression: [{ text: "Translate P2 into expression.", patternIds: ["P2"] }],
        shootMoodBoard: [{ text: "Translate P3 into image direction.", patternIds: ["P3"] }],
      },
      limits: [],
      generation: { model: "gpt-5-mini", fallback: false, promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    } as RecognitionResult;
    invokeLLM.mockResolvedValueOnce({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify(validGeneratedContent()) } }],
      usage: {},
    });

    await generateReflectionBundle(messages, [], recognition);
    const prompt = invokeLLM.mock.calls[0][0].messages.map((message: { content: string }) => message.content).join("\n");

    expect(prompt).toContain("FINAL RECOGNITION BRIEF");
    expect(prompt).toContain(recognition.throughline);
    expect(prompt).toContain("brandSoul");
    expect(prompt).toContain("brandExpression");
    expect(prompt).toContain("shootMoodBoard");
    expect(prompt).not.toContain("private_context");
  });

  it("rejects image-reference evidence that claims support outside visual direction", async () => {
    await expect(generateReflectionBundle(messages, [{
      sourceType: "image_reference",
      sourceId: "asset-1",
      quote: "Observable visual cue",
      supports: ["mirror"],
    } as never])).rejects.toThrow();
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("clips model array overflow to documented bounds before strict validation", () => {
    const input = validGeneratedContent();
    input.essence.voiceQualities = ["calm", "precise", "human", "direct", "spacious", "grounded"];
    input.essence.strengths = ["one", "two", "three", "four", "five", "six", "seven"];
    input.essence.shadows = ["one", "two", "three", "four", "five", "six", "seven"];
    input.evidence[0].supports = ["mirror", "brand_soul", "visual_direction", "voice", "extra"];
    input.evidence.push({ turn: 8, quote: "Overflow evidence", supports: ["mirror"] });

    const parsed = parseGeneratedContent(input);

    expect(parsed.essence.voiceQualities).toEqual(["calm", "precise", "human", "direct", "spacious"]);
    expect(parsed.essence.strengths).toEqual(["one", "two", "three", "four", "five"]);
    expect(parsed.essence.shadows).toEqual(["one", "two", "three", "four"]);
    expect(parsed.evidence[0].supports).toEqual(["mirror", "brand_soul", "visual_direction", "voice"]);
    expect(parsed.evidence).toHaveLength(8);
  });

  it("still rejects undersized arrays rather than manufacturing evidence", () => {
    const input = validGeneratedContent();
    input.essence.voiceQualities = ["calm", "precise"];

    expect(() => parseGeneratedContent(input)).toThrow();
  });

  it("permits retries only for schema-valid active fallback drafts", async () => {
    invokeLLM.mockRejectedValueOnce(new Error("offline"));
    const fallbackBundle = await generateReflectionBundle(messages);

    expect(canRetryReflectionBundle("draft", fallbackBundle)).toBe(true);
    expect(canRetryReflectionBundle("confirmed", fallbackBundle)).toBe(false);
    expect(canRetryReflectionBundle("draft", { generation: { fallback: true } })).toBe(false);
    expect(canRetryReflectionBundle("draft", { ...fallbackBundle, generation: { ...fallbackBundle.generation, fallback: false } })).toBe(false);
  });
});
