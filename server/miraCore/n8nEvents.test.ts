import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildMiraOnboardingEvent, miraOnboardingEventSchema } from "../../shared/miraOnboardingEvent";

describe("MIRA onboarding n8n event contract", () => {
  it("builds a minimal synthetic-safe photographer payload", () => {
    const event = buildMiraOnboardingEvent({
      eventName: "photographer.onboarding_completed",
      photographerId: 210001,
      name: "Synthetic Photographer",
      businessName: "Synthetic Studio",
      syntheticEmail: "synthetic.photographer@example.test",
      website: "https://example.test/synthetic-studio",
      instagramUsername: "synthetic_studio",
      timeZone: "Europe/Amsterdam",
      selectedPlan: "pilot",
      paymentStatus: "test_active",
      onboardingStatus: "complete",
      registrationDate: new Date("2026-09-02T10:00:00.000Z"),
      numberOfShoots: 0,
      lastActivityDate: new Date("2026-09-02T10:05:00.000Z"),
    });

    expect(miraOnboardingEventSchema.parse(event)).toEqual(event);
    expect(event).not.toHaveProperty("password");
    expect(event).not.toHaveProperty("client");
  });

  it("rejects a non-synthetic email", () => {
    expect(() => miraOnboardingEventSchema.shape.photographer.shape.email.parse("real.person@example.com")).toThrow();
  });

  it("keeps the client email workflow on exactly the four current milestones", () => {
    const workflow = JSON.parse(readFileSync(new URL("../../workflows/mira-client-email-sequence.json", import.meta.url), "utf8")) as {
      active: boolean;
      nodes: Array<{ name: string; parameters?: { jsCode?: string } }>;
    };
    const code = workflow.nodes.find(node => node.name === "Schedule Idempotent Milestones")?.parameters?.jsCode ?? "";
    const milestoneIds = Array.from(code.matchAll(/\['(shoot_room_invitation|preparation_guidance|call_mira_reminder|shoot_day_reminder)'/g), match => match[1]);
    expect(workflow.active).toBe(false);
    expect(milestoneIds).toEqual(["shoot_room_invitation", "preparation_guidance", "call_mira_reminder", "shoot_day_reminder"]);
    expect(code).not.toMatch(/shoot_confirmed|preparation_invite|preparation_reminder|direction_ready|checklist|tomorrow|clos_ready/);
    expect(code).toContain("prepared_not_sent");
    expect(JSON.stringify(workflow)).toContain("externalSendPerformed");
  });
});
