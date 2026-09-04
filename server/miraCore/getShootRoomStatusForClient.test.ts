import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoMiraV4CreativeDna } from "./demoCreativeDna";
import type { MiraV4CreativeDnaSource } from "../miraV4/creativeDna";

// Regression coverage for the confirmed client Shoot Room rendering blocker:
// getShootRoomStatusForClient (server/miraCore/db.ts) read the persisted
// Creative DNA straight off the row and passed it into
// buildShootPreparationBrief (server/miraCore/preparationBrief.ts) without
// normalizing it first. When the MariaDB driver returns that JSON column as
// a raw string, `creativeDna.visualWorld` is undefined and
// `.light` on it throws exactly the reported
// "Cannot read properties of undefined (reading 'light')".
const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
const localFileStoreMocks = vi.hoisted(() => ({ isLocalFileStoreEnabled: vi.fn(() => false) }));

vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../localFileStore", async importOriginal => {
  const actual = await importOriginal<typeof import("../localFileStore")>();
  return { ...actual, isLocalFileStoreEnabled: localFileStoreMocks.isLocalFileStoreEnabled };
});

// Real column objects (drizzle-orm's eq()/and()/desc() replaced with simple,
// stable descriptors keyed by column.name) - same approach as the other
// Stage 3 regression tests, so the fake DB below evaluates the actual
// WHERE/ORDER BY predicates db.ts builds.
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

import * as schema from "../../drizzle/schema";
import { getShootRoomStatusForClient } from "./db";

function fakeTable(rows: Record<string, unknown>[]) {
  return {
    where: (condition: FakeCondition) => {
      const filtered = () => rows.filter(row => rowMatches(row, condition));
      return {
        orderBy: () => ({ limit: (count: number) => Promise.resolve(filtered().slice(0, count)) }),
        limit: (count: number) => Promise.resolve(filtered().slice(0, count)),
      };
    },
  };
}

function createFakeDb(tables: {
  shoots: Record<string, unknown>[];
  moodboard: Record<string, unknown>[];
  creativeDna: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
}) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === schema.miraShoots) return fakeTable(tables.shoots);
        if (table === schema.miraShootMoodboard) return fakeTable(tables.moodboard);
        if (table === schema.miraShootCreativeDna) return fakeTable(tables.creativeDna);
        if (table === schema.miraShootMemoryRevisions) return fakeTable(tables.revisions);
        throw new Error("Unexpected table in fake db");
      },
    }),
  };
}

function fiveSceneReferences() {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `scene_${index + 1}`,
    direction: `Scene ${index + 1}`,
    shotNumber: index + 1,
    url: "/manus-storage/generated/local-placeholder-demo.svg",
  }));
}

// The exact persisted demo-local Creative DNA shape: produced by the same
// buildDemoMiraV4CreativeDna function the confirmed live shoot actually used
// (per "Creative DNA uses demo-local" in the verified live state), not a
// hand-written approximation.
function demoLocalCreativeDna() {
  const source: MiraV4CreativeDnaSource = {
    journey: { building: "Personal brand", currentPosition: null, needMost: null, firstCreation: null, birthDate: null, birthTime: null, birthTimeUnknown: 1, birthCity: null, creativeInputs: null },
    conversation: [{ phase: "creative_discovery", role: "user", content: "Confirmed summary" }],
    inspiration: { imageReference: null, userExplanation: null, influenceRule: "supporting_evidence_only" },
  };
  return buildDemoMiraV4CreativeDna(source);
}

function seedDb(creativeDnaJson: unknown) {
  return createFakeDb({
    shoots: [{ id: 42, roomState: "preparation_active", status: "conversation_in_progress", location: "Home studio", scheduledAt: new Date("2026-09-04T12:00:00.000Z"), timezone: "Europe/Amsterdam", durationMinutes: 60 }],
    moodboard: [{ shootId: 42, confirmedMemoryVersion: 3, status: "complete", referencesJson: fiveSceneReferences() }],
    creativeDna: [{ shootId: 42, confirmedMemoryVersion: 3, status: "complete", creativeDnaJson }],
    revisions: [],
  });
}

