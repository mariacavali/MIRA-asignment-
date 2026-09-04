import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyShootMemory } from "./memory";

// End-to-end regression for the Stage 3 MariaDB JSON-column blocker: proves
// a confirmed shoot memory - arriving as either an already-parsed object or
// the raw JSON string some driver configurations return, and carrying a
// real, non-UUID internal sourceEventIds value exactly like the confirmed
// live data - reaches all the way through Creative DNA synthesis into a
// complete, five-image demo moodboard, with no paid API ever called.
const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
const synthesizeMocks = vi.hoisted(() => ({ synthesizeMiraV4CreativeDna: vi.fn() }));
const imageMocks = vi.hoisted(() => ({
  generateMoodboardImageViaOpenAI: vi.fn(),
  createLocalPlaceholderImage: vi.fn(),
}));
const envMocks = vi.hoisted(() => ({ env: { embeddingApiKey: "" } }));
const referencesMocks = vi.hoisted(() => ({ listShootVisualReferencesForClient: vi.fn() }));
const localFileStoreMocks = vi.hoisted(() => ({ isLocalFileStoreEnabled: vi.fn(() => false) }));

vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../_core/env", () => ({ ENV: envMocks.env }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: localFileStoreMocks.isLocalFileStoreEnabled }));
vi.mock("./visualReferences", async importOriginal => {
  const actual = await importOriginal<typeof import("./visualReferences")>();
  return { ...actual, listShootVisualReferencesForClient: referencesMocks.listShootVisualReferencesForClient };
});
vi.mock("../miraV4/creativeDna", async importOriginal => {
  const actual = await importOriginal<typeof import("../miraV4/creativeDna")>();
  return { ...actual, synthesizeMiraV4CreativeDna: synthesizeMocks.synthesizeMiraV4CreativeDna };
});
vi.mock("./openAiMoodboardImage", () => ({ generateMoodboardImageViaOpenAI: imageMocks.generateMoodboardImageViaOpenAI }));
vi.mock("../_core/imageGeneration", () => ({ createLocalPlaceholderImage: imageMocks.createLocalPlaceholderImage }));

// Real column objects (drizzle-orm's eq()/and()/desc() replaced with simple,
// stable descriptors keyed by column.name) - same approach as
// creativeDnaAdapter.test.ts and moodboardAdapter.test.ts, so the fake DB
// below evaluates the actual WHERE/ORDER BY predicates both adapters build.
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
import { generateShootCreativeDnaForConfirmedMemory } from "./creativeDnaAdapter";
import { generateShootMoodboardForCreativeDna } from "./moodboardAdapter";

function fakeTable(rows: Record<string, unknown>[]) {
  return {
    where: (condition: FakeCondition) => {
      const filtered = () => rows.filter(row => rowMatches(row, condition));
      return {
        orderBy: () => Object.assign(Promise.resolve(filtered()), { limit: (count: number) => Promise.resolve(filtered().slice(0, count)) }),
        limit: (count: number) => Promise.resolve(filtered().slice(0, count)),
      };
    },
  };
}

function createFakeDb(tables: {
  shoots: Record<string, unknown>[];
  summaries: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  creativeDna: Record<string, unknown>[];
  moodboard: Record<string, unknown>[];
}) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === schema.miraShoots) return fakeTable(tables.shoots);
        if (table === schema.miraDiscoverySummaries) return fakeTable(tables.summaries);
        if (table === schema.miraShootMemoryRevisions) return fakeTable(tables.revisions);
        if (table === schema.miraPhotographerProfiles) return fakeTable(tables.profiles);
        if (table === schema.miraShootCreativeDna) return fakeTable(tables.creativeDna);
        if (table === schema.miraShootMoodboard) return fakeTable(tables.moodboard);
        throw new Error("Unexpected table in fake db");
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === schema.miraShootCreativeDna) tables.creativeDna.push({ id: tables.creativeDna.length + 1, status: "pending", ...values });
        if (table === schema.miraShootMoodboard) tables.moodboard.push({ id: tables.moodboard.length + 1, status: "pending", ...values });
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: FakeCondition) => {
          const rows = table === schema.miraShootCreativeDna ? tables.creativeDna : table === schema.miraShootMoodboard ? tables.moodboard : null;
          if (rows) for (const row of rows) if (rowMatches(row, condition)) Object.assign(row, values);
          return Promise.resolve();
        },
      }),
    }),
  };
}

