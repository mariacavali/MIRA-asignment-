import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyShootMemory } from "./memory";

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
const synthesizeMocks = vi.hoisted(() => ({ synthesizeMiraV4CreativeDna: vi.fn() }));
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

// Real column objects (drizzle-orm's eq()/and()/desc() replaced below with
// simple, stable descriptors keyed by column.name), so the fake DB actually
// evaluates the WHERE/ORDER BY predicates creativeDnaAdapter.ts builds
// against in-memory rows, instead of pretending every query matches. That's
// what makes the isolation tests below trustworthy.
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
import {
  buildInspirationFromVisualReferences,
  buildShootCreativeDnaSource,
  generateShootCreativeDnaForConfirmedMemory,
  getShootCreativeDnaForOwner,
} from "./creativeDnaAdapter";

function fakeTable(rows: Record<string, unknown>[]) {
  return {
    where: (condition: FakeCondition) => {
      const filtered = () => rows.filter(row => rowMatches(row, condition));
      return {
        // getShootCreativeDnaForOwner awaits the query right after
        // .orderBy() with no .limit() call, so this must itself be
        // awaitable while still supporting an optional chained .limit().
        // Every seeded fixture in this file has at most one row per WHERE
        // match, so actual field-level sort order is never load-bearing.
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
}) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === schema.miraShoots) return fakeTable(tables.shoots);
        if (table === schema.miraDiscoverySummaries) return fakeTable(tables.summaries);
        if (table === schema.miraShootMemoryRevisions) return fakeTable(tables.revisions);
        if (table === schema.miraPhotographerProfiles) return fakeTable(tables.profiles);
        if (table === schema.miraShootCreativeDna) return fakeTable(tables.creativeDna);
        throw new Error("Unexpected table in fake db");
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === schema.miraShootCreativeDna) tables.creativeDna.push({ id: tables.creativeDna.length + 1, status: "pending", ...values });
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: FakeCondition) => {
          if (table === schema.miraShootCreativeDna) for (const row of tables.creativeDna) if (rowMatches(row, condition)) Object.assign(row, values);
          return Promise.resolve();
        },
      }),
    }),
  };
}

function seedDb() {
  return createFakeDb({
    shoots: [{ id: 42, photographerUserId: 9, title: "Voice QA" }],
    summaries: [{ id: "summary-1", shootId: 42, photographerUserId: 9, confirmedAt: new Date(), memoryVersion: 3, summaryText: "Confirmed summary" }],
    revisions: [{ id: 1, shootId: 42, version: 3, snapshotJson: { identity: {}, brand: {}, expression: {}, shootContext: {} } }],
    profiles: [{ userId: 9, displayName: "John", photographyStyle: "editorial portraiture", areasOfExpertise: [] }],
    creativeDna: [],
  });
}

const shoot = {
  id: 42,
  photographerUserId: 9,
  title: "Voice QA",
  shootType: "personal brand",
  clientName: "Anna",
  clientEmail: "anna@example.test",
  scheduledAt: new Date("2026-09-04T12:00:00.000Z"),
  timezone: "Europe/Amsterdam",
  intendedUse: "website",
  location: "home studio",
  durationMinutes: 60,
  photographerNotes: null,
  roomState: "preparation_active",
};

const photographer = {
  userId: 9,
  displayName: "John",
  businessName: "John Studio",
  bio: "Portrait photographer",
  photographyStyle: "editorial portraiture",
  areasOfExpertise: ["editorial portraiture"],
  websiteUrl: null,
  instagramUrl: null,
};

describe("references entering Creative DNA input (pure builder)", () => {
  it("leaves inspiration empty when the client shared no references, exactly as before", () => {
    expect(buildInspirationFromVisualReferences([])).toEqual({
      imageReference: null,
      userExplanation: null,
      influenceRule: "supporting_evidence_only",
    });
  });

  it("prefers a 'direction to explore' reference as the primary image, over 'like' or arrival order", () => {
    const inspiration = buildInspirationFromVisualReferences([
      { id: "r1", referencePurpose: "like", clientDescription: "Warm editorial light", url: "https://cdn.example/r1.jpg" },
      { id: "r2", referencePurpose: "direction_to_explore", clientDescription: "This exact mood", url: "https://cdn.example/r2.jpg" },
    ]);
    expect(inspiration.imageReference).toBe("https://cdn.example/r2.jpg");
  });

  it("digests all five references' purpose and description into userExplanation, in order", () => {
    const references = Array.from({ length: 5 }, (_, index) => ({
      id: `r${index + 1}`,
      referencePurpose: index === 0 ? "direction_to_explore" : "like",
      clientDescription: `Reference number ${index + 1}`,
      url: `https://cdn.example/r${index + 1}.jpg`,
    }));
    const inspiration = buildInspirationFromVisualReferences(references);
    expect(inspiration.userExplanation).toContain("[1]");
    expect(inspiration.userExplanation).toContain("Reference number 1");
    expect(inspiration.userExplanation).toContain("[5]");
    expect(inspiration.userExplanation).toContain("Reference number 5");
  });

  it("never emits an unusably long imageReference URL that would fail the Creative DNA schema", () => {
    const inspiration = buildInspirationFromVisualReferences([
      { id: "r1", referencePurpose: "like", clientDescription: "test", url: `https://cdn.example/${"x".repeat(2000)}.jpg` },
    ]);
    expect(inspiration.imageReference).toBeNull();
  });

  it("wires visual references through buildShootCreativeDnaSource into the real MiraV4CreativeDnaSource shape", () => {
    const source = buildShootCreativeDnaSource({
      shoot: shoot as any,
      photographer: photographer as any,
      memory: emptyShootMemory(),
      summaryText: "Anna wants a calm, credible editorial portrait for her website.",
      visualReferences: [
        { id: "r1", referencePurpose: "direction_to_explore", clientDescription: "This mood, exactly", url: "https://cdn.example/r1.jpg" },
      ],
    });
    expect(source.inspiration.imageReference).toBe("https://cdn.example/r1.jpg");
    expect(source.inspiration.userExplanation).toContain("This mood, exactly");
    expect(source.inspiration.influenceRule).toBe("supporting_evidence_only");
  });
});

