import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOwnedShoot: vi.fn(),
  getPhotographerProfile: vi.fn(),
  getCompletionNotificationContext: vi.fn(),
  getLatestInvitationIdForOwnedShoot: vi.fn(),
  getInvitationRoomStateById: vi.fn(),
  markInvitationSent: vi.fn(),
  markPhotographerNotified: vi.fn(),
  provider: { send: vi.fn() },
  requireEmailConfiguration: vi.fn(),
}));

vi.mock("./db", () => ({
  getOwnedShoot: mocks.getOwnedShoot,
  getPhotographerProfile: mocks.getPhotographerProfile,
  getCompletionNotificationContext: mocks.getCompletionNotificationContext,
  getLatestInvitationIdForOwnedShoot: mocks.getLatestInvitationIdForOwnedShoot,
  getInvitationRoomStateById: mocks.getInvitationRoomStateById,
  markInvitationSent: mocks.markInvitationSent,
  markPhotographerNotified: mocks.markPhotographerNotified,
}));
vi.mock("../email", () => ({ requireEmailConfiguration: mocks.requireEmailConfiguration }));
vi.mock("../_core/env", () => ({ ENV: { invitationLinkSecret: "synthetic-invitation-link-secret", publicAppBaseUrl: "" } }));

import { deliverClientInvitation, notifyClientShootIsReadyToShoot, notifyPhotographerOfCompletion } from "./delivery";

function fakeOutboxRepository(initialStatus: "pending" | "sent" = "pending") {
  let status = initialStatus;
  return {
    schedule: vi.fn(async () => ({ id: "job-1", status })),
    markSent: vi.fn(async () => { status = "sent"; }),
  };
}

const shoot = {
  id: 7,
  title: "Founder portraits",
  clientName: "Jamie Example",
  clientEmail: "client@example.test",
  scheduledAt: new Date("2026-10-15T10:00:00.000Z"),
  timezone: "Europe/Amsterdam",
  location: "Studio",
  intendedUse: "Website",
  shootType: "Remote portrait",
  durationMinutes: 60,
  photographerNotes: null,
};

beforeEach(() => {
  process.env.MIRA_PUBLIC_APP_BASE_URL = "https://mira.example";
  mocks.getOwnedShoot.mockResolvedValue(shoot);
  mocks.getPhotographerProfile.mockResolvedValue({ displayName: "North Light", businessName: null });
  mocks.requireEmailConfiguration.mockReturnValue({ provider: mocks.provider, from: "Remote Shoot Preparation <prepare@mariacavali.com>" });
  mocks.provider.send.mockResolvedValue({ provider: "test", messageId: "message-1" });
  mocks.markInvitationSent.mockResolvedValue(undefined);
  mocks.getCompletionNotificationContext.mockResolvedValue(null);
  mocks.getOwnedShoot.mockClear();
  mocks.getPhotographerProfile.mockClear();
  mocks.provider.send.mockClear();
  mocks.markInvitationSent.mockClear();
});

describe("MIRA email delivery routing", () => {
  it("uses the fixed sender, client recipient, and valid photographer Reply-To", async () => {
    await deliverClientInvitation({ photographerUserId: 9, photographerEmail: "photographer@example.test", invitationId: "invitation-1", token: "token", shootId: 7, expiresAt: new Date("2026-10-14T10:00:00.000Z"), requestOrigin: "https://mira.example" });

    expect(mocks.requireEmailConfiguration).toHaveBeenCalled();
    expect(mocks.provider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "client@example.test",
      from: "Remote Shoot Preparation <prepare@mariacavali.com>",
      replyTo: "photographer@example.test",
    }));
    const delivered = mocks.provider.send.mock.calls[0]?.[0];
    expect(delivered?.html).toContain('href="https://mira.example/prepare/token"');
    expect(delivered?.html).toContain('href="https://mira.example/prepare/token#mira-preparation"');
  });

  it("omits an invalid or missing photographer Reply-To without blocking the invitation", async () => {
    await deliverClientInvitation({ photographerUserId: 9, photographerEmail: "not-an-email", invitationId: "invitation-1", token: "token", shootId: 7, expiresAt: new Date("2026-10-14T10:00:00.000Z"), requestOrigin: "https://mira.example" });
    await deliverClientInvitation({ photographerUserId: 9, photographerEmail: null, invitationId: "invitation-2", token: "token", shootId: 7, expiresAt: new Date("2026-10-14T10:00:00.000Z"), requestOrigin: "https://mira.example" });

    expect(mocks.provider.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: "client@example.test", replyTo: null }));
    expect(mocks.provider.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: "client@example.test", replyTo: null }));
  });

  it("routes completion notifications to the photographer profile email", async () => {
    mocks.getCompletionNotificationContext.mockResolvedValue({
      invitation: { id: "invitation-1", photographerNotifiedAt: null },
      shoot,
      photographerEmail: "photographer@example.test",
    });

    await notifyPhotographerOfCompletion({ shootId: 7, requestOrigin: "https://mira.example" });

    expect(mocks.provider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "photographer@example.test",
      from: "Remote Shoot Preparation <prepare@mariacavali.com>",
    }));
  });

  it("rejects an invalid client recipient before provider delivery", async () => {
    mocks.getOwnedShoot.mockResolvedValue({ ...shoot, clientEmail: "invalid" });

    await expect(deliverClientInvitation({ photographerUserId: 9, photographerEmail: "photographer@example.test", invitationId: "invitation-1", token: "token", shootId: 7, expiresAt: new Date("2026-10-14T10:00:00.000Z"), requestOrigin: "https://mira.example" })).rejects.toThrow("client email address is invalid");
    expect(mocks.provider.send).not.toHaveBeenCalled();
  });

  it("fails safely without the configured public URL and never uses request origin as a fallback", async () => {
    delete process.env.MIRA_PUBLIC_APP_BASE_URL;

    await expect(deliverClientInvitation({
      photographerUserId: 9,
      photographerEmail: "photographer@example.test",
      invitationId: "invitation-1",
      token: "private-token",
      shootId: 7,
      expiresAt: new Date("2026-10-14T10:00:00.000Z"),
      requestOrigin: "https://temporary-tunnel.example",
    })).rejects.toThrow("MIRA_PUBLIC_APP_BASE_URL is not configured");
    expect(mocks.provider.send).not.toHaveBeenCalled();
  });
});

