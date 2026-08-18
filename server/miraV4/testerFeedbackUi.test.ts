import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const discover = readFileSync(new URL("../../client/src/pages/MiraLevel1Journey.tsx", import.meta.url), "utf8");
const create = readFileSync(new URL("../../client/src/pages/MiraLevel2Create.tsx", import.meta.url), "utf8");

describe("external tester feedback regressions", () => {
  it("does not offer a dead shortcut around DEEPER", () => {
    expect(discover).not.toContain("Skip to CREATE");
    expect(discover).not.toContain("/mira-v4/journey/${journeyId}");
  });
  it("uses selection then Continue consistently in DISCOVER", () => {
    expect(discover).not.toContain("queueAutoAdvance");
    expect(discover).not.toContain("autoTimerRef");
    expect(discover).toContain("Continue");
  });

  it("generates one persisted frame per request and exposes safe resume", () => {
    expect(create).toContain("for (const frameId of ordered)");
    expect(create).toContain("frameIds: [frameId]");
    expect(create).toContain("} catch {");
    expect(create).toContain("waitForFrameToSettle(frameId)");
    expect(create).toContain("Retry this frame");
    expect(create).toContain("Completed frames are safe");
    expect(create).toContain("generationUi.showFailureUi");
    expect(create).not.toContain("{generate.error ?");
    expect(create).not.toContain("generate.mutate({ journeyId })");
  });
});
