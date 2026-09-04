import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: () => false }));
vi.mock("../_core/env", () => ({ ENV: { invitationLinkSecret: "synthetic-invitation-link-secret" } }));

import { getClientInvitation } from "./db";
import { createInvitationAccessToken } from "./invitationAccessLink";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "synthetic-invitation-link-secret";

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    invitation: {
      id: INVITATION_ID,
      tokenHash: (overrides.tokenHash as string) ?? "a".repeat(64),
      status: (overrides.status as string) ?? "active",
      expiresAt: (overrides.expiresAt as Date) ?? new Date("2026-10-17T00:00:00.000Z"),
      lastOpenedAt: overrides.lastOpenedAt !== undefined ? (overrides.lastOpenedAt as Date | null) : null,
      deliveryStatus: "sent",
      completedAt: null,
    },
    shoot: {
      scheduledAt: (overrides.scheduledAt as Date) ?? new Date("2026-10-15T10:00:00.000Z"),
      durationMinutes: (overrides.durationMinutes as number) ?? 60,
      status: (overrides.shootStatus as string) ?? "conversation_in_progress",
      title: "Founder portraits",
    },
    photographer: { businessName: "North Light" },
  };
}

function chain(result: unknown) {
  const node = {
    from: () => node,
    innerJoin: () => node,
    leftJoin: () => node,
    where: () => node,
    limit: () => Promise.resolve(result),
  };
  return node;
}

function fakeDb(...selectResults: unknown[]) {
  const select = vi.fn();
  for (const result of selectResults) select.mockReturnValueOnce(chain(result));
  return { select };
}

beforeEach(() => {
  dbMocks.getDb.mockReset();
});

describe("MIRA client room credential resolution", () => {
  it("still resolves the room for the original raw invitation token (regression)", async () => {
    dbMocks.getDb.mockResolvedValue(fakeDb([invitationRow()]));
    const state = await getClientInvitation("raw-token-value");
    expect(state?.invitation.id).toBe(INVITATION_ID);
  });

  it("resolves the same existing room through a valid signed access token", async () => {
    const tokenHash = "c".repeat(64);
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash, secret: SECRET });
    dbMocks.getDb.mockResolvedValue(fakeDb([{ tokenHash }], [invitationRow({ tokenHash })]));
    const state = await getClientInvitation(signed);
    expect(state?.invitation.id).toBe(INVITATION_ID);
  });

  it("rejects a tampered signed access token", async () => {
    const tokenHash = "c".repeat(64);
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash, secret: SECRET });
    const tampered = signed.slice(0, -1) + (signed.endsWith("A") ? "B" : "A");
    dbMocks.getDb.mockResolvedValue(fakeDb([{ tokenHash }]));
    await expect(getClientInvitation(tampered)).resolves.toBeNull();
  });

  it("rejects a signed access token for another invitation's tokenHash", async () => {
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: "c".repeat(64), secret: SECRET });
    // The invitation the id resolves to currently has a *different* tokenHash.
    dbMocks.getDb.mockResolvedValue(fakeDb([{ tokenHash: "z".repeat(64) }]));
    await expect(getClientInvitation(signed)).resolves.toBeNull();
  });

  it("rejects a signed access token after the invitation's token rotates, and a fresh one works", async () => {
    const originalHash = "c".repeat(64);
    const rotatedHash = "d".repeat(64);
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: originalHash, secret: SECRET });

    dbMocks.getDb.mockResolvedValue(fakeDb([{ tokenHash: rotatedHash }]));
    await expect(getClientInvitation(signed)).resolves.toBeNull();

    const reissued = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: rotatedHash, secret: SECRET });
    dbMocks.getDb.mockReset();
    dbMocks.getDb.mockResolvedValue(fakeDb([{ tokenHash: rotatedHash }], [invitationRow({ tokenHash: rotatedHash })]));
    const state = await getClientInvitation(reissued);
    expect(state?.invitation.id).toBe(INVITATION_ID);
  });

  it("marks a revoked invitation unavailable regardless of credential shape", async () => {
    dbMocks.getDb.mockResolvedValue(fakeDb([invitationRow({ status: "revoked" })]));
    const state = await getClientInvitation("raw-token-value");
    expect(state?.invitation.status).toBe("revoked");
  });

  it("keeps access valid through shoot end + 24h and expires immediately after", async () => {
    const recentShoot = new Date(Date.now() - 23 * 3_600_000);
    dbMocks.getDb.mockResolvedValueOnce(fakeDb([invitationRow({ scheduledAt: recentShoot, durationMinutes: 30 })]));
    const stillOpen = await getClientInvitation("raw-token-value");
    expect(stillOpen?.invitation.status).toBe("active");

    const longAgoShoot = new Date(Date.now() - 30 * 3_600_000);
    dbMocks.getDb.mockResolvedValueOnce(fakeDb([invitationRow({ scheduledAt: longAgoShoot, durationMinutes: 30 })]));
    const closed = await getClientInvitation("raw-token-value");
    expect(closed?.invitation.status).toBe("expired");
  });

  it("recalculates the live access window from the current schedule, following a reschedule automatically", async () => {
    const rescheduledToFuture = new Date(Date.now() + 5 * 86_400_000);
    dbMocks.getDb.mockResolvedValue(fakeDb([invitationRow({
      scheduledAt: rescheduledToFuture,
      durationMinutes: 60,
      expiresAt: new Date(Date.now() - 86_400_000), // stale stored value; must not be trusted
    })]));
    const state = await getClientInvitation("raw-token-value");
    expect(state?.invitation.status).toBe("active");
    expect(state!.invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// Regression coverage for the confirmed openInvitation live failure: the
// markOpened branch of getClientInvitation reused `row.invitation.lastOpenedAt
// ?? new Date()`. MariaDB/Drizzle can map the nullable lastOpenedAt column to
// a JS Date whose time value is NaN ("Invalid Date") instead of null - `??`
// does not catch that (an Invalid Date is not nullish) - so the update
// re-persisted the same Invalid Date, and the driver threw
// "Invalid time value" while serializing it.
function chainWithUpdate(selectResult: unknown[], onUpdate: (values: Record<string, unknown>) => void) {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    leftJoin: () => selectChain,
    where: () => selectChain,
    limit: () => Promise.resolve(selectResult),
  };
  return {
    select: () => selectChain,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        onUpdate(values);
        return { where: () => Promise.resolve() };
      },
    }),
  };
}

