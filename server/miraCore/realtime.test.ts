import { describe, expect, it } from "vitest";
import { MIRA_MASTER_PROMPT_VERSION } from "../../shared/miraCore";
import { buildRealtimeSessionConfig, resolveRealtimeVoice } from "./realtime";

describe("MIRA realtime session configuration", () => {
  const config = buildRealtimeSessionConfig({
    shoot: { id: 7, title: "Editorial portrait", shootType: "personal brand", clientName: "Synthetic Client", clientEmail: "client@example.test", scheduledAt: "2026-09-04T10:00:00.000Z", timezone: "Europe/Amsterdam", intendedUse: "Website", location: "Studio", durationMinutes: 60, photographerNotes: null, roomState: "discovery_in_progress" },
    photographer: { displayName: "Synthetic Photographer", businessName: "Test Studio", bio: null, photographyStyle: "editorial", areasOfExpertise: ["portraiture"], websiteUrl: null, instagramUrl: null },
    memory: { schemaVersion: "1.0", identity: {}, brand: {}, expression: {}, visualWorld: {}, shootContext: {}, openQuestions: [], completeness: { identity: "missing", brand: "missing", expression: "missing", visualWorld: "missing", shootContext: "missing" } },
    now: new Date("2026-09-01T10:00:00.000Z"),
  });

  it("uses semantic VAD with guarded response creation and interruption", () => {
    expect(config.audio.input.turn_detection).toEqual(expect.objectContaining({ type: "semantic_vad", create_response: false, interrupt_response: true }));
  });

  it("uses the canonical prompt and canonical memory tool", () => {
    expect(config.instructions).toContain("persistent private room");
    expect(config.instructions).toContain("CURRENT SHOOT MEMORY");
    expect(config.tools.map(tool => tool.name)).toEqual([
      "update_shoot_memory",
      "create_discovery_summary",
      "confirm_discovery_summary",
      "check_preparation_status",
      "finalize_preparation",
    ]);
    expect(MIRA_MASTER_PROMPT_VERSION).toBe("shoot-preparation-v1");
  });

  it("requires explicit completion language to finalize and reports a client statement", () => {
    const finalizeTool = config.tools.find(tool => tool.name === "finalize_preparation");
    expect(finalizeTool?.parameters).toMatchObject({ required: ["clientStatement"] });
    expect(finalizeTool?.description).toContain("Never call this for ordinary politeness");
    expect(config.instructions).toContain("Do not call it for ordinary politeness");
  });

  it("keeps memory persistence silent instead of narrating internal processing", () => {
    const memoryTool = config.tools.find(tool => tool.name === "update_shoot_memory");
    expect(memoryTool?.description).toContain("Call silently");
    expect(config.instructions).toContain('never say things like "let me think"');
    expect(config.instructions).toContain("Never narrate your own internal processing out loud");
  });

  it("never lets realtime MIRA narrate a moodboard it has not seen", () => {
    expect(config.instructions).toContain("Never verbally describe, imagine, or narrate what a moodboard");
    expect(config.tools.map(tool => tool.name)).toContain("check_preparation_status");
  });

  it("does not leak credentials or founder branding into the shared session", () => {
    const serialized = JSON.stringify(config);
    expect(serialized).not.toMatch(/api[_-]?key|bearer/i);
    expect(serialized).not.toMatch(/maria cavali/i);
  });

  it("stays in one-question discovery and gates creative recommendations behind summary confirmation", () => {
    expect(config.instructions).toContain("Ask exactly one question at a time");
    expect(config.instructions).toContain("do not recommend or synthesise creative direction");
    expect(config.instructions).toContain("ask for confirmation in the same response");
    expect(config.instructions).toContain("never request a field that memory already answers");
    expect(config.instructions).toContain("clarify it before replacing an explicit fact");
    expect(config.instructions).toContain('"daysUntilShoot":3');
    expect(config.instructions).toContain("Clos");
  });

  it("uses a configured custom voice ID and safely falls back", () => {
    expect(resolveRealtimeVoice("voice_custom_123", "marin")).toBe("voice_custom_123");
    expect(resolveRealtimeVoice("", "marin")).toBe("marin");
  });
});

describe("MIRA realtime MODE per room state", () => {
  const emptyMemory = { schemaVersion: "1.0", identity: {}, brand: {}, expression: {}, visualWorld: {}, shootContext: {}, openQuestions: [], completeness: { identity: "missing", brand: "missing", expression: "missing", visualWorld: "missing", shootContext: "missing" } };
  const shootWith = (roomState: string) => ({ id: 1, title: "Shoot", shootType: null, clientName: null, clientEmail: null, scheduledAt: null, timezone: "UTC", intendedUse: null, location: null, durationMinutes: null, photographerNotes: null, roomState });
  const buildFor = (roomState: string) => buildRealtimeSessionConfig({ shoot: shootWith(roomState), photographer: null, memory: emptyMemory });

  it.each(["welcome", "discovery_offered"])("uses MODE: WELCOME for %s", roomState => {
    expect(buildFor(roomState).instructions).toContain("MODE: WELCOME");
  });

  it("uses MODE: DISCOVERY once the room has actually advanced past welcome", () => {
    expect(buildFor("discovery_in_progress").instructions).toContain("MODE: DISCOVERY");
    expect(buildFor("summary_pending").instructions).toContain("MODE: DISCOVERY");
  });

  it("uses MODE: CREATIVE_PROCESSING (not PREPARATION) while the Creative DNA/moodboard pipeline has not yet completed", () => {
    const instructions = buildFor("discovery_confirmed").instructions;
    expect(instructions).toContain("MODE: CREATIVE_PROCESSING");
    expect(instructions).not.toContain("MODE: PREPARATION");
    expect(instructions).toContain("never reopen it or ask further discovery questions");
    expect(instructions).toContain("call check_preparation_status");
  });

  it("only uses MODE: PREPARATION once the pipeline has actually produced its artifact", () => {
    expect(buildFor("preparation_active").instructions).toContain("MODE: PREPARATION");
  });
});
