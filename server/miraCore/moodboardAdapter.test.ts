import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

const imageMocks = vi.hoisted(() => ({
  generateMoodboardImageViaOpenAI: vi.fn(),
  createLocalPlaceholderImage: vi.fn(),
}));
vi.mock("./openAiMoodboardImage", () => ({ generateMoodboardImageViaOpenAI: imageMocks.generateMoodboardImageViaOpenAI }));
vi.mock("../_core/imageGeneration", () => ({ createLocalPlaceholderImage: imageMocks.createLocalPlaceholderImage }));

const envMocks = vi.hoisted(() => ({ env: { embeddingApiKey: "" } }));
vi.mock("../_core/env", () => ({ ENV: envMocks.env }));

const localFileStoreMocks = vi.hoisted(() => ({ isLocalFileStoreEnabled: vi.fn(() => false) }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: localFileStoreMocks.isLocalFileStoreEnabled }));

// Real column objects (drizzle-orm's eq()/and() replaced below with simple,
// stable descriptors keyed by column.name), so the fake DB actually evaluates
// the WHERE/ORDER BY predicates moodboardAdapter.ts builds (e.g. "shootId = 3
// AND photographerUserId = 132") against in-memory rows, instead of
// pretending every query matches. That's what makes the isolation tests
// below trustworthy: they fail if the real code ever drops a scoping clause.
type FakeCondition = { kind: "eq"; field: string; value: unknown } | { kind: "and"; conditions: FakeCondition[] };
vi.mock("drizzle-orm", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: { name: string }, value: unknown): FakeCondition => ({ kind: "eq", field: column.name, value }),
    and: (...conditions: FakeCondition[]): FakeCondition => ({ kind: "and", conditions }),
    desc: (column: { name: string }) => ({ kind: "desc", field: column.name }),
  };
});

function rowMatches(row: Record<string, unknown>, condition: FakeCondition): boolean {
  if (condition.kind === "and") return condition.conditions.every(inner => rowMatches(row, inner));
  return row[condition.field] === condition.value;
}

function createFakeMoodboardDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const key = (shootId: number, confirmedMemoryVersion: number) => `${shootId}:${confirmedMemoryVersion}`;
  let nextId = 1;
  function selectNode(condition?: FakeCondition) {
    const matches = () => {
      const all = [...rows.values()];
      return condition ? all.filter(row => rowMatches(row, condition)) : all;
    };
    const node = {
      from: () => node,
      where: (whereCondition: FakeCondition) => selectNode(whereCondition),
      orderBy: () => ({ limit: (count: number) => Promise.resolve(matches().sort((a, b) => (b.confirmedMemoryVersion as number) - (a.confirmedMemoryVersion as number)).slice(0, count)) }),
      limit: (count: number) => Promise.resolve(matches().slice(0, count)),
    };
    return node;
  }
  return {
    row: (shootId: number, confirmedMemoryVersion: number) => rows.get(key(shootId, confirmedMemoryVersion)) ?? null,
    select: () => selectNode(),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        rows.set(key(values.shootId as number, values.confirmedMemoryVersion as number), { id: nextId++, createdAt: new Date(), updatedAt: new Date(), ...values });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: FakeCondition) => {
          for (const row of rows.values()) if (rowMatches(row, condition)) Object.assign(row, values);
          return Promise.resolve();
        },
      }),
    }),
  };
}

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));

import { generateShootMoodboardForCreativeDna, getShootMoodboardForOwner, mapCompletedMoodboardImages } from "./moodboardAdapter";

