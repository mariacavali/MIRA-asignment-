import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInvitationRoomStateById: vi.fn(),
  env: {
    invitationLinkSecret: "synthetic-invitation-link-secret",
    publicAppBaseUrl: "https://mira.example",
  },
}));

vi.mock("./db", () => ({ getInvitationRoomStateById: mocks.getInvitationRoomStateById }));
vi.mock("../_core/env", () => ({ ENV: mocks.env }));

import { resolveMiraEmailOutboxContext } from "./emailOutboxContext";
import { parseInvitationAccessToken, verifyInvitationAccessSignature } from "./invitationAccessLink";

const job = {
  id: "job-1",
  shootId: 7,
  invitationId: "11111111-1111-4111-8111-111111111111",
  milestoneId: "preparation_guidance" as const,
  scheduledAt: new Date("2026-10-08T10:00:00.000Z"),
  status: "processing" as const,
  attemptCount: 1,
  lastErrorCategory: null,
  idempotencyKey: "mira:shoot:7:milestone:preparation_guidance",
  leaseUntil: null,
  claimedAt: null,
  sentAt: null,
};

function state(overrides: Partial<{ tokenHash: string; status: string; completedAt: Date | null; shootStatus: string }> = {}) {
  return {
    invitation: {
      id: job.invitationId,
      tokenHash: overrides.tokenHash ?? "a".repeat(64),
      status: overrides.status ?? "active",
      expiresAt: new Date("2026-10-17T00:00:00.000Z"),
      completedAt: overrides.completedAt ?? null,
    },
    shoot: {
      title: "Founder portraits",
      clientName: "Jamie Example",
      clientEmail: "client@example.test",
      scheduledAt: new Date("2026-10-15T10:00:00.000Z"),
      durationMinutes: 60,
      timezone: "Europe/Amsterdam",
      location: "Studio",
      status: overrides.shootStatus ?? "conversation_in_progress",
    },
    photographer: { businessName: "North Light", displayName: "North Light Studio" },
  };
}

beforeEach(() => {
  mocks.getInvitationRoomStateById.mockReset();
  mocks.env.invitationLinkSecret = "synthetic-invitation-link-secret";
  mocks.env.publicAppBaseUrl = "https://mira.example";
});

describe("MIRA email outbox context resolver", () => {
  it("resolves the recipient and mints a signed access link only when called, from current state", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValue(state());
    const context = await resolveMiraEmailOutboxContext(job);
    expect(mocks.getInvitationRoomStateById).toHaveBeenCalledWith(job.invitationId);
    expect(context).not.toBeNull();
    expect(context?.clientEmail).toBe("client@example.test");
    expect(context?.invitationValid).toBe(true);
    expect(context?.preparationCompleted).toBe(false);
    expect(context?.preparationUrl.startsWith("https://mira.example/prepare/access/v1.")).toBe(true);
    // The link never carries the tokenHash or any PII in the clear.
    expect(context?.preparationUrl).not.toContain(state().invitation.tokenHash);
    expect(context?.preparationUrl).not.toContain("client@example.test");
  });

  it("produces a link that verifies against the invitation's current tokenHash", async () => {
    const rowState = state();
    mocks.getInvitationRoomStateById.mockResolvedValue(rowState);
    const context = await resolveMiraEmailOutboxContext(job);
    const signedAccessToken = context!.preparationUrl.split("/prepare/access/")[1];
    const parsed = parseInvitationAccessToken(signedAccessToken)!;
    expect(verifyInvitationAccessSignature(parsed, rowState.invitation.tokenHash, mocks.env.invitationLinkSecret)).toBe(true);
  });

  it("mints a different, still-valid link after the invitation's token rotates, without duplicating jobs", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValueOnce(state({ tokenHash: "a".repeat(64) }));
    const before = await resolveMiraEmailOutboxContext(job);
    mocks.getInvitationRoomStateById.mockResolvedValueOnce(state({ tokenHash: "b".repeat(64) }));
    const after = await resolveMiraEmailOutboxContext(job);
    expect(before!.preparationUrl).not.toBe(after!.preparationUrl);
    // Resolving twice for the same job never touches job identity/storage - it's a pure read.
    expect(mocks.getInvitationRoomStateById).toHaveBeenCalledTimes(2);
  });

  it("marks a cancelled/revoked invitation as not deliverable", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValue(state({ status: "revoked" }));
    const context = await resolveMiraEmailOutboxContext(job);
    expect(context?.invitationValid).toBe(false);
  });

  it("marks a completed preparation as not deliverable", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValue(state({ completedAt: new Date("2026-10-09T00:00:00.000Z") }));
    const context = await resolveMiraEmailOutboxContext(job);
    expect(context?.preparationCompleted).toBe(true);
  });

  it("flags an archived (cancelled) shoot", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValue(state({ shootStatus: "archived" }));
    const context = await resolveMiraEmailOutboxContext(job);
    expect(context?.shootCancelled).toBe(true);
  });

  it("fails safely without sending when the invitation cannot be found", async () => {
    mocks.getInvitationRoomStateById.mockResolvedValue(null);
    await expect(resolveMiraEmailOutboxContext(job)).resolves.toBeNull();
  });

  it("fails safely without sending when the signing secret is not configured", async () => {
    mocks.env.invitationLinkSecret = "";
    mocks.getInvitationRoomStateById.mockResolvedValue(state());
    await expect(resolveMiraEmailOutboxContext(job)).resolves.toBeNull();
    expect(mocks.getInvitationRoomStateById).not.toHaveBeenCalled();
  });

  it("fails safely without sending when the public base URL is not configured", async () => {
    mocks.env.publicAppBaseUrl = "";
    mocks.getInvitationRoomStateById.mockResolvedValue(state());
    await expect(resolveMiraEmailOutboxContext(job)).resolves.toBeNull();
  });
});
