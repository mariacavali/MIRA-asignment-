import { describe, expect, it } from "vitest";
import { ENV } from "../_core/env";

describe("Mira V3 staging flags", () => {
  it("enables the private core route and Dakidarts birth intelligence", () => {
    expect(ENV.miraV3Enabled).toBe(true);
    expect(ENV.miraV3BirthDataEnabled).toBe(true);
    expect(ENV.dakidartsApiKey.trim().length).toBeGreaterThan(0);
  });
});
