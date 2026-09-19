import { describe, expect, it } from "vitest";
import { getReminderOptions, getShootCountdown, getShootReminderAt } from "../shared/miraClientPreferences";

describe("client countdown and reminder calendar", () => {
  it("uses calendar days in the shoot timezone rather than elapsed days", () => {
    const now = new Date("2026-10-01T22:30:00Z"); // 00:30 Amsterdam
    expect(getShootCountdown("2026-10-02T08:00:00Z", "Europe/Amsterdam", now)).toBe("Today");
    expect(getShootCountdown("2026-10-03T07:00:00Z", "Europe/Amsterdam", now)).toBe("Tomorrow");
    expect(getShootCountdown("2026-10-05T07:00:00Z", "Europe/Amsterdam", now)).toBe("In 3 days");
  });
  it.each([
    ["2027-03-27T12:00:00Z", "2027-03-28T08:00:00.000Z"],
    ["2026-10-24T12:00:00Z", "2026-10-25T09:00:00.000Z"],
  ])("keeps tomorrow at 10am over European DST from %s", (now, expected) => {
    const options = getReminderOptions("2027-04-10T12:00:00Z", "Europe/Amsterdam", new Date(now));
    expect(options[0].at).toBe(expected);
    expect(options[0].label).toContain("10:00");
  });
  it("handles a non-integer UTC offset and local month rollover", () => {
    expect(getReminderOptions("2026-11-10T10:00:00Z", "Asia/Kathmandu", new Date("2026-10-31T17:00:00Z"))[0].at).toBe("2026-11-01T04:15:00.000Z");
  });
  it("does not offer tomorrow after or barely before the shoot", () => {
    expect(getReminderOptions("2026-10-02T09:00:00Z", "Europe/Amsterdam", new Date("2026-10-01T12:00:00Z")).map(item => item.choice)).toEqual(["one_hour"]);
    expect(getReminderOptions("2026-10-01T15:00:00Z", "Europe/Amsterdam", new Date("2026-10-01T12:00:00Z"))).toEqual([]);
  });
  it("is safe for missing, past or invalid dates and timezone", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    for (const scheduledAt of [null, "bad", "2026-10-01T11:00:00Z"]) {
      expect(getShootCountdown(scheduledAt, "Europe/Amsterdam", now)).toBeNull();
      expect(getReminderOptions(scheduledAt, "Europe/Amsterdam", now)).toEqual([]);
    }
    expect(getShootCountdown("2026-10-15T10:00:00Z", "Bad/Zone", now)).toBeNull();
    expect(getReminderOptions("2026-10-15T10:00:00Z", "Bad/Zone", now)).toEqual([]);
    expect(getShootReminderAt("2026-10-25T13:00:00Z", "Europe/Amsterdam", now)?.toISOString()).toBe("2026-10-24T08:00:00.000Z");
  });
});