describe("MIRA client room open (markOpened) - MariaDB Invalid Date boundary on lastOpenedAt", () => {
  beforeEach(() => {
    dbMocks.getDb.mockReset();
  });

  it("uses the current valid Date when lastOpenedAt is null (never opened before)", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate([invitationRow({ lastOpenedAt: null })], values => updates.push(values)));
    const before = Date.now();
    const state = await getClientInvitation("raw-token-value", true);
    const after = Date.now();
    expect(state?.invitation.lastOpenedAt).toBeInstanceOf(Date);
    expect(state!.invitation.lastOpenedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(state!.invitation.lastOpenedAt!.getTime()).toBeLessThanOrEqual(after);
    expect(updates).toHaveLength(1);
    expect(updates[0].lastOpenedAt).toBe(state!.invitation.lastOpenedAt);
  });

  it("uses the current valid Date, without throwing, when the driver returns lastOpenedAt as an Invalid Date - the confirmed live failure mode", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate([invitationRow({ lastOpenedAt: new Date(NaN) })], values => updates.push(values)));
    const state = await getClientInvitation("raw-token-value", true);
    expect(state?.invitation.lastOpenedAt).toBeInstanceOf(Date);
    expect(Number.isFinite(state!.invitation.lastOpenedAt!.getTime())).toBe(true);
    expect(Number.isFinite((updates[0].lastOpenedAt as Date).getTime())).toBe(true);
  });

  it("preserves an existing valid lastOpenedAt across a later open, instead of overwriting it", async () => {
    const firstOpened = new Date("2026-09-01T09:00:00.000Z");
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate([invitationRow({ lastOpenedAt: firstOpened })], values => updates.push(values)));
    const state = await getClientInvitation("raw-token-value", true);
    expect(state?.invitation.lastOpenedAt).toEqual(firstOpened);
    expect(updates[0].lastOpenedAt).toEqual(firstOpened);
  });

  it("opens an active invitation successfully - no thrown error for the MariaDB Invalid Date boundary", async () => {
    dbMocks.getDb.mockResolvedValue(chainWithUpdate([invitationRow({ lastOpenedAt: new Date(NaN) })], () => {}));
    await expect(getClientInvitation("raw-token-value", true)).resolves.not.toBeNull();
  });

  it("never attempts to mark an inactive (revoked) invitation opened - existing behavior is unchanged", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate([invitationRow({ status: "revoked", lastOpenedAt: new Date(NaN) })], values => updates.push(values)));
    const state = await getClientInvitation("raw-token-value", true);
    expect(state?.invitation.status).toBe("revoked");
    expect(updates).toHaveLength(0);
  });

  it("never attempts to mark an inactive (expired) invitation opened - existing behavior is unchanged", async () => {
    const updates: Record<string, unknown>[] = [];
    const longAgoShoot = new Date(Date.now() - 30 * 3_600_000);
    dbMocks.getDb.mockResolvedValue(chainWithUpdate(
      [invitationRow({ scheduledAt: longAgoShoot, durationMinutes: 30, lastOpenedAt: new Date(NaN) })],
      values => updates.push(values),
    ));
    const state = await getClientInvitation("raw-token-value", true);
    expect(state?.invitation.status).toBe("expired");
    expect(updates).toHaveLength(0);
  });
});