describe("notifyClientShootIsReadyToShoot", () => {
  const INVITATION_ID = "55555555-5555-4555-8555-555555555555";
  const invitationRoomState = {
    invitation: { id: INVITATION_ID, tokenHash: "a".repeat(64) },
    shoot,
    photographer: { displayName: "North Light", businessName: null },
  };

  beforeEach(() => {
    mocks.getLatestInvitationIdForOwnedShoot.mockReset();
    mocks.getInvitationRoomStateById.mockReset();
    mocks.getLatestInvitationIdForOwnedShoot.mockResolvedValue(INVITATION_ID);
    mocks.getInvitationRoomStateById.mockResolvedValue(invitationRoomState);
  });

  it("sends a ready-to-shoot email using a fresh signed Shoot Room link and records it as sent", async () => {
    const repository = fakeOutboxRepository("pending");

    const sent = await notifyClientShootIsReadyToShoot({ photographerUserId: 9, shootId: 7, repository });

    expect(sent).toBe(true);
    expect(repository.schedule).toHaveBeenCalledWith(expect.objectContaining({
      shootId: 7,
      invitationId: INVITATION_ID,
      milestoneId: "ready_to_shoot",
      idempotencyKey: "mira:shoot:7:milestone:ready_to_shoot",
    }));
    expect(mocks.provider.send).toHaveBeenCalledWith(expect.objectContaining({ to: "client@example.test" }));
    const delivered = mocks.provider.send.mock.calls[0]?.[0];
    expect(delivered?.html).toContain('href="https://mira.example/prepare/access/');
    expect(repository.markSent).toHaveBeenCalledWith("job-1", expect.any(Date), "message-1");
  });

  it("never sends a second time once the outbox ledger already shows this milestone sent (idempotent against repeated clicks)", async () => {
    const repository = fakeOutboxRepository("sent");

    const sent = await notifyClientShootIsReadyToShoot({ photographerUserId: 9, shootId: 7, repository });

    expect(sent).toBe(false);
    expect(mocks.provider.send).not.toHaveBeenCalled();
    expect(repository.markSent).not.toHaveBeenCalled();
  });

  it("does nothing when the shoot has no invitation to notify", async () => {
    mocks.getLatestInvitationIdForOwnedShoot.mockResolvedValue(null);
    const repository = fakeOutboxRepository("pending");

    const sent = await notifyClientShootIsReadyToShoot({ photographerUserId: 9, shootId: 7, repository });

    expect(sent).toBe(false);
    expect(mocks.provider.send).not.toHaveBeenCalled();
  });

  it("does nothing when the client has no valid email on file", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValue({ ...invitationRoomState, shoot: { ...shoot, clientEmail: "invalid" } });
    const repository = fakeOutboxRepository("pending");

    const sent = await notifyClientShootIsReadyToShoot({ photographerUserId: 9, shootId: 7, repository });

    expect(sent).toBe(false);
    expect(mocks.provider.send).not.toHaveBeenCalled();
  });
});
