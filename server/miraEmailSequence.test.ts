import { describe, expect, it } from "vitest";
import { buildMiraEmailSequence } from "../shared/miraEmailSequence";

describe("MIRA client email sequence", () => {
  it("schedules milestones in the client timezone and suppresses completed ones", () => {
    const emails = buildMiraEmailSequence({ shootId: 42, scheduledAt: new Date("2026-10-15T10:00:00.000Z"), timeZone: "Europe/Amsterdam", clientEmail: "client@example.test", invitationSentAt: new Date("2026-10-08T10:00:00.000Z"), acceptedAt: new Date("2026-10-09T10:00:00.000Z"), preparationCompletedAt: new Date("2026-10-10T10:00:00.000Z") });
    expect(emails).toHaveLength(3);
    expect(emails.every(email => email.status === "suppressed")).toBe(true);
    expect(emails.find(email => email.id === "call_mira_reminder")).toMatchObject({ status: "suppressed", suppressionReason: "preparation_completed" });
    expect(emails.find(email => email.id === "shoot_day_reminder")?.scheduledAt.toISOString()).toBe("2026-10-14T10:00:00.000Z");
  });

  it("does not duplicate already sent milestones", () => {
    const emails = buildMiraEmailSequence({ shootId: 42, scheduledAt: new Date("2026-10-15T10:00:00.000Z"), timeZone: "UTC", clientEmail: "client@example.test", invitationSentAt: new Date("2026-10-08T10:00:00.000Z"), acceptedAt: new Date("2026-10-09T10:00:00.000Z"), processedMilestones: ["shoot_room_invitation"] });
    expect(emails.find(email => email.id === "shoot_room_invitation")?.status).toBe("sent");
    expect(new Set(emails.map(email => email.id)).size).toBe(3);
  });

  it("suppresses invalid, cancelled, and post-shoot milestones", () => {
    const emails = buildMiraEmailSequence({ shootId: 42, scheduledAt: new Date("2026-10-15T10:00:00.000Z"), timeZone: "UTC", clientEmail: "client@example.test", invitationSentAt: new Date("2026-10-08T10:00:00.000Z"), acceptedAt: new Date("2026-10-16T10:00:00.000Z"), invitationValid: false, shootCancelled: true });
    expect(emails.every(email => email.status === "suppressed")).toBe(true);
    expect(emails.find(email => email.id === "call_mira_reminder")?.suppressionReason).toBe("invitation_invalid");
  });

  it("compresses close-to-shoot scheduling without placing reminders after the shoot", () => {
    const emails = buildMiraEmailSequence({ shootId: 42, scheduledAt: new Date("2026-10-15T10:00:00.000Z"), timeZone: "Europe/Amsterdam", clientEmail: "client@example.test", invitationSentAt: new Date("2026-10-15T00:00:00.000Z"), acceptedAt: new Date("2026-10-15T01:00:00.000Z") });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ id: "shoot_room_invitation", status: "scheduled" });
    expect(emails.every(email => email.scheduledAt.getTime() <= new Date("2026-10-15T10:00:00.000Z").getTime())).toBe(true);
  });
});
