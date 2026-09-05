import { describe, expect, it } from "vitest";
import { isRecordingDemoEnabled } from "./recordingDemo";

describe("MIRA_RECORDING_DEMO activation boundary", () => {
  it("requires both the recording-demo flag and local-file-store mode", () => {
    expect(isRecordingDemoEnabled("true", "development", "true")).toBe(true);
    expect(isRecordingDemoEnabled("true", "test", "true")).toBe(true);
  });

  it("stays disabled without the explicit recording-demo flag", () => {
    expect(isRecordingDemoEnabled(undefined, "development", "true")).toBe(false);
    expect(isRecordingDemoEnabled("false", "development", "true")).toBe(false);
  });

  it("stays disabled without local-file-store mode, even if the flag is set", () => {
    expect(isRecordingDemoEnabled("true", "development", "false")).toBe(false);
    expect(isRecordingDemoEnabled("true", "development", undefined)).toBe(false);
  });

  it("never activates in production, even with both flags set", () => {
    expect(isRecordingDemoEnabled("true", "production", "true")).toBe(false);
  });
});
