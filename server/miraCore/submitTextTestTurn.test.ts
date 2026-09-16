import { beforeEach, describe, expect, it, vi } from "vitest";
import { miraCallEvents, miraClientInvitations, miraDiscoverySummaries, miraShoots } from "../../drizzle/schema";

// Regression coverage for the confirmed production bug: completing the text
// fallback (submitTextTestTurn's final turn) inserted no Discovery summary and
// never advanced miraShoots.roomState, so a client who used "Text MIRA" -
// whether by choice or after a voice connection failure - silently never
// reached Creative DNA/moodboard generation. The room appeared to stall after
// the last answer with no visible error. See also memory.test.ts's coverage
// of the eight-answer script satisfying evaluateDiscoveryGate.
const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: () => false }));
vi.mock("../_core/env", () => ({ ENV: { invitationLinkSecret: "synthetic-invitation-link-secret" } }));

import { submitTextTestTurn } from "./db";

const SHOOT_ID = 42;
const PHOTOGRAPHER_ID = 7;
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";

function chain(result: unknown) {
  const node: any = {
    from: () => node,
    innerJoin: () => node,
    where: () => node,
    orderBy: () => node,
    limit: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return node;
}

function fakeTransactionalDb(selectResults: unknown[][], recordInsert: (table: unknown, values: unknown) => void, recordUpdate: (table: unknown, values: unknown) => void) {
  let call = 0;
  const tx = {
    select: () => chain(selectResults[call++] ?? []),
    insert: (table: unknown) => ({ values: (values: unknown) => { recordInsert(table, values); return Promise.resolve(); } }),
    update: (table: unknown) => ({ set: (values: unknown) => { recordUpdate(table, values); return { where: () => Promise.resolve() }; } }),
  };
  return { transaction: (fn: (tx: unknown) => unknown) => fn(tx) };
}

beforeEach(() => {
  dbMocks.getDb.mockReset();
});

describe("submitTextTestTurn - completing the text fallback (database mode)", () => {
  it("on the final (eighth) answer, inserts a confirmed Discovery summary and advances roomState to discovery_confirmed", async () => {
    const inserts: { table: unknown; values: any }[] = [];
    const updates: { table: unknown; values: any }[] = [];
    const sessionInvitationRow = {
      session: {
        id: SESSION_ID,
        shootId: SHOOT_ID,
        photographerUserId: PHOTOGRAPHER_ID,
        turnCount: 7,
        allowedSeconds: 3600,
        startedAt: new Date(Date.now() - 60_000),
      },
      invitation: { id: INVITATION_ID, status: "active", deliveryStatus: "preparation_in_progress" },
    };
    const previousMemoryRevision = { version: 7, snapshotJson: null };
    const clientAnswerEvents = Array.from({ length: 8 }, (_, index) => ({ content: `Answer ${index + 1}` }));

    dbMocks.getDb.mockResolvedValue(fakeTransactionalDb(
      [
        [sessionInvitationRow], // session+invitation lookup
        [{ ordinal: 15 }], // latest event ordinal
        [previousMemoryRevision], // previous memory revision
        clientAnswerEvents, // all client answers for the completed session
      ],
      (table, values) => inserts.push({ table, values }),
      (table, values) => updates.push({ table, values }),
    ));

    const result = await submitTextTestTurn({ token: "raw-token-value", sessionId: SESSION_ID, answer: "Answer 8" });

    expect(result).toMatchObject({ shootId: SHOOT_ID, turnCount: 8, complete: true });

    const summaryInsert = inserts.find(entry => entry.table === miraDiscoverySummaries);
    expect(summaryInsert).toBeDefined();
    expect(summaryInsert!.values).toMatchObject({
      shootId: SHOOT_ID,
      sessionId: SESSION_ID,
      photographerUserId: PHOTOGRAPHER_ID,
      memoryVersion: 8,
    });
    expect(summaryInsert!.values.confirmedAt).toBeInstanceOf(Date);
    expect(summaryInsert!.values.summaryText).toContain("Answer 1");
    expect(summaryInsert!.values.summaryText).toContain("Answer 8");

    const roomStateUpdate = updates.find(entry => entry.table === miraShoots);
    expect(roomStateUpdate).toBeDefined();
    expect(roomStateUpdate!.values).toEqual({ roomState: "discovery_confirmed" });

    const invitationUpdate = updates.find(entry => entry.table === miraClientInvitations);
    expect(invitationUpdate!.values).toMatchObject({ status: "completed", deliveryStatus: "completed" });
  });

  it("on a non-final answer, does not insert a Discovery summary or touch roomState", async () => {
    const inserts: { table: unknown; values: any }[] = [];
    const updates: { table: unknown; values: any }[] = [];
    const sessionInvitationRow = {
      session: {
        id: SESSION_ID,
        shootId: SHOOT_ID,
        photographerUserId: PHOTOGRAPHER_ID,
        turnCount: 2,
        allowedSeconds: 3600,
        startedAt: new Date(Date.now() - 60_000),
      },
      invitation: { id: INVITATION_ID, status: "active", deliveryStatus: "preparation_in_progress" },
    };
    const previousMemoryRevision = { version: 2, snapshotJson: null };

    dbMocks.getDb.mockResolvedValue(fakeTransactionalDb(
      [
        [sessionInvitationRow],
        [{ ordinal: 4 }],
        [previousMemoryRevision],
      ],
      (table, values) => inserts.push({ table, values }),
      (table, values) => updates.push({ table, values }),
    ));

    const result = await submitTextTestTurn({ token: "raw-token-value", sessionId: SESSION_ID, answer: "Answer 3" });

    expect(result).toMatchObject({ complete: false });
    expect(inserts.some(entry => entry.table === miraDiscoverySummaries)).toBe(false);
    expect(updates.some(entry => entry.table === miraShoots)).toBe(false);
  });
});
