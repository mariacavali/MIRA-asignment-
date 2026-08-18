import { describe, expect, it } from "vitest";
import { reflectionBundleSchema } from "./bundle";
import { buildDeliverables } from "./deliverables";
import { deliverableFilename, MIRA_V3_DELIVERABLES, parseDeliverableHtml, renderDeliverableHtml, renderPdfFromHtml } from "./pdf";

const bundle = reflectionBundleSchema.parse({
  mirror: {
    whatHasAlwaysBeenTrue: "I make difficult ideas feel clear without making them smaller.",
    thread: "People return when they need language for what they already sense.",
    whoThisIsFor: "Thoughtful founders who want recognition rather than performance.",
    returningSentence: "Make the invisible precise without making it smaller.",
    recognition: "The work is not louder. It is more exact.",
  },
  essence: {
    coreTruth: "Clarity can preserve depth.", naturalGift: "Naming the hidden thread.",
    feltExperience: "Quiet recognition.", peoplePortrait: "Thoughtful founders.",
    direction: "Let precision lead and promotion follow.", voiceQualities: ["quiet", "exact", "human"],
    currentChapter: "Choosing precision over performance.",
    strengths: ["Pattern recognition", "Clear language", "Quiet discernment"],
    zoneOfGenius: "Making the invisible precise without reducing its depth.",
    shadows: ["Over-refining before sharing", "Mistaking quiet for hesitation"],
    decisionCompass: "Choose what preserves depth and returns agency.",
    naturalContribution: "Language that helps thoughtful people recognize what they already know.",
    growthEdge: "Let the work be seen before every edge is resolved.",
  },
  visualDirection: {
    atmosphere: "Limestone quiet with editorial tension.",
    colorIntentions: ["mineral warmth", "grounded shadow", "restrained light"],
    materialCues: ["paper grain", "soft stone", "brushed metal"],
    compositionPrinciples: ["asymmetric calm", "one idea per field", "generous pause"],
    photographicDirection: "Close, unperformed, tactile portraits with natural falloff.",
  },
  evidence: Array.from({ length: 8 }, (_, index) => ({ turn: index + 1, quote: `Exact answer ${index + 1}`, supports: [index < 2 ? "mirror" : index < 5 ? "brand_soul" : "visual_direction"] })),
  generation: { model: "gpt-5-mini", fallback: false, promptTokens: 100, completionTokens: 100, totalTokens: 200 },
});

describe("Mira V3 private PDF documents", () => {
  it.each(MIRA_V3_DELIVERABLES)("renders %s as semantic HTML-derived PDF bytes", async deliverable => {
    const html = renderDeliverableHtml(deliverable, buildDeliverables(bundle));
    const blocks = parseDeliverableHtml(html);
    const pdf = await renderPdfFromHtml(html);
    expect(html).toContain("Mira · Private confirmed document");
    expect(blocks.some(block => block.type === "h1")).toBe(true);
    expect(blocks.length).toBeGreaterThan(8);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(1_000);
    expect(deliverableFilename(deliverable, 42)).toMatch(/^mira-42-.+\.pdf$/);
  });
});
