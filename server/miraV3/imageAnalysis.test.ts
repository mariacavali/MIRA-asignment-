import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM }));

import {
  analyzePrivateReferenceImage,
  buildImageModuleEvidence,
  containsProhibitedImageInference,
} from "./imageAnalysis";

const safeOutput = {
  summary: "A restrained editorial composition with warm neutrals and generous negative space.",
  colorObservations: [{ observation: "Warm neutral field", evidence: "Cream and clay tones occupy most of the frame." }],
  compositionObservations: [{ observation: "Asymmetric balance", evidence: "The focal object sits left of center with open space on the right." }],
  materialObservations: [{ observation: "Tactile paper", evidence: "Visible fibers and soft edge variation suggest uncoated stock." }],
  silhouetteObservations: [{ observation: "Soft curved outline", evidence: "Rounded contours repeat across the focal objects." }],
  patternRhythmObservations: [{ observation: "Measured repetition", evidence: "Small forms recur at regular intervals." }],
  motifs: [{ observation: "Single curved line", evidence: "A repeated arc links the main elements." }],
  atmosphereObservations: [{ observation: "Quiet visual pace", evidence: "Low contrast and generous spacing reduce visual density." }],
  crossImageConsistencies: [],
  translationIdeas: [{ cue: "Quiet asymmetry", application: "Use off-center editorial grids with generous margins." }],
  limits: ["Lighting may shift the apparent warmth of the palette."],
};

describe("private image analysis", () => {
  beforeEach(() => invokeLLM.mockReset());

  it("accepts structured visual evidence and records model provenance", async () => {
    invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify(safeOutput) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    const result = await analyzePrivateReferenceImage({ assetId: "asset-1", imageUrl: "https://signed.example/image", mimeType: "image/png" });
    expect(result.status).toBe("complete");
    expect(result.provenance).toMatchObject({ fallback: false, totalTokens: 30 });
  });

  it("fails closed when model output contains a prohibited personal inference", async () => {
    invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify({ ...safeOutput, summary: "This suggests an emotional state." }) } }],
      usage: {},
    });
    const result = await analyzePrivateReferenceImage({ assetId: "asset-1", imageUrl: "https://signed.example/image", mimeType: "image/png" });
    expect(result.status).toBe("failed");
    expect(result.provenance.fallback).toBe(true);
    expect(result.output.translationIdeas).toEqual([]);
  });

  it("detects prohibited sensitive-inference language", () => {
    expect(containsProhibitedImageInference({ text: "A likely medical condition" })).toBe(true);
    expect(containsProhibitedImageInference(safeOutput)).toBe(false);
  });

  it("creates bounded, explicitly sourced visual-direction evidence", () => {
    const evidence = buildImageModuleEvidence([{ id: "asset-1", status: "analyzed", analysis: safeOutput }]);
    expect(evidence).toEqual([{ sourceType: "image_reference", sourceId: "asset-1", quote: "Quiet asymmetry: Use off-center editorial grids with generous margins.", supports: ["visual_direction"] }]);
  });

  it("adds cross-image evidence only for cues observed in at least two analyzed references", () => {
    const second = { ...safeOutput, summary: "A warm geometric reference.", translationIdeas: [{ cue: "Warm geometry", application: "Repeat warm angular accents." }] };
    const evidence = buildImageModuleEvidence([
      { id: "asset-1", status: "analyzed", analysis: safeOutput },
      { id: "asset-2", status: "analyzed", analysis: second },
    ]);
    expect(evidence.some(item => item.quote.includes("Cross-image consistency") && item.quote.includes("warm"))).toBe(true);
    expect(evidence.every(item => item.supports.includes("visual_direction"))).toBe(true);
  });
});
