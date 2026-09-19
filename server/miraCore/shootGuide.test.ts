import { describe, expect, it } from "vitest";
import { buildBrandShotGuides, compileGuidedShootCampaign } from "./shootGuide";
import { buildDemoMiraV4CreativeDna } from "./demoCreativeDna";
import { mapCompletedMoodboardImages } from "./moodboardAdapter";
import type { ClientBrief } from "../../shared/miraClientBrief";

const source = { journey: { building: "Furniture studio", currentPosition: null, needMost: "Approachable expertise", firstCreation: "Website portraits", birthDate: null, birthTime: null, birthTimeUnknown: 1, birthCity: null, creativeInputs: null }, conversation: [], inspiration: { imageReference: null, userExplanation: null, influenceRule: "supporting_evidence_only" as const } };
const dna = buildDemoMiraV4CreativeDna(source);
const brief: ClientBrief = { brandFeel: ["Warm & approachable"], posingSupport: "I prefer seated or still poses", comfortNote: "No eye contact", brandPages: [], savedAt: new Date().toISOString() };

describe("usable brand shoot guidance", () => {
  it("keeps seated preferences and avoids forced eye contact", () => {
    const guides = buildBrandShotGuides(dna, brief);
    expect(guides).toHaveLength(5);
    for (const guide of guides.slice(0, 4)) {
      expect(guide.steps[0]).toContain("seated");
      expect(guide.steps.join(" ")).not.toContain("steps at your own pace");
    }
    expect(guides[0].gaze).toContain("beside the camera");
    expect(guides[0].purpose).toContain(dna.creativeEssence.desiredImpact);
    expect(guides.every(guide => guide.easierOption && guide.hands && guide.gaze)).toBe(true);
  });
  it("only adds walking when requested, with a still alternative", () => {
    expect(buildBrandShotGuides(dna)[3].steps.join(" ")).not.toContain("steps at your own pace");
    const moving = buildBrandShotGuides(dna, { ...brief, posingSupport: "I enjoy gentle movement", comfortNote: "" });
    expect(moving[3].steps.join(" ")).toContain("steps at your own pace");
    expect(moving[3].easierOption).toContain("comfortable position");
    const blocked = buildBrandShotGuides(dna, { ...brief, posingSupport: "I enjoy gentle movement", comfortNote: "No walking" });
    expect(blocked[3].steps.join(" ")).not.toContain("steps at your own pace");
  });
  it("uses the same action in the image plan and client card, while retaining brand light and palette", () => {
    const { campaignPlan, guides, compositeImagePrompt } = compileGuidedShootCampaign(dna, brief);
    expect(campaignPlan.campaignLanguage.colourPalette).toEqual(dna.visualWorld.colourWorld.colours);
    expect(campaignPlan.campaignLanguage.lighting).toEqual(dna.visualWorld.light);
    expect(campaignPlan.scene_1.movement).toContain(guides[0].steps[0]);
    expect(compositeImagePrompt).toContain(guides[0].title.toUpperCase());
    expect(campaignPlan.scene_5.composition).toContain("close detail");
  });
  it("reads persisted cards from MariaDB JSON strings without inventing guidance for old images", () => {
    const guide = buildBrandShotGuides(dna, brief)[0];
    const rows = [{ id: "one", direction: "Portrait", url: "https://cdn.example/image.png", shootGuide: guide }];
    expect(mapCompletedMoodboardImages("complete", JSON.stringify(rows))[0].shootGuide).toEqual(guide);
    expect(mapCompletedMoodboardImages("complete", [{ ...rows[0], shootGuide: { invalid: true } }])[0]).not.toHaveProperty("shootGuide");
    expect(mapCompletedMoodboardImages("pending", rows)).toEqual([]);
  });
});
