import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../client/src/pages/MiraDashboard.tsx", import.meta.url), "utf8");
const shoot = readFileSync(new URL("../client/src/pages/MiraShoot.tsx", import.meta.url), "utf8");

describe("Segment 2 photographer desktop layout", () => {
  it("makes shoots and their existing actions dominant while keeping secondary sections compact", () => {
    expect(dashboard).toContain("Your shoots");
    expect(dashboard).toContain("Create new shoot");
    expect(dashboard).toContain("Open shoot");
    expect(dashboard).toContain("€33.33 one-time");
    expect(dashboard).toContain("Paid · active");
    expect(dashboard).toContain("xl:w-[calc(100%+5rem)]");
  });

  it("uses a wider compact shoot layout and never renders raw internal JSON", () => {
    expect(shoot).toContain("Client invitation");
    expect(shoot).toContain("Save client details");
    expect(shoot).toContain("Create or regenerate private link");
    expect(shoot).toContain("Open client view");
    expect(shoot).toContain("Copy invitation link");
    expect(shoot).toContain("SummaryStat");
    expect(shoot).not.toContain("JSON.stringify");
    expect(shoot).not.toContain("<pre");
  });
});
