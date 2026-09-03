import { describe, expect, it } from "vitest";
import { buildRealtimeSessionConfig } from "./realtime";
import { classifyRealtimeTranscript } from "./noise";
import { daysUntilShoot, MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE } from "./coreKnowledge";
import { buildShootCreativeDnaSource } from "./creativeDnaAdapter";
import { emptyShootMemory } from "./memory";

const shoot = {
  id: 42,
  title: "Voice QA",
  shootType: "personal brand",
  clientName: "Anna",
  clientEmail: "anna@example.test",
  scheduledAt: new Date("2026-09-04T12:00:00.000Z"),
  timezone: "Europe/Amsterdam",
  intendedUse: "website",
  location: "home studio",
  durationMinutes: 60,
  photographerNotes: null,
  roomState: "preparation_active",
};

const photographer = {
  displayName: "John",
  businessName: "John Studio",
  bio: "Portrait photographer",
  photographyStyle: "editorial portraiture",
  areasOfExpertise: ["editorial portraiture"],
  websiteUrl: null,
  instagramUrl: null,
};

describe("persistent MIRA shoot room", () => {
  it("uses product-defined remote photography facts and date awareness", () => {
    expect(MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE).toMatch(/Clos/);
    expect(MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE).toMatch(/iOS and Android/);
    expect(MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE).toMatch(/back smartphone camera/);
    expect(daysUntilShoot(shoot.scheduledAt, new Date("2026-09-01T08:00:00.000Z"))).toBe(3);
  });

  it("returns to preparation mode without restarting Discovery", () => {
    const config = buildRealtimeSessionConfig({ shoot, photographer, memory: emptyShootMemory(), now: new Date("2026-09-01T08:00:00.000Z") });
    expect(config.instructions).toContain("MODE: PREPARATION");
    expect(config.instructions).toContain("Do not restart Discovery");
    expect(config.instructions).toContain("Anna");
    expect(config.instructions).toContain("editorial portraiture");
  });

  it.each(["yes", "no", "okay", "confirmed"])("preserves meaningful short reply %s", reply => {
    expect(classifyRealtimeTranscript(reply).meaningful).toBe(true);
  });

  it("rejects obvious noise while preserving substantive multilingual speech", () => {
    expect(classifyRealtimeTranscript("[background noise]").meaningful).toBe(false);
    expect(classifyRealtimeTranscript("hello", 0.2).meaningful).toBe(false);
    expect(classifyRealtimeTranscript("准备好拍摄了").meaningful).toBe(true);
  });

  it("adapts confirmed shoot context into V4 without photographer-data leakage", () => {
    const memory = emptyShootMemory();
    const source = buildShootCreativeDnaSource({
      shoot: { ...shoot, photographerUserId: 9 } as any,
      photographer: { ...photographer, userId: 9 } as any,
      memory,
      summaryText: "Anna wants a calm, credible editorial portrait for her website, grounded in warmth and clarity.",
    });
    expect(source.journey.creativeInputs).toMatchObject({
      source: "confirmed_shoot_memory",
      shoot: { id: 42 },
      photographer: { displayName: "John", photographyStyle: "editorial portraiture" },
    });
    expect(JSON.stringify(source)).not.toContain("Another Photographer");
  });
});
