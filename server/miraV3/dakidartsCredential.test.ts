import { describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { createConfiguredBirthDataProvider, prepareBirthDataModule } from "./birthData";

const runLiveCredentialCheck = process.env.RUN_DAKIDARTS_CREDENTIAL_TEST === "true";

describe.runIf(runLiveCredentialCheck)("Dakidarts credential", () => {
  it("authorizes one lightweight approved birth-date request", async () => {
    expect(ENV.miraV3BirthDataEnabled).toBe(true);
    expect(ENV.dakidartsApiKey.trim().length).toBeGreaterThan(0);

    const baseUrl = ENV.dakidartsApiBaseUrl.replace(/\/$/, "");
    const endpoint = new URL(`${baseUrl}/life_path`);
    endpoint.searchParams.set("birth_year", "1990");
    endpoint.searchParams.set("birth_month", "5");
    endpoint.searchParams.set("birth_day", "15");
    endpoint.searchParams.set("lang", "en");

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "X-API-Key": ENV.dakidartsApiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.ok, `Dakidarts credential check returned HTTP ${response.status}`).toBe(true);
    const payload = await response.json();
    expect(payload).toBeTypeOf("object");
  }, 20_000);

  it("completes all approved calls and returns one private Recognition Layer", async () => {
    const provider = createConfiguredBirthDataProvider({
      apiKey: ENV.dakidartsApiKey,
      baseUrl: ENV.dakidartsApiBaseUrl,
    });
    expect(provider).toBeDefined();

    const result = await prepareBirthDataModule({
      fullNameAtBirth: "Jordan Lee Taylor",
      birthDate: "1990-05-15",
      birthTime: "",
      timezone: "Europe/London",
      birthCity: "London",
      birthCountry: "United Kingdom",
    }, provider);

    expect(result.status).toBe("complete");
    expect(result.output.available).toBe(true);
    expect(result.output.recognitionLayer).toEqual({
      confidence: expect.stringMatching(/^(tentative|supporting)$/),
      contextSummary: expect.any(String),
      adaptiveQuestionLens: expect.any(String),
    });
    expect(result.provenance).toMatchObject({
      provider: "private-recognition-layer",
      rawResponseStored: false,
    });
    expect(result).not.toHaveProperty("rawResponse");
  }, 30_000);
});
