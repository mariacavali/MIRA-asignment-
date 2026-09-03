import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

const imageMocks = vi.hoisted(() => ({ generateMoodboardImageViaOpenAI: vi.fn() }));
vi.mock("./openAiMoodboardImage", () => ({ generateMoodboardImageViaOpenAI: imageMocks.generateMoodboardImageViaOpenAI }));

function createFakeMoodboardDb() {
  let row: Record<string, unknown> | null = null;
  return {
    row: () => row,
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }) }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        row = { id: 1, createdAt: new Date(), updatedAt: new Date(), ...values };
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          row = { ...row, ...values };
          return Promise.resolve();
        },
      }),
    }),
  };
}

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));

import { generateShootMoodboardForCreativeDna } from "./moodboardAdapter";

// Reuses the same validated Creative DNA shape as the existing V4 moodboard
// test suite (server/miraV4/moodboard.test.ts), since compileMiraV4VisualSource
// is exercised for real here rather than mocked away.
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

describe("shoot moodboard adapter (Creative DNA -> existing V4 moodboard engine)", () => {
  let fakeDb: ReturnType<typeof createFakeMoodboardDb>;

  beforeEach(() => {
    fakeDb = createFakeMoodboardDb();
    dbMocks.getDb.mockResolvedValue(fakeDb);
    imageMocks.generateMoodboardImageViaOpenAI.mockReset();
  });

  it("compiles the real V4 campaign plan and five scene prompts (not realtime narration)", async () => {
    imageMocks.generateMoodboardImageViaOpenAI.mockResolvedValue({ url: "https://storage.example/rendered.png" });
    const result = await generateShootMoodboardForCreativeDna({
      shootId: 3,
      photographerUserId: 132,
      confirmedMemoryVersion: 32,
      creativeDna,
    });
    expect(result?.status).toBe("complete");
    expect(result?.campaignPlanJson).toMatchObject({ title: expect.any(String), scene_1: expect.any(Object), scene_5: expect.any(Object) });
    expect(Array.isArray(result?.referencesJson)).toBe(true);
    expect((result?.referencesJson as unknown[]).length).toBe(5);
    expect(imageMocks.generateMoodboardImageViaOpenAI).toHaveBeenCalledTimes(5);
    expect(result?.renderStatus).toBe("complete");
  });

  it("marks the compiled artifact complete even when the image provider is not configured, without fabricating images", async () => {
    imageMocks.generateMoodboardImageViaOpenAI.mockRejectedValue(new Error("OPENAI_API_KEY is not configured"));
    const result = await generateShootMoodboardForCreativeDna({
      shootId: 3,
      photographerUserId: 132,
      confirmedMemoryVersion: 32,
      creativeDna,
    });
    // The deterministic campaign/prompt artifact is real and complete...
    expect(result?.status).toBe("complete");
    // ...but rendering is honestly reported as unavailable, never faked.
    expect(result?.renderStatus).toBe("not_configured");
    expect(result?.errorCode).toBe("image_provider_not_configured");
  });

  it("is idempotent once already complete for a given confirmed memory version", async () => {
    imageMocks.generateMoodboardImageViaOpenAI.mockResolvedValue({ url: "https://storage.example/rendered.png" });
    await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
    imageMocks.generateMoodboardImageViaOpenAI.mockClear();
    const second = await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
    expect(second?.status).toBe("complete");
    expect(imageMocks.generateMoodboardImageViaOpenAI).not.toHaveBeenCalled();
  });
});
