import { createHash } from "node:crypto";
import { miraV4CreativeDnaSchema, type MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";
import type { MiraV4CreativeDnaSource } from "../miraV4/creativeDna";

export const DEMO_CREATIVE_DNA_MODEL = "demo-local" as const;

function hashHex(source: MiraV4CreativeDnaSource) {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function paletteFromHash(hash: string): Array<{ name: string; hex: string; role: string }> {
  return [
    { name: "Demo Parchment", hex: `#${hash.slice(0, 6)}`, role: "Primary ground" },
    { name: "Demo Accent", hex: `#${hash.slice(6, 12)}`, role: "Emotional accent" },
    { name: "Demo Depth", hex: `#${hash.slice(12, 18)}`, role: "Shadow and contrast" },
  ];
}

// Deterministically synthesizes a schema-valid Creative DNA object from the
// same source the real synthesizeMiraV4CreativeDna call would use, without
// calling any paid LLM. Every field is clearly labeled DEMO so it can never
// be mistaken for real MIRA output, while still varying per shoot (via the
// source hash and the shoot's own title/summary text) so the rest of the
// pipeline - the campaign compiler, the moodboard prompts, the gallery - has
// real, distinguishable input to exercise end to end.
export function buildDemoMiraV4CreativeDna(source: MiraV4CreativeDnaSource): MiraV4CreativeDna {
  const hash = hashHex(source);
  const shootLabel = source.journey.building?.trim() || "this shoot";
  const referenceCount = source.conversation.length;
  const palette = paletteFromHash(hash);

  const draft = {
    schemaVersion: "1.0" as const,
    identity: {
      recognitionSummary: `DEMO: A placeholder recognition summary for ${shootLabel}.`,
      brandRole: "DEMO: A calm, confident creative presence.",
      coreValues: ["demo-clarity", "demo-care"],
      coreTensions: ["demo-softness-and-structure"],
      underrepresentedQuality: "DEMO: quiet confidence.",
      becomingIdentity: "DEMO: a self-possessed creative direction.",
      creativeBoundaries: ["demo-never-generic"],
    },
    creativeEssence: {
      philosophy: ["demo-meaning-before-decoration"],
      ambition: ["demo-create-one-coherent-world"],
      emotionalSignature: "Demo Quiet Authority",
      desiredImpact: "Demo Creative Flow",
      energy: ["demo-quiet-authority"],
      atmosphere: ["demo-creative-flow"],
      tempo: "Demo Deliberate",
      contrast: ["demo-softness-and-structure"],
    },
    visualWorld: {
      overallLanguage: "DEMO: cinematic editorial confidence, generated locally without a paid model.",
      colourWorld: {
        description: "DEMO palette derived from this shoot's own data fingerprint.",
        colours: palette,
      },
      light: {
        quality: "Demo soft directional light",
        temperature: "Demo warm neutral",
        contrast: "Demo gentle contrast",
        timeReference: "Demo golden hour",
      },
      materials: ["demo-linen", "demo-stone"],
      textures: ["demo-matte", "demo-soft-grain"],
      architecture: ["demo-minimal-interior"],
      nature: ["demo-natural-light"],
      movement: ["demo-stillness"],
      composition: {
        framing: "Demo centered with breathing room",
        negativeSpace: "Demo generous",
        scale: "Demo intimate",
        balance: "Demo symmetrical",
        perspective: "Demo eye-level",
      },
    },
    creativeDirection: {
      overallDirection: `DEMO creative direction for ${shootLabel}, built from ${referenceCount} confirmed conversation turn(s).`,
      photographyDirection: ["demo-editorial-portrait"],
      stylingDirection: ["demo-considered-wardrobe"],
      locationDirection: ["demo-quiet-interior"],
      creativeRules: {
        mustInclude: ["demo-confirmed-continuity"],
        avoid: ["demo-generic-stock-styling"],
      },
      keywords: ["demo", "placeholder", "local-fallback"],
      creativeSummary: "DEMO: this Creative DNA was generated locally without calling a paid AI model.",
    },
    implementationHints: {
      shootType: "DEMO shoot type",
      wardrobePriority: ["demo-wardrobe"],
      lightingPriority: ["demo-lighting"],
      locationPriority: ["demo-location"],
      propsPriority: ["demo-props"],
      practicalNotes: ["demo-practical-note"],
    },
    renderTokens: {
      palette: palette.map(colour => colour.name),
      materials: ["demo-linen"],
      architecture: ["demo-minimal-interior"],
      nature: ["demo-natural-light"],
      light: ["demo-soft-directional"],
      composition: ["demo-centered"],
      fashion: ["demo-considered-wardrobe"],
      mood: ["demo-quiet-authority"],
      styleReferences: ["demo-local-placeholder"],
      avoid: ["demo-generic-stock-styling"],
    },
    inspiration: source.inspiration,
  };

  return miraV4CreativeDnaSchema.parse(draft);
}
