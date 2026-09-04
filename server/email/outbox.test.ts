import { describe, expect, it, vi } from "vitest";
import { InMemoryEmailOutboxRepository, MiraEmailOutboxWorker, recordImmediateInvitationAsSent, scheduleMiraEmailMilestones } from "./outbox";
import type { EmailContext } from "./outbox";

const base = {
  invitationId: "invitation-test",
  shootId: 7,
  scheduledAt: new Date("2026-10-15T10:00:00.000Z"),
  timeZone: "Europe/Amsterdam",
  invitationSentAt: new Date("2026-10-08T10:00:00.000Z"),
};

function context(overrides: Partial<EmailContext> = {}): EmailContext {
  return { clientFirstName: "Jamie", photographerName: "Test Studio", shootTitle: "Portraits", scheduledAt: base.scheduledAt, shootEndsAt: new Date("2026-10-15T11:00:00.000Z"), timeZone: base.timeZone, location: "Studio", accessUntil: null, preparationUrl: "https://mira.example/prepare/private", clientEmail: "client@example.test", preparationCompleted: false, invitationValid: true, shootCancelled: false, ...overrides };
}

describe("MIRA email outbox", () => {
  it("uses the 4–7 day schedule and deduplicates invitation/milestone jobs", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, base);
    await scheduleMiraEmailMilestones(repository, base);
    const jobs = await repository.list();
    expect(jobs).toHaveLength(3);
    expect(jobs.map(job => job.milestoneId)).toEqual(["shoot_room_invitation", "call_mira_reminder", "shoot_day_reminder"]);
    expect(jobs.every(job => !("clientEmail" in job) && !("preparationUrl" in job) && !("text" in job) && !("html" in job))).toBe(true);
  });

  it("uses invitation now plus 7-day, 3-day, and 1-day milestones when more than seven days remain", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, { ...base, invitationSentAt: new Date("2026-10-05T10:00:00.000Z") });
    const jobs = await repository.list();
    expect(jobs.map(job => [job.milestoneId, job.scheduledAt.toISOString()])).toEqual([
      ["shoot_room_invitation", "2026-10-05T10:00:00.000Z"],
      ["preparation_guidance", "2026-10-08T10:00:00.000Z"],
      ["call_mira_reminder", "2026-10-12T10:00:00.000Z"],
      ["shoot_day_reminder", "2026-10-14T10:00:00.000Z"],
    ]);
  });

  it("preserves the shoot's local clock time across daylight-saving changes", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, {
      ...base,
      scheduledAt: new Date("2027-03-31T10:00:00.000Z"),
      invitationSentAt: new Date("2027-03-20T11:00:00.000Z"),
    });
    const guidance = (await repository.list()).find(job => job.milestoneId === "preparation_guidance");
    expect(guidance?.scheduledAt.toISOString()).toBe("2027-03-24T11:00:00.000Z");
  });

  it("shortens to invitation plus one-day reminder with two to three days remaining", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, { ...base, invitationSentAt: new Date("2026-10-12T10:00:00.000Z") });
    expect((await repository.list()).map(job => [job.milestoneId, job.scheduledAt.toISOString()])).toEqual([
      ["shoot_room_invitation", "2026-10-12T10:00:00.000Z"],
      ["shoot_day_reminder", "2026-10-14T10:00:00.000Z"],
    ]);
  });

  it("queues one immediate combined message when fewer than two days remain and nothing after the shoot", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, { ...base, invitationSentAt: new Date("2026-10-14T00:00:00.000Z") });
    expect((await repository.list()).map(job => job.milestoneId)).toEqual(["shoot_room_invitation"]);
    const afterShoot = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(afterShoot, { ...base, invitationSentAt: new Date("2026-10-15T10:00:00.000Z") });
    expect(await afterShoot.list()).toHaveLength(0);
  });

  it("suppresses completed, cancelled, or invalid schedules", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, { ...base, acceptedAt: new Date("2026-10-15T01:00:00.000Z"), preparationCompletedAt: new Date("2026-10-15T02:00:00.000Z"), shootCancelled: true, invitationValid: false, invitationSentAt: new Date("2026-10-15T00:00:00.000Z") });
    expect(await repository.list()).toHaveLength(0);
  });

  it("updates pending milestone times on rescheduling but never moves sent jobs", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await scheduleMiraEmailMilestones(repository, base);
    const invitation = (await repository.list())[0];
    const claim = await repository.claimDue(new Date("2026-10-08T10:00:00.000Z"), 60_000);
    expect(claim?.milestoneId).toBe(invitation.milestoneId);
    await repository.markSent(invitation.id, new Date("2026-10-08T10:00:00.000Z"));
    await scheduleMiraEmailMilestones(repository, { ...base, scheduledAt: new Date("2026-11-15T10:00:00.000Z"), invitationSentAt: new Date("2026-10-08T10:00:00.000Z") });
    const jobs = await repository.list();
    expect(jobs.find(job => job.milestoneId === "shoot_room_invitation")?.status).toBe("sent");
    expect(jobs.find(job => job.milestoneId === "shoot_day_reminder")?.scheduledAt.toISOString()).toBe("2026-11-14T10:00:00.000Z");
  });

  it("claims atomically, recovers expired leases, and bounds retries", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await repository.schedule({ shootId: 7, invitationId: "invitation-test", milestoneId: "shoot_room_invitation", scheduledAt: new Date("2026-10-08T10:00:00.000Z"), idempotencyKey: "idempotency-test" });
    const now = new Date("2026-10-08T10:00:00.000Z");
    const [first, second] = await Promise.all([repository.claimDue(now, 60_000), repository.claimDue(now, 60_000)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await repository.markFailed(first!.id, "provider_delivery", now, 3);
    await repository.claimDue(new Date("2026-10-08T10:01:00.000Z"), 1);
    await repository.markFailed(first!.id, "provider_delivery", new Date("2026-10-08T10:01:00.000Z"), 3);
    await repository.claimDue(new Date("2026-10-08T10:02:00.000Z"), 1);
    await repository.markFailed(first!.id, "provider_delivery", new Date("2026-10-08T10:02:00.000Z"), 3);
    expect((await repository.list())[0].status).toBe("failed");
    await repository.schedule({ shootId: 7, invitationId: "invitation-test", milestoneId: "preparation_guidance", scheduledAt: now, idempotencyKey: "idempotency-guidance" });
    const leased = await repository.claimDue(now, 60_000);
    expect(leased).not.toBeNull();
    expect(await repository.recoverExpiredLeases(new Date(leased!.leaseUntil!.getTime() + 1))).toBe(1);
    expect((await repository.list()).find(job => job.id === leased!.id)?.status).toBe("pending");
  });

  it("resolves recipient and room context only at processing time and sends one rendered message", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await repository.schedule({ shootId: 7, invitationId: "invitation-test", milestoneId: "shoot_room_invitation", scheduledAt: new Date("2026-10-08T10:00:00.000Z"), idempotencyKey: "delivery-idempotency" });
    const provider = { send: vi.fn(async (message: Record<string, string>) => { expect(message.to).toBe("client@example.test"); expect(message.text).toContain("https://mira.example/prepare/private"); return { provider: "fake", messageId: "fake-message" }; }) };
    const resolver = vi.fn(async () => context({ accessUntil: new Date("2026-10-16T10:00:00.000Z") }));
    const worker = new MiraEmailOutboxWorker(repository, resolver, provider, "MIRA <prepare@example.test>", () => new Date("2026-10-08T10:00:00.000Z"));
    await expect(worker.processOne()).resolves.toBe("sent");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((await repository.list())[0].status).toBe("sent");
  });

  it("suppresses at processing time and safely retries provider failure", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await repository.schedule({ shootId: 7, invitationId: "invitation-test", milestoneId: "preparation_guidance", scheduledAt: new Date("2026-10-08T10:00:00.000Z"), idempotencyKey: "suppression-idempotency" });
    const provider = { send: vi.fn(async () => { throw new Error("provider payload must not be stored"); }) };
    const worker = new MiraEmailOutboxWorker(repository, async () => context({ preparationCompleted: true }), provider, "MIRA <prepare@example.test>", () => new Date("2026-10-08T10:00:00.000Z"));
    await expect(worker.processOne()).resolves.toBe("suppressed");
    expect(provider.send).not.toHaveBeenCalled();
    await repository.schedule({ shootId: 7, invitationId: "invitation-test", milestoneId: "call_mira_reminder", scheduledAt: new Date("2026-10-08T10:00:00.000Z"), idempotencyKey: "failure-idempotency" });
    const failingWorker = new MiraEmailOutboxWorker(repository, async () => context(), provider, "MIRA <prepare@example.test>", () => new Date("2026-10-08T10:00:00.000Z"), 1);
    await expect(failingWorker.processOne()).resolves.toBe("failed");
    expect((await repository.list()).find(job => job.idempotencyKey === "failure-idempotency")?.status).toBe("failed");
  });

  it("records an immediately-delivered invitation as sent and never schedules a duplicate send", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    const input = { invitationId: "invitation-test", shootId: 7, scheduledAt: base.scheduledAt, idempotencyKey: "mira:shoot:7:milestone:shoot_room_invitation" };
    await recordImmediateInvitationAsSent(repository, input, new Date("2026-10-08T10:00:00.000Z"));
    // A second call (e.g. a retried mutation) must not create a second job or move the sentAt.
    await recordImmediateInvitationAsSent(repository, input, new Date("2026-10-08T11:00:00.000Z"));
    const jobs = await repository.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ milestoneId: "shoot_room_invitation", status: "sent" });
    expect(jobs[0].sentAt?.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    // The worker must find nothing due to claim: the immediate send is authoritative, so no async
    // delivery ever fires for this milestone and exactly one invitation email reaches the client.
    const provider = { send: vi.fn(async () => ({ provider: "fake", messageId: "fake-message" })) };
    const worker = new MiraEmailOutboxWorker(repository, async () => context(), provider, "MIRA <prepare@example.test>", () => new Date("2026-10-09T10:00:00.000Z"));
    await expect(worker.processOne()).resolves.toBe("idle");
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("cancels pending jobs and suppresses expired or post-shoot contexts", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    await repository.schedule({ shootId: 7, invitationId: "invitation-test", milestoneId: "shoot_room_invitation", scheduledAt: new Date("2026-10-08T10:00:00.000Z"), idempotencyKey: "cancel-idempotency" });
    await repository.cancelPending("invitation-test", "invitation_revoked");
    expect((await repository.list())[0].status).toBe("cancelled");
    await repository.schedule({ shootId: 7, invitationId: "invitation-expired", milestoneId: "shoot_room_invitation", scheduledAt: new Date("2026-10-08T10:00:00.000Z"), idempotencyKey: "expired-idempotency" });
    const provider = { send: vi.fn(async () => ({ provider: "fake", messageId: "message" })) };
    const worker = new MiraEmailOutboxWorker(repository, async () => context({ invitationValid: false }), provider, "MIRA <prepare@example.test>", () => new Date("2026-10-08T10:00:00.000Z"));
    await expect(worker.processOne()).resolves.toBe("suppressed");
    expect(provider.send).not.toHaveBeenCalled();
  });
});
