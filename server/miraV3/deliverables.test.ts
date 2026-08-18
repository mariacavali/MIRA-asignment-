import { describe, expect, it } from "vitest";
import { reflectionBundleSchema } from "./bundle";
import { buildDeliverables, canAccessDeliverables, moodBoardRequestSchema, resolveSemanticColor } from "./deliverables";

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

describe("Mira V3 deterministic deliverables", () => {
  it("blocks every unconfirmed journey state", () => {
    expect(canAccessDeliverables("mirror_draft", "draft")).toBe(false);
    expect(canAccessDeliverables("mirror_confirmed", "draft")).toBe(false);
    expect(canAccessDeliverables("reflection", undefined)).toBe(false);
  });

  it("allows only the confirmed revision and builds all three documents without another AI call", () => {
    expect(canAccessDeliverables("mirror_confirmed", "confirmed")).toBe(true);
    const documents = buildDeliverables(bundle);
    expect(Object.keys(documents)).toEqual(["mirror", "brandSoul", "visualDirection"]);
    expect(documents.mirror.returningSentence).toBe(bundle.mirror.returningSentence);
    expect(documents.brandSoul.evidence.length).toBeGreaterThan(0);
    expect(documents.visualDirection.palette).toHaveLength(3);
    expect(documents.visualDirection.shootList).toHaveLength(3);
    expect(documents.visualDirection.compositionPrinciples).toHaveLength(3);
    expect(documents.visualDirection.palette.every(item => item.sourceTurn > 0)).toBe(true);
    expect(documents.visualDirection.shootList.every(item => item.sourceTurn > 0)).toBe(true);
    expect(documents.visualDirection.shootList.every(item => !/^\d+\./.test(item.text))).toBe(true);
    expect(documents.visualDirection.websiteDirection.sourceTurn).toBeGreaterThan(0);
    expect(documents.visualDirection.mode).toBe("brand");
    expect(documents.visualDirection.modeLabel).toBe("Brand Mood Board");
    expect(documents.visualDirection.atmosphere).toContain("timeless rather than campaign-specific");
  });

  it("adapts only visual execution for a project while preserving the confirmed identity", () => {
    const brand = buildDeliverables(bundle).visualDirection;
    const project = buildDeliverables(bundle, {
      mode: "project",
      brief: {
        purpose: "Book launch portraits",
        audience: "Thoughtful founders",
        platform: "Editorial website",
        desiredFeeling: "Quiet authority",
      },
      imageReferenceCues: ["soft window light", "stone texture"],
    }).visualDirection;

    expect(project.modeLabel).toBe("Project Mood Board");
    expect(project.identityAnchor).toBe(brand.identityAnchor);
    expect(project.projectBrief?.purpose).toBe("Book launch portraits");
    expect(project.atmosphere).toContain("Book launch portraits");
    expect(project.atmosphere).toContain("soft window light");
    expect(project.atmosphere).toContain("keeping the confirmed identity and voice unchanged");
  });

  it("keeps the project brief optional and validates bounded fields", () => {
    expect(moodBoardRequestSchema.parse({ mode: "project" })).toEqual({ mode: "project" });
    expect(() => moodBoardRequestSchema.parse({ mode: "project", brief: { purpose: "x".repeat(801) } })).toThrow();
  });

  it("renders named color intentions as semantically truthful swatches", () => {
    expect(resolveSemanticColor("deep blue for steadiness and trust", 0)).toBe("#2F4858");
    expect(resolveSemanticColor("Muted neutrals: warm beige and soft gray", 1)).toBe("#B9A893");
    expect(resolveSemanticColor("A single warm accent: terracotta or ochre", 2)).toBe("#A45E45");
    expect(resolveSemanticColor("mineral warmth", 0)).toBe("#B9A893");
    expect(resolveSemanticColor("grounded shadow", 1)).toBe("#292825");
    expect(resolveSemanticColor("restrained light", 2)).toBe("#EEE7DC");
  });
});
