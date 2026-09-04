import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the confirmed createRealtimeCall live failure:
// startOrResumeRealtimeSession (server/miraCore/db.ts) reused
// `state.invitation.consentAcknowledgedAt ?? now` and
// `state.invitation.preparationStartedAt ?? now`. MariaDB/Drizzle can map
// these nullable timestamp columns to a JS Date whose time value is NaN
// ("Invalid Date") instead of null - `??` does not catch that - so the
// subsequent update re-persisted the Invalid Date and the driver threw
// "Invalid time value" before buildRealtimeSessionConfig or the OpenAI
// request ever ran.
const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: () => false }));
vi.mock("../_core/env", () => ({ ENV: { invitationLinkSecret: "synthetic-invitation-link-secret" } }));

import * as schema from "../../drizzle/schema";
import { startOrResumeRealtimeSession } from "./db";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const SHOOT_ID = 42;

function invitationJoinRow(overrides: { consentAcknowledgedAt?: Date | null; preparationStartedAt?: Date | null; lastOpenedAt?: Date | null } = {}) {
  return {
    invitation: {
      id: INVITATION_ID,
      shootId: SHOOT_ID,
      tokenHash: "a".repeat(64),
      status: "active" as const,
      deliveryStatus: "sent" as const,
      expiresAt: new Date("2026-10-17T00:00:00.000Z"),
      consentAcknowledgedAt: overrides.consentAcknowledgedAt !== undefined ? overrides.consentAcknowledgedAt : null,
      lastOpenedAt: overrides.lastOpenedAt !== undefined ? overrides.lastOpenedAt : null,
      preparationStartedAt: overrides.preparationStartedAt !== undefined ? overrides.preparationStartedAt : null,
      completedAt: null,
    },
    shoot: {
      id: SHOOT_ID,
      photographerUserId: 9,
      scheduledAt: new Date("2026-10-15T10:00:00.000Z"),
      durationMinutes: 60,
      status: "conversation_in_progress" as const,
      roomState: "welcome" as const,
      callAllowanceSeconds: 1200,
      title: "Founder portraits",
    },
    photographer: { businessName: "North Light" },
  };
}

// A minimal, self-contained fake DB covering exactly the calls
// startOrResumeRealtimeSession makes (via getClientInvitation and its own
// transaction): the joined invitation/shoot select, the markOpened update,
// the "existing active session" select, the new session insert, the
// invitation update this fix targets, the shoot update, and the final
// re-select of the created session.
function fakeDb(config: {
  invitationRow: ReturnType<typeof invitationJoinRow>;
  onInvitationUpdate: (values: Record<string, unknown>) => void;
}) {
  let callSessionSelectCount = 0;
  const node = (table: unknown) => ({
    innerJoin: () => node(table),
    leftJoin: () => node(table),
    where: () => ({
      orderBy: () => ({ limit: () => resolveFor(table) }),
      limit: () => resolveFor(table),
    }),
  });
  function resolveFor(table: unknown) {
    if (table === schema.miraClientInvitations) return Promise.resolve([config.invitationRow]);
    if (table === schema.miraCallSessions) {
      callSessionSelectCount += 1;
      // 1st call inside the transaction: "is there already an active
      // session" check (none, for these tests). 2nd call: the final
      // re-select of the just-inserted session.
      return Promise.resolve(callSessionSelectCount === 1
        ? []
        : [{ id: "new-session-id", invitationId: INVITATION_ID, shootId: SHOOT_ID, mode: "realtime", status: "active", allowedSeconds: 1200 }]);
    }
    throw new Error(`Unexpected table in fake db select: ${String(table)}`);
  }
  const db: any = {
    select: () => ({ from: (table: unknown) => node(table) }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table === schema.miraClientInvitations) config.onInvitationUpdate(values);
        return { where: () => Promise.resolve() };
      },
    }),
    insert: () => ({ values: () => Promise.resolve() }),
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
  };
  return db;
}

