import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { miraV4Journeys } from "../../drizzle/schema";

const dbMocks = vi.hoisted(() => ({
  createMiraV4Journey: vi.fn(),
  getOwnedMiraV4Journey: vi.fn(),
  listMiraV4Journeys: vi.fn(),
  saveMiraV4BirthDetails: vi.fn(),
  saveMiraV4QuickContext: vi.fn(),
}));
const birthLocationMocks = vi.hoisted(() => ({
  resolveBirthLocation: vi.fn(),
  searchBirthCities: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./birthLocation", () => birthLocationMocks);

import { birthDetailsSchema, miraV4Router } from "./router";

function caller(userId = 7) {
  return miraV4Router.createCaller({ user: { id: userId }, req: {}, res: {} } as never);
}

describe("Mira V4 Stage 1", () => {
  it("declares the derived location columns used by journey creation and listing", () => {
    expect(miraV4Journeys.birthCountry.name).toBe("birthCountry");
    expect(miraV4Journeys.birthTimezone.name).toBe("birthTimezone");
  });

  it("creates and lists journeys only for the authenticated owner", async () => {
    dbMocks.createMiraV4Journey.mockResolvedValue({ journeyId: 41 });
    dbMocks.listMiraV4Journeys.mockResolvedValue([{ id: 41, userId: 7 }]);

    await expect(caller().createJourney()).resolves.toEqual({ journeyId: 41 });
    await expect(caller().listJourneys()).resolves.toEqual([{ id: 41, userId: 7 }]);
    expect(dbMocks.createMiraV4Journey).toHaveBeenCalledWith(7);
    expect(dbMocks.listMiraV4Journeys).toHaveBeenCalledWith(7);
  });

  it("saves Quick Context through the owner-scoped helper", async () => {
    dbMocks.saveMiraV4QuickContext.mockResolvedValue({ id: 41, currentStep: "birth_details" });
    const input = {
      journeyId: 41,
      building: "An editorial personal-brand studio",
      currentPosition: "The offer is clear but its world is not yet visible",
      needMost: "A coherent direction",
      firstCreation: "A private Brand Book",
    };

    await expect(caller().saveQuickContext(input)).resolves.toMatchObject({ currentStep: "birth_details" });
    expect(dbMocks.saveMiraV4QuickContext).toHaveBeenCalledWith(7, 41, {
      building: input.building,
      currentPosition: input.currentPosition,
      needMost: input.needMost,
      firstCreation: input.firstCreation,
    });
  });

  it("requires a selected city plus a time or an explicit unknown-time choice", () => {
    expect(
      birthDetailsSchema.safeParse({
        journeyId: 41,
        birthDate: "1985-01-16",
        birthTime: null,
        birthTimeUnknown: false,
        birthCity: "Vilnius",
        birthPlaceId: "place-vilnius",
      }).success,
    ).toBe(false);
    expect(
      birthDetailsSchema.safeParse({
        journeyId: 41,
        birthDate: "1985-01-16",
        birthTime: null,
        birthTimeUnknown: true,
        birthCity: "Vilnius",
        birthPlaceId: "place-vilnius",
      }).success,
    ).toBe(true);
    expect(
      birthDetailsSchema.safeParse({
        journeyId: 41,
        birthDate: "1985-01-16",
        birthTime: null,
        birthTimeUnknown: true,
        birthCity: "Vilnius",
      }).success,
    ).toBe(false);
  });

  it("searches city suggestions privately and persists country/timezone derived from the selected place", async () => {
    birthLocationMocks.searchBirthCities.mockResolvedValue([
      { placeId: "place-vilnius", description: "Vilnius, Lithuania" },
    ]);
    birthLocationMocks.resolveBirthLocation.mockResolvedValue({
      city: "Vilnius",
      country: "Lithuania",
      timezone: "Europe/Vilnius",
    });
    dbMocks.saveMiraV4BirthDetails.mockResolvedValue({ id: 41, currentStep: "recognition_ready" });

    await expect(caller().searchBirthCities({ query: "Vil" })).resolves.toEqual([
      { placeId: "place-vilnius", description: "Vilnius, Lithuania" },
    ]);
    await expect(caller().saveBirthDetails({
      journeyId: 41,
      birthDate: "1985-01-16",
      birthTime: null,
      birthTimeUnknown: true,
      birthCity: "Vilnius, Lithuania",
      birthPlaceId: "place-vilnius",
    })).resolves.toMatchObject({ id: 41 });

    expect(birthLocationMocks.searchBirthCities).toHaveBeenCalledWith("Vil");
    expect(birthLocationMocks.resolveBirthLocation).toHaveBeenCalledWith("place-vilnius");
    expect(dbMocks.saveMiraV4BirthDetails).toHaveBeenCalledWith(7, 41, {
      birthDate: "1985-01-16",
      birthTime: null,
      birthTimeUnknown: true,
      birthCity: "Vilnius",
      birthCountry: "Lithuania",
      birthTimezone: "Europe/Vilnius",
    });
  });

  it("keeps Stage 1 creation, quick-context, and birth-detail procedures free of AI and image generation", () => {
    const routerSource = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const stageOneSource = `${routerSource.slice(routerSource.indexOf("createJourney:"), routerSource.indexOf("startRecognition:"))}\n${dbSource.slice(0, dbSource.indexOf("startMiraV4Recognition"))}`;
    expect(stageOneSource).not.toContain("invokeLLM");
    expect(stageOneSource).not.toContain("generateImage");
    expect(stageOneSource).not.toContain("prepareBirthDataModule");
    expect(stageOneSource).not.toContain("Dakidarts");
  });
});
