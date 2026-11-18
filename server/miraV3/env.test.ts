import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Mira V3 feature configuration", () => {
  it("disables optional V3 features without explicit flags", async () => {
    vi.resetModules();
    vi.stubEnv("MIRA_V3_ENABLED", "");
    vi.stubEnv("MIRA_V3_BIRTH_DATA_ENABLED", "");
    vi.stubEnv("DAKIDARTS_API_KEY", "");
    const { ENV } = await import("../_core/env");
    expect(ENV.miraV3Enabled).toBe(false);
    expect(ENV.miraV3BirthDataEnabled).toBe(false);
    expect(ENV.dakidartsApiKey).toBe("");
  });

  it("reads explicit opt-in flags independently of provider availability", async () => {
    vi.resetModules();
    vi.stubEnv("MIRA_V3_ENABLED", "true");
    vi.stubEnv("MIRA_V3_BIRTH_DATA_ENABLED", "true");
    vi.stubEnv("DAKIDARTS_API_KEY", "synthetic-test-key");
    const { ENV } = await import("../_core/env");
    expect(ENV.miraV3Enabled).toBe(true);
    expect(ENV.miraV3BirthDataEnabled).toBe(true);
    expect(ENV.dakidartsApiKey).toBe("synthetic-test-key");
  });
});
