import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
vi.mock("../localFileStore", () => ({
  isLocalFileStoreEnabled: () => false,
  updateLocalInvitation: vi.fn(),
}));

import {
  invitationAlreadySentToClient,
  markInvitationQueued,
  markInvitationSent,
  markInvitationFailed,
  markInvitationDeliveredByMessageId,
  markInvitationBouncedByMessageId,
} from "./db";

function fakeUpdateDb() {
  const sets: Record<string, unknown>[] = [];
  const wheres: unknown[] = [];
  const update = vi.fn(() => ({
    set: (setArgs: Record<string, unknown>) => {
      sets.push(setArgs);
      return { where: vi.fn((whereArgs: unknown) => { wheres.push(whereArgs); return Promise.resolve(undefined); }) };
    },
  }));
  return { db: { update }, sets, wheres };
}

beforeEach(() => {
  dbMocks.getDb.mockReset();
});

describe("MIRA invitation delivery status", () => {
  describe("invitationAlreadySentToClient", () => {
    it("blocks resend only once a real delivery attempt has happened on an active invitation", () => {
      expect(invitationAlreadySentToClient(null)).toBe(false);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "created" })).toBe(false);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "failed" })).toBe(false);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "queued" })).toBe(true);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "sent" })).toBe(true);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "delivered" })).toBe(true);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "opened" })).toBe(true);
      expect(invitationAlreadySentToClient({ status: "active", deliveryStatus: "completed" })).toBe(true);
    });

    it("ignores a superseded (revoked/expired) invitation even if it was once sent", () => {
      expect(invitationAlreadySentToClient({ status: "revoked", deliveryStatus: "sent" })).toBe(false);
      expect(invitationAlreadySentToClient({ status: "expired", deliveryStatus: "delivered" })).toBe(false);
    });
  });

  it("persists a queued status before the provider call is attempted", async () => {
    const { db, sets } = fakeUpdateDb();
    dbMocks.getDb.mockResolvedValue(db);
    await markInvitationQueued({ invitationId: "invitation-1", photographerUserId: 9 });
    expect(sets[0]).toMatchObject({ deliveryStatus: "queued" });
  });

  it("persists the provider and message id on a successful send", async () => {
    const { db, sets } = fakeUpdateDb();
    dbMocks.getDb.mockResolvedValue(db);
    await markInvitationSent({ invitationId: "invitation-1", photographerUserId: 9, provider: "resend", messageId: "email_123" });
    expect(sets[0]).toMatchObject({ deliveryStatus: "sent", deliveryProvider: "resend", providerMessageId: "email_123" });
  });

  it("persists an honest failed status when the provider call throws", async () => {
    const { db, sets } = fakeUpdateDb();
    dbMocks.getDb.mockResolvedValue(db);
    await markInvitationFailed({ invitationId: "invitation-1", photographerUserId: 9 });
    expect(sets[0]).toMatchObject({ deliveryStatus: "failed" });
  });

  it("upgrades to delivered from a Resend webhook, matched by message id", async () => {
    const { db, sets } = fakeUpdateDb();
    dbMocks.getDb.mockResolvedValue(db);
    await markInvitationDeliveredByMessageId("email_123");
    expect(sets[0]).toMatchObject({ deliveryStatus: "delivered" });
  });

  it("marks a bounce as failed from a Resend webhook", async () => {
    const { db, sets } = fakeUpdateDb();
    dbMocks.getDb.mockResolvedValue(db);
    await markInvitationBouncedByMessageId("email_123");
    expect(sets[0]).toMatchObject({ deliveryStatus: "failed" });
  });
});
