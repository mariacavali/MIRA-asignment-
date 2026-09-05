import { describe, expect, it } from "vitest";
import {
  buildRecordingDemoCreativeDna,
  buildRecordingDemoMoodboard,
  buildRecordingDemoPreparationBrief,
  buildRecordingDemoReferences,
} from "./recordingDemoAssets";
import { miraV4CreativeDnaSchema } from "../../shared/miraV4CreativeDna";
import { RECORDING_DEMO_SCRIPTED_CONVERSATION } from "../../shared/recordingDemoScript";

describe("recording demo fixture assets", () => {
  it("builds exactly five client reference fixtures with offline data URIs and no PII", () => {
    const references = buildRecordingDemoReferences(1);
    expect(references).toHaveLength(5);
    for (const reference of references) {
      expect(reference.dataUrl.startsWith("data:image/svg+xml,")).toBe(true);
      expect(reference.description).not.toMatch(/@/); // no email-shaped strings
    }
  });

  it("builds exactly five moodboard scenes, each labeled DEMO with an offline data URI", () => {
    const images = buildRecordingDemoMoodboard(1);
    expect(images).toHaveLength(5);
    for (const image of images) {
      expect(image.direction.startsWith("DEMO:")).toBe(true);
      expect(image.url.startsWith("data:image/svg+xml,")).toBe(true);
    }
    expect(new Set(images.map(image => image.id)).size).toBe(5);
  });

  it("is deterministic per shoot id and varies across shoot ids", () => {
    const first = buildRecordingDemoMoodboard(42);
    const second = buildRecordingDemoMoodboard(42);
    const third = buildRecordingDemoMoodboard(43);
    expect(first.map(image => image.url)).toEqual(second.map(image => image.url));
    expect(first.map(image => image.url)).not.toEqual(third.map(image => image.url));
  });

  it("builds a schema-valid, clearly-labeled demo Creative DNA object without calling any model", () => {
    const dna = buildRecordingDemoCreativeDna();
    expect(() => miraV4CreativeDnaSchema.parse(dna)).not.toThrow();
    expect(dna.creativeDirection.creativeSummary).toMatch(/DEMO/);
  });

  it("builds a non-empty preparation brief from the demo Creative DNA and shoot logistics", () => {
    const brief = buildRecordingDemoPreparationBrief({ location: "Amsterdam", scheduledAt: new Date("2030-01-01T10:00:00Z"), timezone: "Europe/Amsterdam" });
    expect(brief.wardrobe.length).toBeGreaterThan(0);
    expect(brief.locationNotes.some(note => note.includes("Amsterdam"))).toBe(true);
  });
});

describe("recording demo scripted conversation", () => {
  it("is a non-empty, fixed transcript with both speakers represented", () => {
    expect(RECORDING_DEMO_SCRIPTED_CONVERSATION.length).toBeGreaterThan(0);
    const speakers = new Set(RECORDING_DEMO_SCRIPTED_CONVERSATION.map(turn => turn.speaker));
    expect(speakers.has("mira")).toBe(true);
    expect(speakers.has("elena")).toBe(true);
  });
});
