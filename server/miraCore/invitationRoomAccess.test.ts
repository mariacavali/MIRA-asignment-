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
      lastOpenedAt: null,
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
