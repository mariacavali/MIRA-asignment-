import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));

import { markShootReadyToShoot } from "./db";

function fakeUpdateResult(affectedRows: number) {
  return {
    update: () => ({
      set: () => ({
        where: () => Promise.resolve([{ affectedRows }]),
      }),
    }),
  };
}

describe("markShootReadyToShoot", () => {
  it("marks the shoot ready when the owned, preparation-active shoot is matched", async () => {
    dbMocks.getDb.mockResolvedValue(fakeUpdateResult(1));
    await expect(markShootReadyToShoot({ photographerUserId: 1, shootId: 9 })).resolves.toBe(true);
  });

  it("refuses when the shoot isn't owned or hasn't reached preparation_active yet", async () => {
    dbMocks.getDb.mockResolvedValue(fakeUpdateResult(0));
    await expect(markShootReadyToShoot({ photographerUserId: 1, shootId: 9 })).resolves.toBe(false);
  });
});
