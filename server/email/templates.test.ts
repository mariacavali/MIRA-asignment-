import { describe, expect, it } from "vitest";
import { callMiraReminderEmail, clientShootRoomInvitationEmail, invitationEmail, preparationCompletedEmail, preparationGuidanceEmail, shootDayReminderEmail } from "./templates";

describe("MIRA transactional email templates", () => {
  it("identifies the actual photographer without Maria-branded marketing", () => {
    const email = invitationEmail({
      photographerName: "North Light Studio",
      shootTitle: "Founder portraits",
      clientName: "Jamie",
      message: "Bring the two outfits we discussed.",
      preparationUrl: "https://mira.example/prepare/token",
    });
    expect(email.text).toContain("North Light Studio has invited you");
    expect(email.text).toContain("Bring the two outfits we discussed.");
    expect(email.text).not.toContain("Maria Cavali Photography");
  });

  it("links a completion notification back to the Shoot", () => {
    const email = preparationCompletedEmail({
      clientName: "Jamie",
      shootTitle: "Founder portraits",
      shootUrl: "https://mira.example/mira/shoots/42",
    });
    expect(email.text).toContain("Jamie completed MIRA preparation");
    expect(email.text).toContain("/mira/shoots/42");
  });

  it("renders all four client emails with escaped content and the private room CTA", () => {
    const preparationUrl = "https://mira.example/prepare/private-room";
    const invitation = clientShootRoomInvitationEmail({
      clientFirstName: "<Jamie>",
      photographerName: "North & Light",
      shootTitle: "Founder <portraits>",
      scheduledAt: "2026-10-15T10:00:00.000Z",
      timeZone: "Europe/Amsterdam",
      location: "Studio, Amsterdam",
      accessUntil: "2026-10-16T10:00:00.000Z",
      preparationUrl,
    });
    const guidance = preparationGuidanceEmail({ clientFirstName: "Jamie", preparationUrl });
    const reminder = callMiraReminderEmail({ clientFirstName: "Jamie", photographerName: "North & Light", preparationUrl });
    const day = shootDayReminderEmail({ clientFirstName: "Jamie", photographerName: "North & Light", scheduledAt: "2026-10-15T10:00:00.000Z", timeZone: "Europe/Amsterdam", location: "Studio, Amsterdam", preparationUrl });

    expect(invitation.subject).toBe("North & Light invited you to prepare for your shoot");
    expect(invitation.text).toMatch(/Thursday,? 15 October 2026 at 12:00/);
    expect(invitation.text).toMatch(/Your private Shoot Room will remain available until Friday,? 16 October 2026 at 12:00\./);
    expect(invitation.text).toContain("Save this email so you can return to your private Shoot Room");
    expect(invitation.html).toContain("&lt;Jamie&gt;");
    expect(invitation.html).not.toContain("<Jamie>");
    for (const email of [invitation, guidance, reminder, day]) {
      expect(email.text).toContain(preparationUrl);
      expect(email.html).toContain(`href="${preparationUrl}"`);
    }
    expect(guidance.subject).toBe("Let’s prepare for your remote photoshoot");
    expect(reminder.subject).toBe("A reminder to prepare with MIRA");
    expect(day.subject).toBe("Your remote photoshoot is tomorrow");
    expect(day.html).toContain("<ul>");
  });

  it("compresses close shoots into one combined invitation and uses a concise talk-now message inside 24 hours", () => {
    const common = {
      clientFirstName: "Jamie",
      photographerName: "North Light",
      shootTitle: "Founder portraits",
      timeZone: "Europe/Amsterdam",
      location: "Studio",
      accessUntil: null,
      preparationUrl: "https://mira.example/prepare/private-room",
      sentAt: "2026-10-14T00:00:00.000Z",
    };
    const combined = clientShootRoomInvitationEmail({ ...common, scheduledAt: "2026-10-15T12:00:00.000Z" });
    const urgent = clientShootRoomInvitationEmail({ ...common, scheduledAt: "2026-10-14T20:00:00.000Z" });

    expect(combined.text).toContain("everything you need is in this one message");
    expect(combined.text).toContain("continue in text");
    expect(urgent.subject).toContain("shoot is soon");
    expect(urgent.text).toContain("talk to MIRA—or continue in text");
  });
});
