import { describe, expect, it } from "vitest";
import {
  buildLevel1FixtureAnswers,
  getNextLevel1QuestionKey,
  LEVEL1_FIXTURE_PROFILES,
  normalizeLevel1Answer,
  readStoredLevel1Answer,
  synthesizeMiraLevel1Result,
  type MiraLevel1Answers,
} from "./level1";

describe("Mira Level 1 frozen schema", () => {
  const baseAnswers: MiraLevel1Answers = {
    brand_season: {
      rawSelection: "Making the signal clearer - it works, but it is too diffuse or familiar.",
      derived: { brand_season: "making_signal_clearer" },
    },
    work_anchor: {
      rawText: "I help founders turn complexity into trusted decisions.",
      stillFindingWords: false,
      derived: {
        work_anchor: "I help founders turn complexity into trusted decisions.",
        work_anchor_confidence: "clear",
      },
    },
    desired_audience_response: {
      rawSelections: ["I could trust her with this.", "There is a real point of view here."],
      derived: {
        desired_audience_response: ["i_could_trust_her", "real_point_of_view"],
      },
    },
    social_presence: {
      rawSelection: "It sits down with the clearest point of view.",
      derived: { social_presence: "clearest_point_of_view" },
    },
    expressive_energies: {
      rawSelections: ["Precise", "Grounded"],
      rawOther: null,
      derived: {
        expressive_energies: ["precise", "grounded"],
        expressive_energy_other: null,
      },
    },
    visual_ingredients: {
      rawSelections: ["Clean space", "Built structure", "Texture"],
      derived: {
        visual_ingredients: ["clean_space", "built_structure", "texture"],
      },
    },
    protected_tension: {
      rawSelection: "Warm + precise",
      derived: { protected_tension: "warm_precise" },
    },
    anti_signals: {
      rawSelections: ["Generic and interchangeable", "Too polished to feel real"],
      rawOther: null,
      derived: {
        anti_signals: ["generic_interchangeable", "too_polished"],
        anti_signal_other: null,
      },
    },
  };

  it("returns expected next key for frozen order", () => {
    expect(getNextLevel1QuestionKey({})).toBe("brand_season");
    expect(getNextLevel1QuestionKey({ brand_season: baseAnswers.brand_season })).toBe("work_anchor");
    expect(getNextLevel1QuestionKey(baseAnswers)).toBeNull();
  });

  it("normalizes raw payload into raw and derived structures", () => {
    const normalized = normalizeLevel1Answer("anti_signals", {
      anti_signals: ["generic_interchangeable", "too_polished", "safe_expected"],
      anti_signal_other: "No cliché softness",
      rawSelections: ["Generic and interchangeable", "Too polished to feel real"],
    });

    expect(normalized.derived.anti_signals).toEqual(["generic_interchangeable", "too_polished"]);
    expect(normalized.derived.anti_signal_other).toBe("No cliché softness");
    expect(normalized.rawSelections.length).toBe(2);
  });

  it("reads canonical work and audience evidence without normalizing it twice", () => {
    const canonical = normalizeLevel1Answer("work_anchor", {
      work_anchor: "A ceramic studio making tactile tableware",
      audience: "independent hospitality founders",
      stillFindingWords: false,
    });
    expect(readStoredLevel1Answer("work_anchor", canonical as unknown as Record<string, unknown>)).toEqual(canonical);
    expect((canonical as MiraLevel1Answers["work_anchor"]).derived.audience).toBe("independent hospitality founders");
  });

  it("builds six-part brand mirror structure", () => {
    const result = synthesizeMiraLevel1Result(baseAnswers);
    expect(result.interpretationLabel).toBe("MIRA interpretation");
    expect(result.firstPattern.length).toBeGreaterThan(10);
    expect(result.whatLeads.length).toBe(3);
    expect(result.contrastToKeep).toContain("You do not need to choose between");
    expect(result.visualInstinct.length).toBeGreaterThan(10);
    expect(result.notThis.length).toBeGreaterThanOrEqual(1);
    expect(result.notThis.length).toBeLessThanOrEqual(2);
    expect(result.goDeeper).toContain("Go deeper");
  });

  it("supports all six fixture temperament profiles", () => {
    for (const profile of LEVEL1_FIXTURE_PROFILES) {
      const fixture = buildLevel1FixtureAnswers(profile);
      expect(getNextLevel1QuestionKey(fixture)).toBeNull();
      const result = synthesizeMiraLevel1Result(fixture);
      expect(result.whatLeads.length).toBe(3);
      expect(result.notThis.length).toBeGreaterThanOrEqual(1);
      expect(result.notThis.length).toBeLessThanOrEqual(2);
    }
  });

  it("does not collapse all fixture outputs to one repeated phrase", () => {
    const patterns = new Set<string>();
    const instincts = new Set<string>();
    for (const profile of LEVEL1_FIXTURE_PROFILES) {
      const result = synthesizeMiraLevel1Result(buildLevel1FixtureAnswers(profile));
      patterns.add(result.firstPattern);
      instincts.add(result.visualInstinct);
    }
    expect(patterns.size).toBeGreaterThan(3);
    expect(instincts.size).toBeGreaterThan(3);
  });

  it("enforces required selection boundaries in fixture content", () => {
    for (const profile of LEVEL1_FIXTURE_PROFILES) {
      const fixture = buildLevel1FixtureAnswers(profile);
      expect(fixture.desired_audience_response.derived.desired_audience_response.length).toBeLessThanOrEqual(2);
      expect(fixture.expressive_energies.derived.expressive_energies.length).toBe(2);
      expect(fixture.visual_ingredients.derived.visual_ingredients.length).toBeGreaterThanOrEqual(1);
      expect(fixture.visual_ingredients.derived.visual_ingredients.length).toBeLessThanOrEqual(3);
      expect(fixture.anti_signals.derived.anti_signals.length).toBeGreaterThanOrEqual(1);
      expect(fixture.anti_signals.derived.anti_signals.length).toBeLessThanOrEqual(2);
    }
  });
});