const shoot = { id: 42, photographerUserId: 9, title: "Voice QA" };
const photographer = { userId: 9, displayName: "John", photographyStyle: "editorial portraiture", areasOfExpertise: [] };

// A memory value carrying a real, non-UUID internal sourceEventIds string,
// exactly like the confirmed live data - never a UUID, never invented.
function memoryWithRealEventId() {
  const memory = emptyShootMemory();
  return {
    ...memory,
    identity: {
      ...memory.identity,
      profession: {
        value: "Portrait photographer client",
        kind: "explicit" as const,
        confidence: "high" as const,
        sourceEventIds: ["mira:call:session-42:turn-7"],
        clientConfirmed: true,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function seedCreativeDnaDb(snapshotJson: unknown) {
  return createFakeDb({
    shoots: [shoot],
    summaries: [{ id: "summary-1", shootId: 42, photographerUserId: 9, confirmedAt: new Date(), memoryVersion: 3, summaryText: "Confirmed summary" }],
    revisions: [{ id: 1, shootId: 42, version: 3, snapshotJson }],
    profiles: [photographer],
    creativeDna: [],
    moodboard: [],
  });
}

describe("full demo pipeline: confirmed memory (object or string, non-UUID sourceEventIds) -> Creative DNA -> moodboard", () => {
  beforeEach(() => {
    dbMocks.getDb.mockReset();
    synthesizeMocks.synthesizeMiraV4CreativeDna.mockReset();
    imageMocks.generateMoodboardImageViaOpenAI.mockReset();
    imageMocks.createLocalPlaceholderImage.mockReset().mockResolvedValue({ url: "/manus-storage/generated/local-placeholder-demo.svg" });
    referencesMocks.listShootVisualReferencesForClient.mockReset().mockResolvedValue([]);
    localFileStoreMocks.isLocalFileStoreEnabled.mockReturnValue(false);
    envMocks.env.embeddingApiKey = "";
  });

  it.each([
    ["already-parsed object", memoryWithRealEventId()],
    ["raw JSON string (MariaDB driver shape)", JSON.stringify(memoryWithRealEventId())],
  ])("reaches a complete, five-image demo moodboard when snapshotJson is a %s", async (_label, snapshotJson) => {
    const db = seedCreativeDnaDb(snapshotJson);
    dbMocks.getDb.mockResolvedValue(db);

    const creativeDnaRecord = await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
    expect(creativeDnaRecord?.status).toBe("complete");
    expect(creativeDnaRecord?.model).toBe("demo-local");
    expect(synthesizeMocks.synthesizeMiraV4CreativeDna).not.toHaveBeenCalled();

    const moodboard = await generateShootMoodboardForCreativeDna({
      shootId: 42,
      photographerUserId: 9,
      confirmedMemoryVersion: 3,
      creativeDna: (creativeDnaRecord as any).creativeDnaJson,
    });
    expect(moodboard?.status).toBe("complete");
    expect(moodboard?.renderStatus).toBe("complete");
    const images = moodboard?.referencesJson as Array<{ url: string | null }>;
    expect(images).toHaveLength(5);
    expect(images.every(image => image.url === "/manus-storage/generated/local-placeholder-demo.svg")).toBe(true);
    expect(imageMocks.createLocalPlaceholderImage).toHaveBeenCalledTimes(5);
    // Never called a paid API anywhere in the pipeline.
    expect(imageMocks.generateMoodboardImageViaOpenAI).not.toHaveBeenCalled();
    expect(synthesizeMocks.synthesizeMiraV4CreativeDna).not.toHaveBeenCalled();
  });
});
