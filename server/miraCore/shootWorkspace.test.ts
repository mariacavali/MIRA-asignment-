import { describe, expect, it } from "vitest";
import {
  formatShootDate,
  readShootDirection,
  shootWorkspaceProgress,
} from "../../client/src/lib/shootWorkspace";
import { buildDemoMiraV4CreativeDna } from "./demoCreativeDna";

describe("photographer workflow", () => {
  it("offers the first missing step based on saved work, not page visits", () => {
    expect(shootWorkspaceProgress({ ready: false })).toMatchObject({
      percent: 0,
      next: 1,
    });
    expect(
      shootWorkspaceProgress({
        clientName: "Maria",
        clientEmail: "client@example.com",
        ready: false,
      })
    ).toMatchObject({ percent: 33, next: 2 });
    expect(
      shootWorkspaceProgress({
        clientName: "Maria",
        clientEmail: "client@example.com",
        deliveryStatus: "sent",
        ready: false,
      })
    ).toMatchObject({ percent: 67, next: 3 });
    expect(
      shootWorkspaceProgress({
        clientName: "Maria",
        clientEmail: "client@example.com",
        deliveryStatus: "completed",
        ready: true,
      })
    ).toMatchObject({ percent: 100, next: 3 });
  });
  it.each(["created", "queued", "failed"])(
    "does not count a %s invitation as sent",
    deliveryStatus => {
      expect(
        shootWorkspaceProgress({
          clientName: "Maria",
          clientEmail: "client@example.com",
          deliveryStatus,
          ready: false,
        }).completed[1]
      ).toBe(false);
    }
  );
  it("handles persisted JSON as either objects or strings without inventing a brief", () => {
    const dna = buildDemoMiraV4CreativeDna({
      journey: {
        building: "Studio",
        currentPosition: null,
        needMost: null,
        firstCreation: null,
        birthDate: null,
        birthTime: null,
        birthTimeUnknown: 1,
        birthCity: null,
        creativeInputs: null,
      },
      conversation: [],
      inspiration: {
        imageReference: null,
        userExplanation: null,
        influenceRule: "supporting_evidence_only",
      },
    });
    expect(readShootDirection(dna)).toEqual(dna);
    expect(readShootDirection(JSON.stringify(dna))).toEqual(dna);
    expect(readShootDirection("bad JSON")).toBeNull();
    expect(readShootDirection({ status: "complete" })).toBeNull();
  });
  it("does not crash the workspace on missing dates or invalid timezones", () => {
    expect(formatShootDate(null)).toBe("Date not set");
    expect(formatShootDate("invalid")).toBe("Date needs checking");
    expect(formatShootDate("2026-09-20T12:00:00Z", "invalid/zone")).toBe(
      "Date needs checking"
    );
    expect(
      formatShootDate("2026-09-20T12:00:00Z", "Europe/Amsterdam")
    ).not.toBe("Date needs checking");
  });
});
