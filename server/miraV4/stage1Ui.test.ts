import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const entrySource = readFileSync(new URL("../../client/src/pages/MiraV4.tsx", import.meta.url), "utf8");
const journeySource = readFileSync(new URL("../../client/src/pages/MiraV4Journey.tsx", import.meta.url), "utf8");
const v4DbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("Mira V4 staged UI", () => {
  it("mounts isolated V4 routes while preserving all V3 routes", () => {
    expect(appSource).toContain('path={"/mira-v4"}');
    expect(appSource).toContain('path={"/mira-v4/journey/:journeyId"}');
    expect(appSource).toContain('path={"/mira-v3"}');
    expect(appSource).toContain('path={"/mira-v3/journey/:journeyId"}');
  });

  it("reuses the existing Mira shell and presents the approved Creative Director alignment", () => {
    expect(entrySource).toContain('import { MiraShell } from "./MiraV3"');
    expect(journeySource).toContain('import { MiraShell } from "./MiraV3"');
    expect(journeySource).toContain("Quick Context");
    expect(journeySource).toContain("Birth Details");
    expect(journeySource).toContain("Continue to creative direction");
    expect(journeySource).toContain("ConversationPanel");
    expect(journeySource).toContain("Creative Discovery");
    expect(journeySource).toContain("Brand Blueprint preview");
    expect(journeySource).toContain("Optional inspiration");
    expect(journeySource).toContain("five bounded visual directions");
    expect(journeySource).toContain("one final Moodboard of five connected images");
    expect(journeySource).not.toContain("generateImage");
    expect(journeySource).not.toContain("renderPdf");
  });

  it("uses selected-city autocomplete and automatic country/timezone derivation", () => {
    expect(journeySource).toContain("searchBirthCities.useQuery");
    expect(journeySource).toContain("birthPlaceId");
    expect(journeySource).toContain("Choose a city from the suggested locations");
    expect(journeySource).toContain("country and timezone automatically");
    expect(journeySource).toContain("I do not know my exact birth time");
  });

  it("asks for reference context only after an image is uploaded", () => {
    expect(journeySource).toContain("{props.savedName && <label");
    expect(journeySource).toContain("What draws you to it?");
  });

  it("uses the approved Quick Context evidence language without renaming persisted fields", () => {
    expect(journeySource).toContain("What is your work or brand about?");
    expect(journeySource).toContain("What is your current relationship to it?");
    expect(journeySource).toContain("How do you want people to feel?");
    expect(journeySource).toContain("What do you hope this Moodboard helps you create?");
    expect(journeySource).toContain("The work, offer, practice, or idea taking shape.");
    expect(journeySource).toContain("The emotional response you hope your work can create.");
    expect(journeySource).toContain("Let Mira hold this context");
    expect(journeySource).toContain("building: journey.data.building");
    expect(journeySource).toContain("currentPosition: journey.data.currentPosition");
    expect(journeySource).toContain("needMost: journey.data.needMost");
    expect(journeySource).toContain("firstCreation: journey.data.firstCreation");
  });

  it("renders an understandable Mira Studio sample for every selectable typography option", () => {
    expect(journeySource).toContain("TYPOGRAPHY_SAMPLES");
    expect(journeySource).toContain(">Mira Studio</span>");
    expect(journeySource).toContain('"Editorial serif": "font-serif');
    expect(journeySource).toContain('"Quiet sans": "font-sans');
    expect(journeySource).toContain('"Expressive display": "mira-display');
    expect(journeySource).toContain('Humanist: "font-sans');
    expect(journeySource).toContain("<button key={choice} type=\"button\"");
  });

  it("keeps the approved Stage 3 order without a branching workflow", () => {
    expect(v4DbSource).toContain('currentStep: recognitionComplete ? "creative_discovery" : "recognition"');
    expect(v4DbSource).toContain('currentStep: creativeComplete ? "creative_brief" : "creative_discovery"');
    expect(v4DbSource).toContain('.set({ creativeInputs, currentStep: "inspiration" })');
  });

  it("positions the Brand Blueprint preview as a derived layer over existing V4 evidence", () => {
    expect(journeySource).toContain("This preview is a derived reading of your evidence");
    expect(journeySource).toContain("Your raw answers and later visual evidence still remain underneath the V4 system");
    expect(journeySource).toContain("Optional visual calibration");
    expect(journeySource).toContain("Continue to visual references");
  });
});
