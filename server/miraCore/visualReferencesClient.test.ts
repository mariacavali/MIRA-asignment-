import { describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn(), storagePut: vi.fn() }));
vi.mock("../storage", () => storageMocks);

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));

import { listShootVisualReferencesForClient, removeClientVisualReference } from "./visualReferences";

describe("listShootVisualReferencesForClient", () => {
  it("returns the client's own uploads with a signed URL, never internal analysis/storage fields", async () => {
    const createdAt = new Date();
    const rows = [{
      id: "ref-1",
      referencePurpose: "like" as const,
      clientDescription: "Warm tones",
      storageKey: "mira-shoots/1/2/references/ref-1.png",
      createdAt,
    }];
    dbMocks.getDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) }),
    });
    storageMocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/ref-1.png?sig=abc");

    const result = await listShootVisualReferencesForClient(2);
    expect(result).toEqual([{
      id: "ref-1",
      referencePurpose: "like",
      clientDescription: "Warm tones",
      createdAt,
      url: "https://storage.example/ref-1.png?sig=abc",
    }]);
  });

  it("falls back to a null url instead of throwing when signing the storage key fails", async () => {
    const rows = [{ id: "ref-1", referencePurpose: "other" as const, clientDescription: null, storageKey: "key", createdAt: new Date() }];
    dbMocks.getDb.mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) }) });
    storageMocks.storageGetSignedUrl.mockRejectedValue(new Error("storage unavailable"));

    const result = await listShootVisualReferencesForClient(2);
    expect(result[0].url).toBeNull();
  });
});

describe("removeClientVisualReference", () => {
  it("marks a matching, client-owned reference removed", async () => {
    dbMocks.getDb.mockResolvedValue({ update: () => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) }) });
    await expect(removeClientVisualReference({ shootId: 2, assetId: "ref-1" })).resolves.toBe(true);
  });

  it("refuses when no matching client-owned, not-already-removed reference exists", async () => {
    dbMocks.getDb.mockResolvedValue({ update: () => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 0 }]) }) }) });
    await expect(removeClientVisualReference({ shootId: 2, assetId: "missing" })).resolves.toBe(false);
  });
});
