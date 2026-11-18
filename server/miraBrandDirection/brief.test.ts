import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareDirectionBrief } from "./brief";
import { directionBriefText } from "../../shared/miraDirectionBriefText";
import type { BrandConfiguration } from "../../shared/miraBrandDirection";
import type { InterviewArea, InterviewReflection } from "../../shared/miraInterview";

const configuration: BrandConfiguration = { segment: "personal_brand", accessMethod: "standalone_brand", discoveryDepth: "deep", brandStage: "starting", shootId: null, shootFormat: null };
function reflection(areas: InterviewArea[], reviewed = true): InterviewReflection {
  const memoryId = randomUUID();
  return { fingerprint: "a".repeat(64), reviewed,
    answers: areas.map(area => ({ area, memoryId, text: "Client's exact reviewed words — keep the metaphor.", kind: "explicit", status: reviewed ? "confirmed" : "proposed", proposalId: null })),
    unresolved: (["intended_use", "offer", "audience", "desired_understanding", "meaningful_evidence", "voice", "visual_preferences", "visual_boundaries"] as const)
      .filter(area => !areas.includes(area)).map(area => ({ area, status: "missing" })),
  };
}
const allAreas: InterviewArea[] = ["intended_use", "offer", "audience", "desired_understanding", "meaningful_evidence", "voice", "visual_preferences", "visual_boundaries"];

describe("confirmed direction preparation", () => {
  it("withholds unreviewed and corrected meaning without manufacturing a direction", () => {
    const draft = reflection(["offer"], false);
    const brief = prepareDirectionBrief({ revision: 3, configuration, reflection: draft });
    expect(brief.state).toBe("needs_confirmation"); expect(brief.statements).toEqual([]);
    expect(brief.dimensions.every(item => !item.ready)).toBe(true);
    expect(() => directionBriefText(brief)).toThrow("Confirm your current reflection");
    const mixed = { ...draft, answers: [{ ...draft.answers[0], status: "confirmed" as const }] };
    expect(prepareDirectionBrief({ revision: 3, configuration, reflection: mixed }).statements).toEqual([]);
  });
  it("preserves exact reviewed words once when one answer covers several areas", () => {
    const source = reflection(allAreas), brief = prepareDirectionBrief({ revision: 4, configuration, reflection: source });
    expect(brief).toMatchObject({ state: "ready", revision: 4, reflectionFingerprint: source.fingerprint });
    expect(brief.statements).toHaveLength(1);
    expect(brief.statements[0]).toMatchObject({ text: source.answers[0].text, areas: allAreas, kind: "explicit" });
    expect(brief.dimensions.every(item => item.ready)).toBe(true);
    const exported = directionBriefText(brief);
    expect(exported.split(source.answers[0].text)).toHaveLength(2);
    expect(exported).toContain("Creative recommendations and the Brand Book have their own later review");
  });
  it("allows a partial brief while preserving uncertainty and skipped areas", () => {
    const source = reflection(["intended_use", "visual_preferences", "visual_boundaries"]);
    source.unresolved = [{ area: "audience", status: "unknown" }, { area: "voice", status: "declined" }];
    const brief = prepareDirectionBrief({ revision: 4, configuration, reflection: source });
    expect(brief.state).toBe("partial");
    expect(brief.dimensions.find(item => item.dimension === "visual.direction")?.ready).toBe(true);
    expect(brief.dimensions.find(item => item.dimension === "brand.meaning")?.missing).toContain("audience");
    expect(directionBriefText(brief)).toContain("People you want to reach: uncertain");
    expect(directionBriefText(brief)).toContain("Your preferred voice: skipped");
    expect(brief.unresolved).toEqual(source.unresolved);
  });
  it("keeps established identity open until the client has reviewed what to preserve", () => {
    const source = reflection(allAreas);
    const brief = prepareDirectionBrief({ revision: 4, configuration: { ...configuration, brandStage: "evolving" }, reflection: source });
    expect(brief.state).toBe("partial");
    expect(brief.dimensions.find(item => item.dimension === "visual.direction")).toMatchObject({ ready: false, missing: ["existing_identity"] });
  });
  it("binds the snapshot to configuration, exact text, current revision and reflection", () => {
    const source = reflection(["offer"]), input = { revision: 4, configuration, reflection: source };
    const initial = prepareDirectionBrief(input).fingerprint;
    expect(prepareDirectionBrief(input).fingerprint).toBe(initial);
    expect(prepareDirectionBrief({ ...input, revision: 5 }).fingerprint).not.toBe(initial);
    expect(prepareDirectionBrief({ ...input, configuration: { ...configuration, brandStage: "evolving" } }).fingerprint).not.toBe(initial);
    expect(prepareDirectionBrief({ ...input, reflection: { ...source, answers: [{ ...source.answers[0], text: "Corrected meaning" }] } }).fingerprint).not.toBe(initial);
    expect(prepareDirectionBrief({ ...input, reflection: { ...source, fingerprint: "b".repeat(64) } }).fingerprint).not.toBe(initial);
  });
  it("does not relabel personal or business journeys as the personal-brand brief", () => {
    for (const segment of ["personal", "small_business"] as const) {
      const brief = prepareDirectionBrief({ revision: 1, configuration: { ...configuration, segment, accessMethod: "paid_shoot" }, reflection: reflection(allAreas) });
      expect(brief).toMatchObject({ state: "unavailable", statements: [], dimensions: [], reflectionFingerprint: null });
    }
    expect(prepareDirectionBrief({ revision: 0, configuration: null, reflection: null }).state).toBe("unavailable");
  });
  it("fails closed for contradictory text or provisional entries labelled as reviewed", () => {
    const source = reflection(["offer", "audience"]);
    source.answers[1].text = "Contradictory text under the same memory ID";
    expect(() => prepareDirectionBrief({ revision: 1, configuration, reflection: source })).toThrow("Conflicting source text");
    source.answers[1].text = source.answers[0].text; source.answers[1].status = "proposed";
    expect(() => prepareDirectionBrief({ revision: 1, configuration, reflection: source })).toThrow("provisional meaning");
  });
});
