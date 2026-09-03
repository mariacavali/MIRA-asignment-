import { describe, expect, it } from "vitest";
import { calculateInvitationExpiry, calculateShootAccessDeadline } from "./db";

describe("MIRA invitation access window", () => {
  it("expires 24 hours after the scheduled shoot ends", () => {
    const expiry = calculateInvitationExpiry(new Date("2026-09-02T16:00:00.000Z"), "Europe/Amsterdam", 7, 90);
    expect(expiry.toISOString()).toBe("2026-09-03T17:30:00.000Z");
  });

  it("keeps the short fallback window for an unscheduled shoot", () => {
    const now = Date.now();
    const expiry = calculateInvitationExpiry(null, "UTC", 7).getTime();
    expect(expiry - now).toBeGreaterThan(6.99 * 86_400_000);
    expect(expiry - now).toBeLessThan(7.01 * 86_400_000);
  });

  it("uses the exact boundary before, during, and after the 24-hour close window", () => {
    const start = new Date("2026-10-15T08:00:00.000Z");
    const deadline = calculateShootAccessDeadline(start, 60, new Date("2026-10-01T00:00:00.000Z"));
    expect(deadline.toISOString()).toBe("2026-10-16T09:00:00.000Z");
    expect(start.getTime()).toBeLessThan(deadline.getTime());
    expect(new Date("2026-10-15T08:30:00.000Z").getTime()).toBeLessThan(deadline.getTime());
    expect(new Date("2026-10-16T09:00:00.000Z").getTime()).toBeGreaterThanOrEqual(deadline.getTime());
  });

  it("recalculates a rescheduled deadline and preserves legacy fallback data", () => {
    const legacyExpiry = new Date("2026-10-10T00:00:00.000Z");
    expect(calculateShootAccessDeadline(new Date("2026-10-20T08:00:00.000Z"), 120, legacyExpiry).toISOString()).toBe("2026-10-21T10:00:00.000Z");
    expect(calculateShootAccessDeadline(null, null, legacyExpiry)).toBe(legacyExpiry);
    expect(calculateShootAccessDeadline(new Date("2026-10-20T08:00:00.000Z"), null, legacyExpiry)).toBe(legacyExpiry);
  });
});
