import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MiraV4CampaignPlan } from "../../shared/miraV4CampaignPlan";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";
import { MIRA_V4_VISUAL_PROMPT_VERSION, buildFinalMoodboardPrompts } from "./moodboard";

const scene = (name: string) => ({
  name,
  narrativeRole: "Carry the campaign's emotional arc forward.",
  subject: "A considered editorial subject.",
  environment: "A quiet, tactile interior.",
  styling: "Tonal natural fibres.",
  lighting: "Soft late-afternoon window light.",
  materialFocus: "Uncoated paper and weathered brass.",
  composition: "Asymmetrical balance with deliberate negative space.",
  movement: "Slow and observed.",
  mustInclude: ["material texture"],
  avoid: ["high gloss"],
});

const campaignPlan: MiraV4CampaignPlan = {
  schemaVersion: "1.0",
  title: "Quiet Authority",
  creativeThesis: "Make self-trust feel grounded, tactile, and editorial.",
  emotionalArc: "Recognition becomes quiet confidence.",
  campaignLanguage: {
    colourPalette: [{ name: "Parchment", hex: "#e7dfcf", role: "Breathing space" }],
    lighting: { quality: "Soft window light", temperature: "Warm neutral", contrast: "Low", timeReference: "Late afternoon" },
    styling: ["tonal layers"],
    wardrobe: ["natural fibres"],
    architectureEnvironment: ["quiet studio"],
    materialsTextures: ["linen"],
    composition: { framing: "Editorial crop", negativeSpace: "Generous", scale: "Human", balance: "Asymmetrical", perspective: "Eye level" },
    cameraFeeling: "Observed and intimate",
  },
  overallConsistencyRules: {
    campaignGrammar: "Restrained material honesty.",
    continuityRules: ["Keep the palette restrained"],
    mustInclude: ["breathing space"],
    avoid: ["visual clutter"],
  },
  scene_1: scene("Opening atmosphere"),
  scene_2: scene("Material evidence"),
  scene_3: scene("Human gesture"),
  scene_4: scene("Architectural pause"),
  scene_5: scene("Closing resolution"),
};

const creativeDna: MiraV4CreativeDna = {
  schemaVersion: "1.0",
  identity: {
    recognitionSummary: "A founder returning to self-trust.",
    brandRole: "A calm guide.",
    coreValues: ["clarity", "care"],
    coreTensions: ["softness and structure"],
    underrepresentedQuality: "Quiet courage.",
    becomingIdentity: "A self-possessed creative leader.",
    creativeBoundaries: ["never corporate"],
  },
  creativeEssence: {
    philosophy: ["meaning before decoration"],
    ambition: ["create a world with emotional precision"],
    emotionalSignature: "Quiet Authority",
    desiredImpact: "Creative Flow",
    energy: ["Quiet Authority"],
    atmosphere: ["Creative Flow"],
    tempo: "Deliberate",
    contrast: ["softness and structure"],
  },
  visualWorld: {
    overallLanguage: "Cinematic editorial confidence with one surreal intervention.",
    colourWorld: { description: "Warm parchment with a restrained red accent.", colours: [{ name: "Parchment", hex: "#e7dfcf", role: "Breathing space" }] },
    light: { quality: "Soft window light", temperature: "Warm neutral", contrast: "Low", timeReference: "Late afternoon" },
    materials: ["linen", "weathered brass"],
    textures: ["linen", "paper"],
    architecture: ["quiet studio"],
    nature: ["soft wind"],
    movement: ["slow gesture"],
    composition: { framing: "Editorial crop", negativeSpace: "Generous", scale: "Human", balance: "Asymmetrical", perspective: "Eye level" },
  },
  creativeDirection: {
    overallDirection: "Restrained material honesty with one meaningful symbolic detail.",
    photographyDirection: ["observed and intimate"],
    stylingDirection: ["tonal layers"],
    locationDirection: ["quiet studio"],
    creativeRules: { mustInclude: ["breathing space"], avoid: ["visual clutter"] },
    keywords: ["Quiet Authority", "Creative Flow"],
    creativeSummary: "A five-scene campaign about grounded self-trust.",
  },
  implementationHints: {
    shootType: "Editorial portrait session",
    wardrobePriority: ["natural fibres"],
    lightingPriority: ["soft window light"],
    locationPriority: ["quiet studio"],
    propsPriority: ["one symbolic object"],
    practicalNotes: ["Keep the campaign human."],
  },
  renderTokens: {
    palette: ["parchment", "warm red"],
    materials: ["linen", "brass"],
    architecture: ["studio"],
    nature: ["wind"],
    light: ["window light"],
    composition: ["negative space"],
    fashion: ["tonal tailoring"],
    mood: ["Quiet Authority", "Creative Flow"],
    styleReferences: ["editorial realism"],
    avoid: ["visual clutter"],
  },
  inspiration: {
    imageReference: "https://private.example/inspiration.png",
    userExplanation: "An ordinary scene becomes fashion when one small visual decision carries the idea.",
    influenceRule: "supporting_evidence_only",
  },
};