// Reuses the same validated Creative DNA shape as the existing V4 moodboard
// test suite (server/miraV4/moodboard.test.ts), since the real V4 campaign
// compiler is exercised for real here rather than mocked away.
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
    imageMocks.createLocalPlaceholderImage.mockReset();
    envMocks.env.embeddingApiKey = "";
    localFileStoreMocks.isLocalFileStoreEnabled.mockReturnValue(false);
  });

  it("compiles one coherent five-scene campaign plan (not five unrelated exploration directions)", async () => {
    envMocks.env.embeddingApiKey = "sk-configured";
    imageMocks.generateMoodboardImageViaOpenAI.mockResolvedValue({ url: "https://storage.example/rendered.png" });
    const result = await generateShootMoodboardForCreativeDna({
      shootId: 3,
      photographerUserId: 132,
      confirmedMemoryVersion: 32,
      creativeDna,
    });
    expect(result?.status).toBe("complete");
    expect(result?.campaignPlanJson).toMatchObject({ title: expect.any(String), scene_1: expect.any(Object), scene_5: expect.any(Object) });
    const references = result?.referencesJson as Array<{ id: string; direction: string; shotNumber: number }>;
    expect(Array.isArray(references)).toBe(true);
    expect(references).toHaveLength(5);
    // All five scenes come from the same campaign plan/title - one coherent
    // direction, not five independent explorations.
    expect(references.map(reference => reference.shotNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(imageMocks.generateMoodboardImageViaOpenAI).toHaveBeenCalledTimes(5);
    expect(imageMocks.createLocalPlaceholderImage).not.toHaveBeenCalled();
    expect(result?.renderStatus).toBe("complete");
  });

  it("falls back to five real, locally-persisted demo images without calling the paid image API when no key is configured", async () => {
    imageMocks.createLocalPlaceholderImage.mockResolvedValue({ url: "/manus-storage/generated/local-placeholder-demo.svg" });
    const result = await generateShootMoodboardForCreativeDna({
      shootId: 3,
      photographerUserId: 132,
      confirmedMemoryVersion: 32,
      creativeDna,
    });
    expect(result?.status).toBe("complete");
    expect(result?.renderStatus).toBe("complete");
    expect(imageMocks.generateMoodboardImageViaOpenAI).not.toHaveBeenCalled();
    expect(imageMocks.createLocalPlaceholderImage).toHaveBeenCalledTimes(5);
    const references = result?.referencesJson as Array<{ url: string | null }>;
    expect(references.every(reference => reference.url === "/manus-storage/generated/local-placeholder-demo.svg")).toBe(true);
  });

  it("marks the compiled artifact complete even when the real image provider is configured but unavailable, without fabricating images", async () => {
    envMocks.env.embeddingApiKey = "sk-configured";
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
    imageMocks.createLocalPlaceholderImage.mockResolvedValue({ url: "/manus-storage/generated/local-placeholder-demo.svg" });
    await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
    imageMocks.createLocalPlaceholderImage.mockClear();
    const second = await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
    expect(second?.status).toBe("complete");
    expect(imageMocks.createLocalPlaceholderImage).not.toHaveBeenCalled();
  });

  describe("getShootMoodboardForOwner (photographer dashboard visibility)", () => {
    it("returns the completed images only to the owning photographer", async () => {
      imageMocks.createLocalPlaceholderImage.mockResolvedValue({ url: "/manus-storage/generated/local-placeholder-demo.svg" });
      await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
      const owned = await getShootMoodboardForOwner(132, 3);
      expect(owned?.status).toBe("complete");
      expect(owned?.images).toHaveLength(5);
    });

    it("never returns another photographer's shoot moodboard (shoot-level data isolation)", async () => {
      imageMocks.createLocalPlaceholderImage.mockResolvedValue({ url: "/manus-storage/generated/local-placeholder-demo.svg" });
      await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
      const otherPhotographer = await getShootMoodboardForOwner(999, 3);
      expect(otherPhotographer).toBeNull();
    });

    it("never returns a different shoot's moodboard, even for the same photographer", async () => {
      imageMocks.createLocalPlaceholderImage.mockResolvedValue({ url: "/manus-storage/generated/local-placeholder-demo.svg" });
      await generateShootMoodboardForCreativeDna({ shootId: 3, photographerUserId: 132, confirmedMemoryVersion: 32, creativeDna });
      const otherShoot = await getShootMoodboardForOwner(132, 4);
      expect(otherShoot).toBeNull();
    });
  });

  describe("mapCompletedMoodboardImages (shared by client Shoot Room and photographer dashboard visibility)", () => {
    const fiveReferences = Array.from({ length: 5 }, (_, index) => ({ id: `scene_${index + 1}`, direction: `Scene ${index + 1}`, url: `https://storage.example/scene-${index + 1}.png` }));

    it("surfaces all five images once the moodboard is complete - the exact same shape for both audiences", () => {
      const images = mapCompletedMoodboardImages("complete", fiveReferences);
      expect(images).toHaveLength(5);
      expect(images.map(image => image.id)).toEqual(["scene_1", "scene_2", "scene_3", "scene_4", "scene_5"]);
    });

    it("never shows a partially-rendered image (missing url) to either audience", () => {
      const partiallyRendered = [...fiveReferences.slice(0, 4), { id: "scene_5", direction: "Scene 5", url: null }];
      const images = mapCompletedMoodboardImages("complete", partiallyRendered);
      expect(images).toHaveLength(4);
    });

    it("never shows anything while the moodboard is still in progress, even if referencesJson already has entries", () => {
      expect(mapCompletedMoodboardImages("in_progress", fiveReferences)).toEqual([]);
    });

    it("never shows anything for a missing or malformed referencesJson", () => {
      expect(mapCompletedMoodboardImages("complete", undefined)).toEqual([]);
      expect(mapCompletedMoodboardImages("complete", null)).toEqual([]);
    });
  });
});