describe("getShootRoomStatusForClient: preparation brief survives the MariaDB JSON-column string/object boundary", () => {
  beforeEach(() => {
    dbMocks.getDb.mockReset();
    localFileStoreMocks.isLocalFileStoreEnabled.mockReturnValue(false);
  });

  it("renders a preparation brief from the exact persisted demo-local Creative DNA shape, already an object", async () => {
    const db = seedDb(demoLocalCreativeDna());
    dbMocks.getDb.mockResolvedValue(db);
    const status = await getShootRoomStatusForClient(42);
    expect(status.preparationReady).toBe(true);
    expect(status.preparationBrief).not.toBeNull();
    expect(status.preparationBrief?.wardrobe.length).toBeGreaterThan(0);
    expect(status.preparationBrief?.timingNotes.length).toBeGreaterThan(0);
  });

  it("renders a preparation brief from a hand-built, schema-valid production-shaped Creative DNA object", async () => {
    // Reuses the same fixture shape as moodboardAdapter.test.ts's coherent-
    // campaign test, proving this is not specific to the demo generator.
    const db = seedDb({
      schemaVersion: "1.0",
      identity: { recognitionSummary: "x", brandRole: "x", coreValues: [], coreTensions: [], underrepresentedQuality: "x", becomingIdentity: "x", creativeBoundaries: [] },
      creativeEssence: { philosophy: [], ambition: [], emotionalSignature: "x", desiredImpact: "x", energy: [], atmosphere: [], tempo: "x", contrast: [] },
      visualWorld: { overallLanguage: "x", colourWorld: { description: "Warm parchment", colours: [] }, light: { quality: "Soft", temperature: "Warm", contrast: "Low", timeReference: "Afternoon" }, materials: [], textures: [], architecture: [], nature: [], movement: [], composition: { framing: "x", negativeSpace: "x", scale: "x", balance: "x", perspective: "x" } },
      creativeDirection: { overallDirection: "x", photographyDirection: [], stylingDirection: [], locationDirection: [], creativeRules: { mustInclude: [], avoid: ["harsh flash"] }, keywords: [], creativeSummary: "x" },
      implementationHints: { shootType: "x", wardrobePriority: ["Natural fibres"], lightingPriority: [], locationPriority: [], propsPriority: [], practicalNotes: [] },
      renderTokens: { palette: [], materials: [], architecture: [], nature: [], light: [], composition: [], fashion: [], mood: [], styleReferences: [], avoid: [] },
      inspiration: { imageReference: null, userExplanation: null, influenceRule: "supporting_evidence_only" },
    });
    dbMocks.getDb.mockResolvedValue(db);
    const status = await getShootRoomStatusForClient(42);
    expect(status.preparationBrief).not.toBeNull();
    expect(status.preparationBrief?.wardrobe).toContain("Natural fibres");
  });

  it("renders the identical preparation brief when the driver returns the persisted Creative DNA as a raw JSON string - the confirmed live failure mode", async () => {
    const creativeDna = demoLocalCreativeDna();
    const dbObjectForm = seedDb(creativeDna);
    dbMocks.getDb.mockResolvedValue(dbObjectForm);
    const fromObject = await getShootRoomStatusForClient(42);

    const dbStringForm = seedDb(JSON.stringify(creativeDna));
    dbMocks.getDb.mockResolvedValue(dbStringForm);
    const fromString = await getShootRoomStatusForClient(42);

    expect(fromString.preparationBrief).not.toBeNull();
    expect(fromString.preparationBrief).toEqual(fromObject.preparationBrief);
  });

  it("fails safely on malformed persisted Creative DNA - preparationBrief is null, but the rest of the room status (moodboard, room state) still returns", async () => {
    const db = seedDb("{not valid json");
    dbMocks.getDb.mockResolvedValue(db);
    const status = await getShootRoomStatusForClient(42);
    expect(status.preparationBrief).toBeNull();
    // Never silently hidden by crashing the whole response - moodboard/room
    // state data the client also needs is still returned honestly.
    expect(status.moodboardReady).toBe(true);
    expect(status.images).toHaveLength(5);
    expect(status.roomState).toBe("preparation_active");
  });

  it("returns a completed, five-scene moodboard and a non-null preparation brief together for a fully prepared shoot", async () => {
    const db = seedDb(demoLocalCreativeDna());
    dbMocks.getDb.mockResolvedValue(db);
    const status = await getShootRoomStatusForClient(42);
    expect(status.moodboardReady).toBe(true);
    expect(status.images).toHaveLength(5);
    expect(status.images.map(image => image.id)).toEqual(["scene_1", "scene_2", "scene_3", "scene_4", "scene_5"]);
    expect(status.preparationBrief).not.toBeNull();
    expect(status.preparationReady).toBe(true);
  });
});