describe("Mira V4 final Moodboard prompt contract", () => {
  it("builds one coherent five-image Moodboard from one selected refined direction", () => {
    const prompts = buildFinalMoodboardPrompts({
      creativeDna,
      campaignPlan,
      compositeImagePrompt: "Approved Creative DNA evidence.",
      selected: { id: "architectural-calm", url: "https://private.example/refined.png", direction: "architectural calm", prompt: "selected prompt" },
      refinement: { preserve: "quiet material intimacy", avoid: "high gloss", note: "Keep the human presence restrained." },
    });

    expect(prompts).toHaveLength(5);
    expect(prompts.map(prompt => prompt.shotNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(prompts.map(prompt => prompt.direction)).toEqual([
      "Opening atmosphere",
      "Material evidence",
      "Human gesture",
      "Architectural pause",
      "Closing resolution",
    ]);

    for (const [index, prompt] of prompts.entries()) {
      expect(prompt.prompt).toContain("AUTHORITATIVE MARIA VISUAL-DIRECTION LAYER");
      expect(prompt.prompt).toContain("STYLE VERSION: maria-visual-style-v1.0.");
      expect(prompt.prompt).toContain("MARIA SIGNATURE: Unexpected symbolism with emotional precision.");
      expect(prompt.prompt).toContain("A five-image Moodboard is one campaign story, not five unrelated beautiful images.");
      expect(prompt.prompt).toContain("FIVE-SCENE ROLE");
      expect(prompt.prompt).toContain("Interpretive evidence only: use the customer's stated inspiration meaning");
      expect(prompt.prompt).toContain("Do not reproduce literal people, objects, scenes, poses, or composition from the source image.");
      expect(prompt.prompt).toContain("Quiet Authority: Calm power that does not need to prove itself.");
      expect(prompt.prompt).toContain("SELECTED REFINED DIRECTION: architectural calm.");
      expect(prompt.prompt).toContain("CAMPAIGN TITLE: Quiet Authority.");
      expect(prompt.prompt).toContain(`SHOT ${index + 1}:`);
      expect(prompt.prompt).toContain("Return image only: no text, letters, typography, logos, captions, borders, or watermarks.");
    }
  });

  it("uses the received authoritative module and versions final-generation caching", () => {
    const source = readFileSync(new URL("./moodboard.ts", import.meta.url), "utf8");
    const authoritativeSource = readFileSync(new URL("./authoritative/maria_visual_style.py", import.meta.url), "utf8");
    const journeySource = readFileSync(new URL("../../client/src/pages/MiraV4Journey.tsx", import.meta.url), "utf8");
    expect(MIRA_V4_VISUAL_PROMPT_VERSION).toContain("mira-moodboard-maria-style-v1.0");
    expect(source).toContain("applyTemporaryMariaVisualStylePlaceholder");
    expect(source).not.toContain("applyAuthoritativeMariaVisualStyleLayer");
    expect(source).not.toContain("TEMPORARY STYLE-INTEGRATION PLACEHOLDER");
    expect(journeySource).not.toContain("Temporary style-integration placeholder");
    expect(journeySource).toContain("Maria’s visual-direction framework");
    expect(authoritativeSource).toContain('STYLE_VERSION = "maria-visual-style-v1.0"');
    expect(authoritativeSource).toContain("A five-image Moodboard is one campaign story, not five unrelated beautiful images.");
    expect(source).toContain("scene_5");
  });

  it("retains the claim-complete retry guard instead of allowing duplicate visual generation", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const routerSource = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
    expect(dbSource).toContain('if (existing?.status === "in_progress")');
    expect(dbSource).toContain('existing?.status === "complete" && existing.promptVersion !== params.promptVersion');
    expect(routerSource).toContain("claimMiraV4VisualSet");
    expect(routerSource).toContain("if (!claim.claimed)");
    expect(routerSource).toContain('code: "CONFLICT"');
  });
});