describe("generateShootCreativeDnaForConfirmedMemory (demo fallback + wiring)", () => {
  beforeEach(() => {
    dbMocks.getDb.mockReset();
    synthesizeMocks.synthesizeMiraV4CreativeDna.mockReset();
    referencesMocks.listShootVisualReferencesForClient.mockReset().mockResolvedValue([]);
    localFileStoreMocks.isLocalFileStoreEnabled.mockReturnValue(false);
    envMocks.env.embeddingApiKey = "";
  });

  it("synthesizes locally without calling the paid LLM when no OpenAI key is configured", async () => {
    dbMocks.getDb.mockResolvedValue(seedDb());
    const result = await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
    expect(result?.status).toBe("complete");
    expect(result?.model).toBe("demo-local");
    expect(synthesizeMocks.synthesizeMiraV4CreativeDna).not.toHaveBeenCalled();
    expect((result as any)?.creativeDnaJson?.creativeDirection?.creativeSummary).toContain("locally");
  });

  it("calls the real synthesis with an inspiration image URL when references and a key are present", async () => {
    envMocks.env.embeddingApiKey = "sk-configured";
    referencesMocks.listShootVisualReferencesForClient.mockResolvedValue([
      { id: "r1", referencePurpose: "direction_to_explore", clientDescription: "This mood", url: "https://cdn.example/r1.jpg" },
    ]);
    synthesizeMocks.synthesizeMiraV4CreativeDna.mockResolvedValue({ creativeDna: { schemaVersion: "1.0" }, model: "gpt-5-mini" });
    dbMocks.getDb.mockResolvedValue(seedDb());
    await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
    expect(synthesizeMocks.synthesizeMiraV4CreativeDna).toHaveBeenCalledWith(expect.objectContaining({
      inspirationImageUrl: "https://cdn.example/r1.jpg",
    }));
  });

  it("is idempotent once already complete for a given confirmed memory version - never resynthesizes", async () => {
    envMocks.env.embeddingApiKey = "sk-configured";
    synthesizeMocks.synthesizeMiraV4CreativeDna.mockResolvedValue({ creativeDna: { schemaVersion: "1.0" }, model: "gpt-5-mini" });
    const db = seedDb();
    dbMocks.getDb.mockResolvedValue(db);
    await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
    synthesizeMocks.synthesizeMiraV4CreativeDna.mockClear();
    const second = await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
    expect(second?.status).toBe("complete");
    // The paid LLM boundary is what idempotency actually protects - the
    // pre-existing lookups it depends on (shoot, summary, references) are
    // cheap reads that already ran again before the short-circuit, same as
    // the rest of this pipeline's established idempotency contract.
    expect(synthesizeMocks.synthesizeMiraV4CreativeDna).not.toHaveBeenCalled();
  });

  describe("shoot-level data isolation (getShootCreativeDnaForOwner)", () => {
    it("never returns another photographer's shoot Creative DNA", async () => {
      const db = seedDb();
      dbMocks.getDb.mockResolvedValue(db);
      await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
      const rows = await getShootCreativeDnaForOwner(999, 42);
      expect(rows).toHaveLength(0);
    });

    it("never returns a different shoot's Creative DNA for the same photographer", async () => {
      const db = seedDb();
      dbMocks.getDb.mockResolvedValue(db);
      await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
      const rows = await getShootCreativeDnaForOwner(9, 43);
      expect(rows).toHaveLength(0);
    });

    it("returns the completed record to its own owning photographer", async () => {
      const db = seedDb();
      dbMocks.getDb.mockResolvedValue(db);
      await generateShootCreativeDnaForConfirmedMemory({ shootId: 42, photographerUserId: 9 });
      const rows = await getShootCreativeDnaForOwner(9, 42);
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).status).toBe("complete");
    });
  });
});
