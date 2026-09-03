import { describe, expect, it } from "vitest";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";
import { buildShootPreparationBrief } from "./preparationBrief";

// Same validated Creative DNA shape used by moodboardAdapter.test.ts, so this
// exercises the same real-world data the moodboard pipeline already produces.
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

describe("buildShootPreparationBrief", () => {
  it("derives practical sections directly from the persisted Creative DNA, without inventing facts", () => {
    const brief = buildShootPreparationBrief({
      creativeDna,
      shoot: { location: "Client's home studio", scheduledAt: new Date("2026-03-05T15:00:00Z"), timezone: "UTC" },
    });
    expect(brief.schemaVersion).toBe("1.0");
    expect(brief.wardrobe).toContain("natural fibres");
    expect(brief.deviceSetup).toContain("soft window light");
    expect(brief.locationNotes[0]).toBe("Confirmed location: Client's home studio.");
    expect(brief.locationNotes).toContain("quiet studio");
    expect(brief.timingNotes[0]).toMatch(/^Scheduled for /);
    expect(brief.timingNotes).toContain("Late afternoon");
    expect(brief.generalTips).toContain("Keep the campaign human.");
    expect(brief.generalTips).toContain("Bring: one symbolic object");
    expect(brief.avoid).toContain("visual clutter");
  });

  it("omits fabricated location/timing lines when the shoot has none set, without throwing", () => {
    const brief = buildShootPreparationBrief({
      creativeDna,
      shoot: { location: null, scheduledAt: null, timezone: "UTC" },
    });
    expect(brief.locationNotes.some(note => note.startsWith("Confirmed location:"))).toBe(false);
    expect(brief.timingNotes.some(note => note.startsWith("Scheduled for"))).toBe(false);
    // The Creative DNA-derived light context still comes through.
    expect(brief.timingNotes).toContain("Late afternoon");
  });

  it("de-duplicates overlapping guidance case-insensitively", () => {
    const overlapping: MiraV4CreativeDna = {
      ...creativeDna,
      creativeDirection: {
        ...creativeDna.creativeDirection,
        creativeRules: { mustInclude: [], avoid: ["Visual Clutter", "visual clutter"] },
      },
    };
    const brief = buildShootPreparationBrief({
      creativeDna: overlapping,
      shoot: { location: null, scheduledAt: null, timezone: "UTC" },
    });
    expect(brief.avoid.filter(item => item.toLowerCase() === "visual clutter")).toHaveLength(1);
  });
});
