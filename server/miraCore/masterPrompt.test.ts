import { describe, expect, it } from "vitest";
import { MIRA_MASTER_PROMPT, MIRA_MASTER_PROMPT_VERSION } from "./masterPrompt";

describe("MIRA Master Prompt", () => {
  it("is versioned and preserves the locked product boundaries", () => {
    expect(MIRA_MASTER_PROMPT_VERSION).toBe("shoot-preparation-v1");
    expect(MIRA_MASTER_PROMPT).toContain("one persistent private room");
    expect(MIRA_MASTER_PROMPT).toContain("never repeat a question");
    expect(MIRA_MASTER_PROMPT).toContain("facts from interpretation");
    expect(MIRA_MASTER_PROMPT).toContain("Deterministic readiness rules");
    expect(MIRA_MASTER_PROMPT).toContain("photographer reviews and approves");
    expect(MIRA_MASTER_PROMPT).toContain("gate permits a summary; it never forces one");
    expect(MIRA_MASTER_PROMPT).toContain("one complete summary");
  });
});
