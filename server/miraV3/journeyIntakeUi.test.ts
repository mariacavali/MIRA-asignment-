import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journeySource = readFileSync(
  new URL("../../client/src/pages/MiraV3Journey.tsx", import.meta.url),
  "utf8",
);
const entrySource = readFileSync(
  new URL("../../client/src/pages/MiraV3.tsx", import.meta.url),
  "utf8",
);
const resultsSource = readFileSync(
  new URL("../../client/src/pages/MiraV3Results.tsx", import.meta.url),
  "utf8",
);

describe("Mira V3 private opening and optional image intake", () => {
  it("shows a visible welcome-video placeholder before the first answer", () => {
    expect(journeySource).toContain("turnCount === 0");
    expect(journeySource).toContain("Welcome video · placeholder");
    expect(journeySource).toContain("A short private welcome will appear here before the reflection begins.");
  });

  it("surfaces private optional image intake before the conversation response area", () => {
    const imageIntake = journeySource.indexOf("Optional image references");
    const conversationArea = journeySource.indexOf('id="mira-answer"');

    expect(imageIntake).toBeGreaterThan(-1);
    expect(conversationArea).toBeGreaterThan(imageIntake);
    expect(journeySource).toContain('"Add image"');
    expect(journeySource).toContain("Private · consent required · up to six images");
  });

  it("keeps upload and analysis separately consented and connected to private procedures", () => {
    expect(journeySource).toContain('scope: "image_upload"');
    expect(journeySource).toContain('scope: "image_analysis"');
    expect(journeySource).toContain("uploadReferenceImage.mutate");
    expect(journeySource).toContain("analyzeReferenceImage.mutate");
    expect(journeySource).toContain("Begin with Mira");
    expect(journeySource).toContain("saveBirthData.mutate");
  });

  it("distinguishes saved details from unavailable optional personalisation without blocking the conversation", () => {
    expect(journeySource).toContain("contextualSignalAvailable");
    expect(journeySource).toContain("Optional personalisation was not added.");
    expect(journeySource).toContain("Mira will continue from your own words.");
    expect(journeySource).toContain('role="status"');
  });

  it("removes material software-process language from the premium emotional path", () => {
    expect(entrySource).toContain("Stay with this");
    expect(entrySource).not.toContain("{meditationStep + 1}");
    expect(journeySource).toContain("Keep these words");
    expect(journeySource).not.toContain("Your answer was not saved");
    expect(resultsSource).toContain("Held as true");
    expect(resultsSource).toContain("Return to what Mira heard");
    expect(resultsSource).not.toContain("Confirmed document");
  });
});
