import { describe, expect, it } from "vitest";
import {
  buildLevel2FixtureAnswers,
  buildLevel2SecondaryHypotheses,
  getNextLevel2QuestionKey,
  LEVEL2_FIXTURE_PROFILES,
  normalizeLevel2Answer,
  readStoredLevel2Answer,
  synthesizeMiraLevel2Preparation,
  type MiraLevel2Answers,
} from "./level2";
import type { MiraLevel1Result } from "./level1";

describe("Mira Level 2 DEEPER schema", () => {
  const level1Result: MiraLevel1Result = {
    firstPattern: "Your brand is becoming more visible while protecting precision.",
    whatLeads: [
      { cluster: "Signal", note: "Clear point of view" },
      { cluster: "Tone", note: "Calm confidence" },
      { cluster: "Direction", note: "Structured movement" },
    ],
    contrastToKeep: "You do not need to choose between warmth and precision.",
    visualInstinct: "Clean structure with lived texture.",
    notThis: ["Generic polish"],
    goDeeper: "Go deeper to calibrate visual evidence.",
    interpretationLabel: "MIRA interpretation",
  };

  const baseAnswers: MiraLevel2Answers = {
    core_tension_probe: {
      rawText: "Keep the work intimate while making the point unmistakable.",
      derived: { anchorLine: "Keep the work intimate while making the point unmistakable.", confidence: "clear" },
    },
    ab_visual_calibration: {
      rawPairs: [{
        pairId: "pair_1",
        optionA: "Deep shadow",
        optionB: "Flat daylight",
        chosen: "A",
        rationale: "Shadow keeps emotional precision.",
        confidence: 4,
      }],
      derived: {
        directionalBias: "A",
        recurringReason: "Shadow keeps emotional precision.",
      },
    },
    reference_interpretation: {
      rawReferences: [{
        referenceId: "ref_1",
        observedSignal: "Tactile tailoring with restrained contrast",
        supportsDirection: true,
        confidence: 4,
      }],
      derived: {
        keptSignals: ["Tactile tailoring with restrained contrast"],
        rejectedSignals: [],
      },
    },
    notion_intelligence: {
      rawManualContext: "Client notes repeatedly mention calm authority.",
      rawSignals: [{ source: "notion", signal: "Calm authority", confidence: 4 }],
      derived: { status: "available", failOpenReason: null },
    },
    create_preparation: {
      rawDirection: "Editorial intimacy with disciplined contrast.",
      rawGuardrails: ["No generic luxury styling"],
      rawExperiments: ["Test one close interior frame"],
      derived: {
        direction: "Editorial intimacy with disciplined contrast.",
        guardrails: ["No generic luxury styling"],
        experiments: ["Test one close interior frame"],
      },
    },
  };

  it("returns expected next key in fixed Level 2 order", () => {
    expect(getNextLevel2QuestionKey({})).toBe("core_tension_probe");
    expect(getNextLevel2QuestionKey({ core_tension_probe: baseAnswers.core_tension_probe })).toBe("ab_visual_calibration");
    expect(getNextLevel2QuestionKey(baseAnswers)).toBeNull();
  });

  it("normalizes A/B capture into deterministic derived bias", () => {
    const normalized = normalizeLevel2Answer("ab_visual_calibration", {
      pairs: [
        { pairId: "pair_1", optionA: "Deep shadow", optionB: "Flat daylight", chosen: "A", rationale: "A is stronger", confidence: 5 },
        { pairId: "pair_2", optionA: "Structured frame", optionB: "Loose frame", chosen: "B", rationale: "B adds movement", confidence: 3 },
      ],
    });
    expect(normalized.rawPairs.length).toBe(2);
    expect(["A", "B", "balanced"]).toContain(normalized.derived.directionalBias);
  });

  it("builds provenance-aware DEEPER synthesis with strict evidence hierarchy", () => {
    const synthesis = synthesizeMiraLevel2Preparation({
      answers: baseAnswers,
      level1Result,
      secondaryHypotheses: {
        numerology: {
          status: "unavailable",
          confidence: "low",
          contextSummary: "No optional numerology context.",
          lens: "No secondary lens.",
          source: "none",
        },
        humanDesign: {
          status: "unavailable",
          confidence: "low",
          note: "No active Human Design integration.",
          source: "none",
        },
      },
    });

    expect(synthesis.evidenceHierarchy.primary).toContain("User-stated evidence");
    expect(synthesis.evidenceHierarchy.tertiary).toContain("secondary hypotheses");
    expect(synthesis.createPreparation.direction.length).toBeGreaterThan(10);
  });

  it("supports all Level 2 fixture profiles", () => {
    for (const profile of LEVEL2_FIXTURE_PROFILES) {
      const fixture = buildLevel2FixtureAnswers(profile);
      expect(getNextLevel2QuestionKey(fixture)).toBeNull();
      expect(fixture.create_preparation.derived.direction.length).toBeGreaterThan(10);
    }
  });

  it("keeps secondary hypotheses fail-open when birth context is missing", async () => {
    const hypotheses = await buildLevel2SecondaryHypotheses({});
    expect(hypotheses.numerology.status).toBe("unavailable");
    expect(hypotheses.humanDesign.status).toBe("unavailable");
  });

  it("reads canonical persisted evidence without destructive re-normalization", () => {
    for (const key of Object.keys(baseAnswers) as Array<keyof MiraLevel2Answers>) {
      const persisted = JSON.parse(JSON.stringify(baseAnswers[key])) as Record<string, unknown>;
      expect(readStoredLevel2Answer(key, persisted)).toEqual(baseAnswers[key]);
    }
  });

  it("keeps repeated explicit visual evidence authoritative over a contradictory birth hypothesis", () => {
    const synthesis = synthesizeMiraLevel2Preparation({
      answers: baseAnswers,
      level1Result,
      secondaryHypotheses: {
        numerology: {
          status: "available",
          confidence: "low",
          contextSummary: "Possible pull toward bright, expansive maximalism (X).",
          lens: "Explore maximal visual abundance.",
          source: "dakidarts",
        },
        humanDesign: { status: "unavailable", confidence: "low", note: "Not connected.", source: "none" },
      },
    });

    expect(synthesis.createPreparation.direction).toBe("Editorial intimacy with disciplined contrast.");
    expect(synthesis.visualDecisionRules).toContain("Preserve: Tactile tailoring with restrained contrast");
    expect(synthesis.secondaryHypotheses.numerology.contextSummary).toContain("maximalism");
  });
});
