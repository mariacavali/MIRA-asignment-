import { describe, expect, it } from "vitest";
import { isStrongCompletionStatement, shouldActivateShootPreparation } from "../../shared/miraCore";

describe("explicit client completion detection", () => {
  it.each([
    "I think we're done now, this is exactly what I need.",
    "That's everything for today.",
    "I'm finished, thank you.",
    "Nothing else for now.",
    "All set, thanks!",
  ])("recognizes clear completion language: %s", statement => {
    expect(isStrongCompletionStatement(statement)).toBe(true);
  });

  it.each([
    "Thanks!",
    "Sounds good.",
    "Great, that helps.",
    "Okay, cool.",
    "Yes, I like the beach idea.",
  ])("does not treat ordinary politeness as completion: %s", statement => {
    expect(isStrongCompletionStatement(statement)).toBe(false);
  });
});

describe("Preparation activation gate", () => {
  it("does not activate Preparation when Creative DNA synthesis failed", () => {
    expect(shouldActivateShootPreparation("retryable_error", "retryable_error")).toBe(false);
  });

  it("does not activate Preparation when Creative DNA succeeded but the moodboard did not", () => {
    expect(shouldActivateShootPreparation("complete", "retryable_error")).toBe(false);
  });

  it("activates Preparation only once both Creative DNA and the moodboard artifact are complete", () => {
    expect(shouldActivateShootPreparation("complete", "complete")).toBe(true);
  });
});
