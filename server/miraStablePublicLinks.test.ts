import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MIRA stable invitation links", () => {
  it("requires the configured public base and does not fall back to request origin", () => {
    const source = readFileSync(new URL("./miraCore/delivery.ts", import.meta.url), "utf8");
    expect(source).toContain("process.env.MIRA_PUBLIC_APP_BASE_URL ?? ENV.publicAppBaseUrl");
    expect(source).not.toContain("ENV.publicAppBaseUrl || requestOrigin");
    expect(source).toContain("MIRA_PUBLIC_APP_BASE_URL is not configured");
    expect(source).toContain("`${preparationUrl}#mira-preparation`");
  });

  it("provides an accessible preparation target inside the private Shoot Room", () => {
    const source = readFileSync(new URL("../client/src/pages/MiraShootRoom.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="mira-preparation"');
    expect(source).toContain('window.location.hash === "#mira-preparation"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("focus({ preventScroll: true })");
  });
});
