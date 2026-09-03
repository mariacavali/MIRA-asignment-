import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));

import { recordShootScheduleResponse } from "./db";
import { emptyShootMemory } from "./memory";

function fakeDbWithPrevious(previous: { version: number; snapshotJson: unknown } | null, inserted: unknown[]) {
  return {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(previous ? [previous] : []) }) }) }) }),
    insert: () => ({ values: (values: unknown) => { inserted.push(values); return Promise.resolve(); } }),
  };
}

describe("recordShootScheduleResponse", () => {
  it("records a confirmed response as a new explicit, client-confirmed memory revision", async () => {
    const inserted: any[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDbWithPrevious(null, inserted));

    await recordShootScheduleResponse({ shootId: 1, photographerUserId: 9, response: "confirmed", note: null });

    expect(inserted).toHaveLength(1);
    const revision = inserted[0];
    expect(revision.version).toBe(1);
    expect(revision.source).toBe("system");
    expect(revision.snapshotJson.shootContext.scheduleConfirmation).toMatchObject({
      value: ["confirmed"],
      kind: "explicit",
      clientConfirmed: true,
    });
  });

  it("records a change request with the client's note, without disturbing genuine Discovery timingContext", async () => {
    const previous = emptyShootMemory();
    previous.shootContext.timingContext = {
      value: "Prefers morning light",
      kind: "explicit",
      confidence: "high",
      sourceEventIds: ["11111111-1111-4111-8111-111111111111"],
      clientConfirmed: true,
      updatedAt: new Date().toISOString(),
    };
    const inserted: any[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDbWithPrevious({ version: 3, snapshotJson: previous }, inserted));

    await recordShootScheduleResponse({
      shootId: 1,
      photographerUserId: 9,
      response: "change_requested",
      note: "Can we move it an hour later?",
    });

    const revision = inserted[0];
    expect(revision.version).toBe(4);
    expect(revision.snapshotJson.shootContext.scheduleConfirmation.value).toEqual([
      "change_requested",
      "Can we move it an hour later?",
    ]);
    // The field this reuses (shootContext.scheduleConfirmation) is deliberately
    // distinct from shootContext.timingContext - genuine Discovery-collected
    // timing content must survive untouched.
    expect(revision.snapshotJson.shootContext.timingContext.value).toBe("Prefers morning light");
  });
});