describe("startOrResumeRealtimeSession - MariaDB Invalid Date boundary on consentAcknowledgedAt/preparationStartedAt", () => {
  beforeEach(() => {
    dbMocks.getDb.mockReset();
  });

  it("uses the current valid Date for consentAcknowledgedAt when it is null", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDb({ invitationRow: invitationJoinRow({ consentAcknowledgedAt: null }), onInvitationUpdate: values => updates.push(values) }));
    const before = Date.now();
    await startOrResumeRealtimeSession("raw-token-value");
    const after = Date.now();
    const consentAcknowledgedAt = updates.at(-1)!.consentAcknowledgedAt as Date;
    expect(consentAcknowledgedAt).toBeInstanceOf(Date);
    expect(consentAcknowledgedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(consentAcknowledgedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("uses the current valid Date for consentAcknowledgedAt, without throwing, when the driver returns an Invalid Date - the confirmed live failure mode", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDb({ invitationRow: invitationJoinRow({ consentAcknowledgedAt: new Date(NaN) }), onInvitationUpdate: values => updates.push(values) }));
    await startOrResumeRealtimeSession("raw-token-value");
    expect(Number.isFinite((updates.at(-1)!.consentAcknowledgedAt as Date).getTime())).toBe(true);
  });

  it("preserves an existing valid consentAcknowledgedAt instead of overwriting it", async () => {
    const firstConsent = new Date("2026-09-01T09:00:00.000Z");
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDb({ invitationRow: invitationJoinRow({ consentAcknowledgedAt: firstConsent }), onInvitationUpdate: values => updates.push(values) }));
    await startOrResumeRealtimeSession("raw-token-value");
    expect(updates.at(-1)!.consentAcknowledgedAt).toEqual(firstConsent);
  });

  it("uses the current valid Date for preparationStartedAt when it is null", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDb({ invitationRow: invitationJoinRow({ preparationStartedAt: null }), onInvitationUpdate: values => updates.push(values) }));
    const before = Date.now();
    await startOrResumeRealtimeSession("raw-token-value");
    const after = Date.now();
    const preparationStartedAt = updates.at(-1)!.preparationStartedAt as Date;
    expect(preparationStartedAt).toBeInstanceOf(Date);
    expect(preparationStartedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(preparationStartedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("uses the current valid Date for preparationStartedAt, without throwing, when the driver returns an Invalid Date - the confirmed live failure mode", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDb({ invitationRow: invitationJoinRow({ preparationStartedAt: new Date(NaN) }), onInvitationUpdate: values => updates.push(values) }));
    await startOrResumeRealtimeSession("raw-token-value");
    expect(Number.isFinite((updates.at(-1)!.preparationStartedAt as Date).getTime())).toBe(true);
  });

  it("preserves an existing valid preparationStartedAt instead of overwriting it", async () => {
    const firstPreparation = new Date("2026-09-02T09:00:00.000Z");
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(fakeDb({ invitationRow: invitationJoinRow({ preparationStartedAt: firstPreparation }), onInvitationUpdate: values => updates.push(values) }));
    await startOrResumeRealtimeSession("raw-token-value");
    expect(updates.at(-1)!.preparationStartedAt).toEqual(firstPreparation);
  });

  it("completes successfully without throwing 'Invalid time value' when both timestamps are Invalid Dates", async () => {
    dbMocks.getDb.mockResolvedValue(fakeDb({
      invitationRow: invitationJoinRow({ consentAcknowledgedAt: new Date(NaN), preparationStartedAt: new Date(NaN) }),
      onInvitationUpdate: () => {},
    }));
    const result = await startOrResumeRealtimeSession("raw-token-value");
    expect(result).not.toBeNull();
    expect(result!.session.id).toBe("new-session-id");
  });

  it("still returns null for an inactive/unauthorized invitation - existing authorization behavior is unchanged", async () => {
    dbMocks.getDb.mockResolvedValue(fakeDb({
      invitationRow: { ...invitationJoinRow(), invitation: { ...invitationJoinRow().invitation, status: "revoked" as const } },
      onInvitationUpdate: () => {},
    }));
    const result = await startOrResumeRealtimeSession("raw-token-value");
    expect(result).toBeNull();
  });
});
