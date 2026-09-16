import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the confirmed production failure: acknowledgeClientInvitation
// had no database-mode branch at all and unconditionally returned null whenever
// isLocalFileStoreEnabled() was false, so every real (non-demo) client hit a 404
// trying to accept the Shoot Room consent step, blocking the entire client journey.
const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: () => false, acceptLocalInvitation: vi.fn() }));
vi.mock("../_core/env", () => ({ ENV: { invitationLinkSecret: "synthetic-invitation-link-secret" } }));

import { acknowledgeClientInvitation } from "./db";

const INVITATION_ID = "22222222-2222-4222-8222-222222222222";

function chainWithUpdate(selectResult: unknown[], onUpdate: (values: Record<string, unknown>) => void) {
  const selectChain = {
    from: () => selectChain,
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

beforeEach(() => {
  dbMocks.getDb.mockReset();
});

describe("acknowledgeClientInvitation - database mode", () => {
  it("accepts a valid raw token, recording consent, delivery status, and preparation start", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate(
      [{ id: INVITATION_ID, status: "active", lastOpenedAt: null, preparationStartedAt: null }],
      values => updates.push(values),
    ));
    const before = Date.now();
    const result = await acknowledgeClientInvitation("raw-token-value");
    const after = Date.now();

    expect(result).toEqual({ accepted: true });
    expect(updates).toHaveLength(1);
    const update = updates[0];
    expect(update.consentAcknowledgedAt).toBeInstanceOf(Date);
    expect((update.consentAcknowledgedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((update.consentAcknowledgedAt as Date).getTime()).toBeLessThanOrEqual(after);
    expect(update.deliveryStatus).toBe("preparation_in_progress");
    expect(update.preparationStartedAt).toBeInstanceOf(Date);
    expect(update.lastOpenedAt).toBeInstanceOf(Date);
  });

  it("preserves an existing preparationStartedAt and lastOpenedAt instead of overwriting them", async () => {
    const firstOpened = new Date("2026-09-01T09:00:00.000Z");
    const firstPrepStarted = new Date("2026-09-01T09:05:00.000Z");
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate(
      [{ id: INVITATION_ID, status: "active", lastOpenedAt: firstOpened, preparationStartedAt: firstPrepStarted }],
      values => updates.push(values),
    ));
    await acknowledgeClientInvitation("raw-token-value");
    expect(updates[0].lastOpenedAt).toEqual(firstOpened);
    expect(updates[0].preparationStartedAt).toEqual(firstPrepStarted);
  });

  it("treats an Invalid Date lastOpenedAt/preparationStartedAt as unset rather than throwing (MariaDB boundary)", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate(
      [{ id: INVITATION_ID, status: "active", lastOpenedAt: new Date(NaN), preparationStartedAt: new Date(NaN) }],
      values => updates.push(values),
    ));
    await expect(acknowledgeClientInvitation("raw-token-value")).resolves.toEqual({ accepted: true });
    expect(Number.isFinite((updates[0].lastOpenedAt as Date).getTime())).toBe(true);
    expect(Number.isFinite((updates[0].preparationStartedAt as Date).getTime())).toBe(true);
  });

  it("returns null and writes nothing when no invitation matches the token", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate([], values => updates.push(values)));
    await expect(acknowledgeClientInvitation("unknown-token")).resolves.toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("returns null and writes nothing for a revoked invitation", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate(
      [{ id: INVITATION_ID, status: "revoked", lastOpenedAt: null, preparationStartedAt: null }],
      values => updates.push(values),
    ));
    await expect(acknowledgeClientInvitation("raw-token-value")).resolves.toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("returns null and writes nothing for an expired invitation", async () => {
    const updates: Record<string, unknown>[] = [];
    dbMocks.getDb.mockResolvedValue(chainWithUpdate(
      [{ id: INVITATION_ID, status: "expired", lastOpenedAt: null, preparationStartedAt: null }],
      values => updates.push(values),
    ));
    await expect(acknowledgeClientInvitation("raw-token-value")).resolves.toBeNull();
    expect(updates).toHaveLength(0);
  });
});
