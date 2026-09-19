import { describe, expect, it } from "vitest";
import {
  callMiraReminderEmail,
  clientShootRoomInvitationEmail,
  invitationEmail,
  preparationCompletedEmail,
  preparationGuidanceEmail,
  readyToShootEmail,
  shootDayReminderEmail,
} from "./templates";

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
    const talkToMiraUrl = `${preparationUrl}#mira-preparation`;
    const invitation = clientShootRoomInvitationEmail({
      clientFirstName: "<Jamie>",
      photographerName: "North & Light",
      shootTitle: "Founder <portraits>",
      scheduledAt: "2026-10-15T10:00:00.000Z",
      timeZone: "Europe/Amsterdam",
      location: "Studio, Amsterdam",
      accessUntil: "2026-10-16T10:00:00.000Z",
      preparationUrl,
      talkToMiraUrl,
    });
    const guidance = preparationGuidanceEmail({
      clientFirstName: "Jamie",
      preparationUrl,
    });
    const reminder = callMiraReminderEmail({
      clientFirstName: "Jamie",
      photographerName: "North & Light",
      preparationUrl,
    });
    const day = shootDayReminderEmail({
      clientFirstName: "Jamie",
      photographerName: "North & Light",
      scheduledAt: "2026-10-15T10:00:00.000Z",
      timeZone: "Europe/Amsterdam",
      location: "Studio, Amsterdam",
      preparationUrl,
    });

    expect(invitation.subject).toBe("North & Light invited you to a shoot");
    expect(invitation.text).toMatch(/Thursday,? 15 October 2026 at 12:00/);
    expect(invitation.text).toMatch(
      /Your private Shoot Room will remain available until Friday,? 16 October 2026 at 12:00\./
    );
    expect(invitation.text).toContain(
      "Save this email to return to the same private room."
    );
    expect(invitation.html).toContain("&lt;Jamie&gt;");
    expect(invitation.html).not.toContain("<Jamie>");
    expect(invitation.text).not.toContain(talkToMiraUrl);
    expect(invitation.html).toContain(`href="${preparationUrl}"`);
    expect(invitation.html).not.toContain(`href="${talkToMiraUrl}"`);
    expect(invitation.html.match(/href=/g)).toHaveLength(1);
    expect(invitation.html).toContain("background:#faf9f6");
    expect(invitation.html).toContain("background:#ffffff");
    expect(invitation.html).toContain("background:#d5bc89");
    expect(invitation.html).toContain("YOUR SHOOT STARTS HERE");
    for (const email of [guidance, reminder, day]) {
      expect(email.text).toContain(preparationUrl);
      expect(email.html).toContain(`href="${preparationUrl}"`);
      expect(email.text).not.toContain("TALK TO MIRA");
      expect(email.html.match(/href=/g)).toHaveLength(1);
    }
    expect(guidance.subject).toBe("Let’s prepare for your remote photoshoot");
    expect(reminder.subject).toBe("A reminder to prepare with MIRA");
    expect(day.subject).toBe("Your remote photoshoot is coming up");
    expect(day.html).toContain("<ul>");
  });

  it("confirms the shoot is ready with the same private Shoot Room link and escaped content", () => {
    const preparationUrl = "https://mira.example/prepare/access/signed-token";
    const email = readyToShootEmail({
      clientFirstName: "<Jamie>",
      photographerName: "North & Light",
      shootTitle: "Founder <portraits>",
      scheduledAt: "2026-10-15T10:00:00.000Z",
      timeZone: "Europe/Amsterdam",
      preparationUrl,
    });
    expect(email.subject).toBe("You're ready to shoot");
    expect(email.text).toContain("confirmed the creative direction");
    expect(email.text).toContain(preparationUrl);
    expect(email.text).not.toContain("TALK TO MIRA");
    expect(email.html).toContain("&lt;Jamie&gt;");
    expect(email.html).not.toContain("<Jamie>");
    expect(email.html).toContain(`href="${preparationUrl}"`);
  });

  it("keeps close-shoot invitations calm, with a real date and one link", () => {
    const email = clientShootRoomInvitationEmail({
      clientFirstName: "Jamie",
      photographerName: "North Light",
      shootTitle: "Founder portraits",
      timeZone: "Europe/Amsterdam",
      location: "Studio",
      accessUntil: null,
      preparationUrl: "https://mira.example/prepare/private-room",
      scheduledAt: "2026-10-14T20:00:00.000Z",
      sentAt: "2026-10-14T00:00:00.000Z",
    });
    expect(email.text).toContain("Confirm your shoot");
    expect(email.text).toContain("14 October 2026");
    expect(email.html.match(/href=/g)).toHaveLength(1);
    expect(email.text).not.toContain("very soon");
  });
  it("does not call a requested one-hour reminder tomorrow", () => {
    const email = shootDayReminderEmail({
      clientFirstName: "Jamie",
      photographerName: "John",
      scheduledAt: "2026-10-14T20:00:00.000Z",
      timeZone: "Europe/Amsterdam",
      location: null,
      preparationUrl: "https://mira.example/prepare/room",
      requestedReminder: true,
    });
    expect(email.subject).toBe("Your shoot reminder");
    expect(email.text).not.toContain("tomorrow");
    expect(email.text).toContain("14 October 2026");
  });
});
