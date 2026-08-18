import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  birthDataInputSchema,
  buildApprovedDakidartsRequests,
  buildHiddenRecognitionLayer,
  createConfiguredBirthDataProvider,
  normalizeBirthData,
  normalizeBirthIntelligence,
  prepareBirthDataModule,
  publicBirthDataResult,
} from "./birthData";

const validInput = {
  fullNameAtBirth: "  Maria Elise Cavali  ",
  birthDate: "1990-02-28",
  birthTime: "09:45",
  timezone: "Europe/Amsterdam",
  birthCity: "  Amsterdam  ",
  birthCountry: " Netherlands ",
};

describe("Mira V3 birth data", () => {
  it("normalizes a valid intake without interpreting it", () => {
    expect(normalizeBirthData(validInput)).toEqual({ ...validInput, fullNameAtBirth: "Maria Elise Cavali", birthCity: "Amsterdam", birthCountry: "Netherlands" });
  });

  it("rejects impossible dates, times, future dates, and timezones", () => {
    expect(birthDataInputSchema.safeParse({ ...validInput, birthDate: "1990-02-31" }).success).toBe(false);
    expect(birthDataInputSchema.safeParse({ ...validInput, birthDate: "2990-02-28" }).success).toBe(false);
    expect(birthDataInputSchema.safeParse({ ...validInput, birthTime: "25:00" }).success).toBe(false);
    expect(birthDataInputSchema.safeParse({ ...validInput, birthTime: "" }).success).toBe(true);
    expect(birthDataInputSchema.safeParse({ ...validInput, fullNameAtBirth: "Maria" }).success).toBe(false);
    expect(birthDataInputSchema.safeParse({ ...validInput, timezone: "Somewhere/Imaginary" }).success).toBe(false);
  });

  it("fails gracefully when no provider is configured", async () => {
    const prepared = await prepareBirthDataModule(validInput);
    expect(prepared.status).toBe("unavailable");
    expect(prepared.output).toEqual({
      available: false,
      recognitionLayer: null,
      statusMessage: "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.",
    });
    expect(publicBirthDataResult({ status: prepared.status, normalizedResult: { output: prepared.output } })).toEqual({
      status: "unavailable",
      output: {
        saved: true,
        contextualSignalAvailable: false,
        statusMessage: "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.",
      },
    });
  });

  it("keeps normalized intake and explicit provenance when a provider fails", async () => {
    const prepared = await prepareBirthDataModule(validInput, {
      id: "test-provider",
      interpret: async () => { throw new Error("offline"); },
    });
    expect(prepared.status).toBe("failed");
    expect(prepared.input.birthCity).toBe("Amsterdam");
    expect(prepared.output).toMatchObject({
      available: false,
      recognitionLayer: null,
      statusMessage: "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.",
    });
    expect(prepared.provenance).toMatchObject({ provider: "test-provider", fallback: true });
  });

  it("makes exactly thirteen approved requests with a server-only API-key header", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      profile: { traits: ["thoughtful", "independent", "practical"] },
      lucky_number: 7,
      sign: "vendor-label",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = createConfiguredBirthDataProvider({ apiKey: "server-secret", fetchImpl });
    const prepared = await prepareBirthDataModule(validInput, provider);

    expect(fetchImpl).toHaveBeenCalledTimes(13);
    const [requestUrl, requestInit] = fetchImpl.mock.calls[0]!;
    expect(String(requestUrl)).toContain("https://api.numerologyapi.com/api/v1/life_path?");
    expect(String(requestUrl)).toContain("birth_year=1990");
    expect(requestInit?.headers).toMatchObject({ "X-API-Key": "server-secret" });
    const requestedPaths = fetchImpl.mock.calls.map(call => new URL(String(call[0])).pathname);
    expect(requestedPaths).toEqual(buildApprovedDakidartsRequests(normalizeBirthData(validInput)).map(request => `/api/v1${request.path}`));
    expect(requestedPaths.join(" ")).not.toContain("horoscope");
    expect(prepared.status).toBe("complete");
    expect(prepared.provenance).toMatchObject({ rawResponseStored: false });
    expect(JSON.stringify(prepared)).not.toContain("lucky_number");
    expect(JSON.stringify(prepared)).not.toContain("vendor-label");
    expect(JSON.stringify(prepared)).not.toContain("server-secret");
  });

  it("collapses textual traits into one bounded neutral Recognition Layer and ignores numbers", () => {
    const recognitionLayer = normalizeBirthIntelligence({
      report: ["creative", "independent", "practical", "steady", "organized", "extra"],
      numbers: [1, 3, 8, 22],
    });
    expect(recognitionLayer).toEqual(expect.objectContaining({
      confidence: "tentative",
      contextSummary: expect.any(String),
      adaptiveQuestionLens: expect.any(String),
    }));
    expect(JSON.stringify(recognitionLayer)).not.toMatch(/\b(?:1|3|8|22)\b/);
    expect(JSON.stringify(recognitionLayer)).not.toMatch(/life path|heart desire|numerolog|Dakidarts/i);
  });

  it("returns only a redacted public status while retaining one private Recognition Layer server-side", async () => {
    const prepared = await prepareBirthDataModule(validInput, {
      id: "private-provider",
      interpret: async () => ({ recognitionLayer: normalizeBirthIntelligence({ traits: ["creative", "independent"] }) }),
    });
    const module = { status: prepared.status, normalizedResult: { input: prepared.input, output: prepared.output, provenance: prepared.provenance } };

    expect(publicBirthDataResult(module)).toEqual({
      status: "complete",
      output: { saved: true, contextualSignalAvailable: true, statusMessage: "Optional birth context saved." },
    });
    expect(buildHiddenRecognitionLayer(module)).toEqual(expect.objectContaining({ confidence: "tentative" }));
    expect(JSON.stringify(publicBirthDataResult(module))).not.toContain("adaptiveQuestionLens");
  });
});
