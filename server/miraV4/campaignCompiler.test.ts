import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { miraV4CampaignPlanSchema } from "../../shared/miraV4CampaignPlan";
import { type MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";
import { buildCompositeImagePrompt, compileCampaignPlan, compileCampaignPlanAndPrompt } from "./campaignCompiler";

const creativeDnaFixture: MiraV4CreativeDna = {
  schemaVersion: "1.0",
  identity: {
    recognitionSummary: "A quiet editorial practice that helps people trust their own perspective.",
    brandRole: "A discerning guide who makes inner clarity visible.",
    coreValues: ["clarity", "self-trust", "depth"],
    coreTensions: ["restraint and warmth", "structure and intuition"],
    underrepresentedQuality: "Tactile confidence",
    becomingIdentity: "An unmistakable editorial authority",
    creativeBoundaries: ["Never perform luxury", "Avoid visual noise"],
  },
  creativeEssence: {
    philosophy: ["Recognition precedes expression"],
    ambition: ["Make self-trust feel practical"],
    emotionalSignature: "Quiet inevitability",
    desiredImpact: "People feel more certain of what is already theirs.",
    energy: ["grounded", "precise", "unhurried"],
    atmosphere: ["private", "textural", "editorial"],
    tempo: "Slow, spacious, and deliberate",
    contrast: ["weathered detail against clean structure"],
  },
  visualWorld: {
    overallLanguage: "Restrained editorial structure softened by weathered, tactile detail.",
    colourWorld: {
      description: "Earth-led neutrals with one aged metallic accent.",
      colours: [
        { name: "Graphite", hex: "#343331", role: "Primary depth" },
        { name: "Parchment", hex: "#E7DFCF", role: "Breathing space" },
        { name: "Weathered Brass", hex: "#8A6F43", role: "Human accent" },
      ],
    },
    light: {
      quality: "Soft directional window light",
      temperature: "Warm neutral",
      contrast: "Low to medium",
      timeReference: "Late afternoon",
    },
    materials: ["uncoated paper", "weathered brass", "dark wood"],
    textures: ["graphite", "linen", "subtle grain"],
    architecture: ["quiet libraries", "restrained studios"],
    nature: ["dry grasses", "stone", "winter branches"],
    movement: ["stillness", "slow hand gestures"],
    composition: {
      framing: "Editorial crops with one clear subject",
      negativeSpace: "Generous and intentional",
      scale: "Human detail within architectural calm",
      balance: "Asymmetrical but stable",
      perspective: "Eye-level and intimate",
    },
  },
  creativeDirection: {
    overallDirection: "Build trust through restraint, tactility, and precise editorial rhythm.",
    photographyDirection: ["natural light", "observed gestures", "close material details"],
    stylingDirection: ["tonal layers", "natural fibres", "minimal ornament"],
    locationDirection: ["private studio", "aged European interior"],
    creativeRules: {
      mustInclude: ["visible material texture", "breathing space"],
      avoid: ["glossy corporate polish", "trend-led colour"],
    },
    keywords: ["quiet", "tactile", "editorial", "grounded"],
    creativeSummary: "A quiet editorial world where material honesty makes clarity feel lived rather than declared.",
  },
  implementationHints: {
    shootType: "Editorial portrait and atmospheric detail study",
    wardrobePriority: ["natural fibres", "tonal tailoring"],
    lightingPriority: ["window light", "soft shadow"],
    locationPriority: ["textural interior", "architectural quiet"],
    propsPriority: ["weathered brass object", "uncoated paper"],
    practicalNotes: ["Protect negative space", "Keep the palette restrained"],
  },
  renderTokens: {
    palette: ["graphite", "parchment", "weathered brass"],
    materials: ["linen", "uncoated paper", "dark wood"],
    architecture: ["restrained studio", "quiet library"],
    nature: ["stone", "dry grasses"],
    light: ["soft directional window light", "late afternoon"],
    composition: ["asymmetrical balance", "generous negative space"],
    fashion: ["tonal tailoring", "natural fibres"],
    mood: ["quiet inevitability", "grounded clarity"],
    styleReferences: ["independent editorial publishing"],
    avoid: ["high gloss", "visual clutter", "literal symbolism"],
  },
  inspiration: {
    imageReference: "mira-v4/synthetic/inspiration/weathered-key.png",
    userExplanation: "I love the aged brass, quiet shadow, and sense that the object carries a private history.",
    influenceRule: "supporting_evidence_only",
  },
};

describe("Mira V4 Campaign Compiler V1", () => {
  it("creates a schema-valid five-scene Campaign Plan deterministically from Creative DNA", () => {
    const first = compileCampaignPlan(creativeDnaFixture);
    const second = compileCampaignPlan(creativeDnaFixture);

    expect(first).toEqual(second);
    expect(miraV4CampaignPlanSchema.parse(first)).toEqual(first);
    expect(first.title).toBe("An unmistakable editorial authority");
    expect(Object.keys(first).filter(key => /^scene_[1-5]$/.test(key))).toHaveLength(5);
    expect(first.scene_1.name).toBe("The world opens");
    expect(first.scene_5.name).toBe("Closing continuity");
    expect(first.emotionalArc).not.toContain("..");
  });

  it("preserves Creative DNA visual language and non-negotiable rules across every connected scene", () => {
    const plan = compileCampaignPlan(creativeDnaFixture);
    const scenes = [plan.scene_1, plan.scene_2, plan.scene_3, plan.scene_4, plan.scene_5];

    expect(plan.campaignLanguage.colourPalette).toEqual(creativeDnaFixture.visualWorld.colourWorld.colours);
    expect(plan.campaignLanguage.lighting).toEqual(creativeDnaFixture.visualWorld.light);
    expect(plan.overallConsistencyRules.mustInclude).toEqual(creativeDnaFixture.creativeDirection.creativeRules.mustInclude);
    expect(plan.overallConsistencyRules.avoid).toEqual(creativeDnaFixture.creativeDirection.creativeRules.avoid);
    for (const scene of scenes) {
      expect(scene.mustInclude).toEqual(creativeDnaFixture.creativeDirection.creativeRules.mustInclude);
      expect(scene.avoid).toEqual(creativeDnaFixture.creativeDirection.creativeRules.avoid);
      expect(scene.environment).toContain("quiet libraries");
    }
  });

  it("serializes one deterministic composite prompt with all five scenes and no request side effect", () => {
    const plan = compileCampaignPlan(creativeDnaFixture);
    const firstPrompt = buildCompositeImagePrompt(plan);
    const secondPrompt = buildCompositeImagePrompt(plan);
    const result = compileCampaignPlanAndPrompt(creativeDnaFixture);

    expect(firstPrompt).toBe(secondPrompt);
    expect(result).toEqual({ campaignPlan: plan, compositeImagePrompt: firstPrompt });
    expect(firstPrompt).toContain("Create ONE single portrait editorial campaign composite image");
    expect(firstPrompt).toContain("SCENE 1 — THE WORLD OPENS");
    expect(firstPrompt).toContain("SCENE 5 — CLOSING CONTINUITY");
    expect(firstPrompt).toContain("visible material texture");
    expect(firstPrompt).toContain("glossy corporate polish");
    expect(firstPrompt).toContain("do not render text, letters, names, typography, logos, numbers, captions, borders, or watermarks");
  });

  it("contains no language-model, image-provider, storage, database, router, or network dependency", () => {
    const source = readFileSync(new URL("./campaignCompiler.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/invokeLLM|generateImage|imageGeneration|storagePut|storageGet|db\.|router|fetch\(/);
  });
});

export { creativeDnaFixture };
