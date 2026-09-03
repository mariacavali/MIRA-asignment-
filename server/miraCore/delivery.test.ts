import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOwnedShoot: vi.fn(),
  getPhotographerProfile: vi.fn(),
  getCompletionNotificationContext: vi.fn(),
  markInvitationSent: vi.fn(),
  markPhotographerNotified: vi.fn(),
  provider: { send: vi.fn() },
  requireEmailConfiguration: vi.fn(),
}));

vi.mock("./db", () => ({
  getOwnedShoot: mocks.getOwnedShoot,
  getPhotographerProfile: mocks.getPhotographerProfile,
  getCompletionNotificationContext: mocks.getCompletionNotificationContext,
  markInvitationSent: mocks.markInvitationSent,
  markPhotographerNotified: mocks.markPhotographerNotified,
}));
vi.mock("../email", () => ({ requireEmailConfiguration: mocks.requireEmailConfiguration }));

import { deliverClientInvitation, notifyPhotographerOfCompletion } from "./delivery";

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
});
