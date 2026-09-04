import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
const storageMocks = vi.hoisted(() => ({ storagePut: vi.fn(), storageGetSignedUrl: vi.fn() }));
const localFileStoreMocks = vi.hoisted(() => ({
  isLocalFileStoreEnabled: vi.fn(() => false),
  listLocalReferences: vi.fn(),
  createLocalReference: vi.fn(),
  removeLocalReference: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../storage", () => ({ storagePut: storageMocks.storagePut, storageGetSignedUrl: storageMocks.storageGetSignedUrl }));
vi.mock("../localFileStore", () => ({
  isLocalFileStoreEnabled: localFileStoreMocks.isLocalFileStoreEnabled,
  listLocalReferences: localFileStoreMocks.listLocalReferences,
  createLocalReference: localFileStoreMocks.createLocalReference,
  removeLocalReference: localFileStoreMocks.removeLocalReference,
}));

// Same real-column-object approach as moodboardAdapter.test.ts/
// creativeDnaAdapter.test.ts: eq/and/ne replaced with simple, stable
// descriptors keyed by column.name, so the fake DB below evaluates the
// actual WHERE predicates visualReferences.ts builds (shootId, uploaderRole,
// status <> removed) instead of pretending every query matches. Kept in its
// own file (rather than merged into visualReferences.test.ts) so this
// module-wide drizzle-orm/db/storage mock never touches that file's
// source-text and real-schema assertions.
type FakeCondition =
  | { kind: "eq"; field: string; value: unknown }
  | { kind: "ne"; field: string; value: unknown }
  | { kind: "and"; conditions: FakeCondition[] };
vi.mock("drizzle-orm", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: { name: string }, value: unknown): FakeCondition => ({ kind: "eq", field: column.name, value }),
    ne: (column: { name: string }, value: unknown): FakeCondition => ({ kind: "ne", field: column.name, value }),
    and: (...conditions: FakeCondition[]): FakeCondition => ({ kind: "and", conditions }),
  };
});

function rowMatches(row: Record<string, unknown>, condition: FakeCondition): boolean {
  if (condition.kind === "and") return condition.conditions.every(inner => rowMatches(row, inner));
  if (condition.kind === "ne") return row[condition.field] !== condition.value;
  return row[condition.field] === condition.value;
}

import * as schema from "../../drizzle/schema";
import { MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES, uploadShootVisualReference } from "./visualReferences";

// Minimal 8-byte PNG signature, long enough to pass decodeAndValidateReferenceImage's
// real file-type check without needing a fully valid PNG bitstream.
const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

function uploadInput(overrides: Partial<{ clientDescription: string | null; referencePurpose: string }> = {}) {
  return {
    originalName: "reference.png",
    mimeType: "image/png" as const,
    base64: PNG_BASE64,
    clientDescription: overrides.clientDescription ?? "A reference",
    evidenceKind: "observed" as const,
    referencePurpose: (overrides.referencePurpose ?? "like") as any,
  };
}

function createFakeReferencesDb(seedShoots: Record<string, unknown>[]) {
  const references: Record<string, unknown>[] = [];
  let nextId = 1;
  return {
    references,
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: FakeCondition) => {
          if (table === schema.miraShoots) {
            const matched = seedShoots.filter(row => rowMatches(row, condition));
            return { limit: (count: number) => Promise.resolve(matched.slice(0, count)) };
          }
          if (table === schema.miraShootVisualReferences) {
            const matched = references.filter(row => rowMatches(row, condition));
            return Promise.resolve([{ total: matched.length }]);
          }
          throw new Error("Unexpected table in fake references db");
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === schema.miraShootVisualReferences) references.push({ id: `ref-${nextId++}`, status: "uploaded", ...values });
        return Promise.resolve();
      },
    }),
  };
}

describe("exactly-five client visual reference limit (shoot pipeline)", () => {
  beforeEach(() => {
    dbMocks.getDb.mockReset();
    storageMocks.storagePut.mockReset().mockResolvedValue({ key: "fake-key", url: "https://storage.example/fake-key" });
    localFileStoreMocks.isLocalFileStoreEnabled.mockReturnValue(false);
  });

  it("exposes the limit as exactly five", () => {
    expect(MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES).toBe(5);
  });

  it("allows exactly five client references for one shoot, then rejects the sixth", async () => {
    const db = createFakeReferencesDb([{ id: 3, photographerUserId: 9 }]);
    dbMocks.getDb.mockResolvedValue(db);
    for (let index = 0; index < 5; index += 1) {
      const created = await uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "client", input: uploadInput() });
      expect(created).not.toBeNull();
    }
    await expect(uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "client", input: uploadInput() }))
      .rejects.toThrow(/up to 5 client visual references/);
    expect(db.references).toHaveLength(5);
  });

  it("does not let a photographer's own reference count toward - or be limited by - the client cap", async () => {
    const db = createFakeReferencesDb([{ id: 3, photographerUserId: 9 }]);
    dbMocks.getDb.mockResolvedValue(db);
    for (let index = 0; index < 5; index += 1) {
      await uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "client", input: uploadInput() });
    }
    // The client cap is full, but a photographer upload is a different
    // uploaderRole and must still succeed (bounded only by the separate,
    // pre-existing combined shoot total).
    const photographerUpload = await uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "photographer", input: uploadInput() });
    expect(photographerUpload).not.toBeNull();
  });

  it("shoot-level data isolation: five references on one shoot never fill another shoot's limit", async () => {
    const db = createFakeReferencesDb([{ id: 3, photographerUserId: 9 }, { id: 4, photographerUserId: 9 }]);
    dbMocks.getDb.mockResolvedValue(db);
    for (let index = 0; index < 5; index += 1) {
      await uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "client", input: uploadInput() });
    }
    // Shoot 4 has never received a reference, so it must still accept one -
    // proves the cap is scoped per shoot, not global to the photographer.
    const created = await uploadShootVisualReference({ shootId: 4, photographerUserId: 9, uploaderRole: "client", input: uploadInput() });
    expect(created).not.toBeNull();
    expect(db.references.filter(reference => reference.shootId === 4)).toHaveLength(1);
    expect(db.references.filter(reference => reference.shootId === 3)).toHaveLength(5);
  });
});

describe("exactly-five client visual reference limit (local/demo fallback)", () => {
  beforeEach(() => {
    localFileStoreMocks.isLocalFileStoreEnabled.mockReturnValue(true);
    localFileStoreMocks.listLocalReferences.mockReset();
    localFileStoreMocks.createLocalReference.mockReset().mockImplementation(async (input: Record<string, unknown>) => ({ ...input, createdAt: new Date().toISOString() }));
  });

  it("rejects a sixth client reference in local/demo mode the same way as production", async () => {
    localFileStoreMocks.listLocalReferences.mockResolvedValue(new Array(5).fill({ id: "existing" }));
    await expect(uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "client", input: uploadInput() }))
      .rejects.toThrow(/up to 5 client visual references/);
    expect(localFileStoreMocks.createLocalReference).not.toHaveBeenCalled();
  });

  it("allows the upload when fewer than five references exist locally", async () => {
    localFileStoreMocks.listLocalReferences.mockResolvedValue(new Array(4).fill({ id: "existing" }));
    const created = await uploadShootVisualReference({ shootId: 3, photographerUserId: 9, uploaderRole: "client", input: uploadInput() });
    expect(created).not.toBeNull();
    expect(localFileStoreMocks.createLocalReference).toHaveBeenCalledTimes(1);
  });
});
