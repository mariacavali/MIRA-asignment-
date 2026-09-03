import { describe, expect, it } from "vitest";
import { isLocalAuthEnabled } from "./context";

describe("local authentication boundary", () => {
  it("requires development or test mode and the explicit flag", () => {
    expect(isLocalAuthEnabled("development", "true")).toBe(true);
    expect(isLocalAuthEnabled("test", "true")).toBe(true);
    expect(isLocalAuthEnabled("production", "true")).toBe(false);
    expect(isLocalAuthEnabled("development", "false")).toBe(false);
    expect(isLocalAuthEnabled("development", undefined)).toBe(false);
  });
});