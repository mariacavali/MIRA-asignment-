import { describe, expect, it } from "vitest";
import { deterministicShownOrder, MIRA_LEVEL2_VISUAL_PAIRS, visualPairSchema } from "../../shared/miraLevel2VisualPairs";
import { MIRA_KNOWLEDGE_OBJECTS, indexApprovedKnowledge, knowledgeObjectSchema, retrieveMiraKnowledge } from "./knowledgeRag";
import { buildLevel2FixtureAnswers, normalizeLevel2Answer, readStoredLevel2Answer, synthesizeMiraLevel2Preparation } from "./level2";

const unavailableSecondary = {
  numerology: { status: "unavailable" as const, confidence: "low" as const, contextSummary: "Unavailable", lens: "None", source: "none" as const },
  humanDesign: { status: "unavailable" as const, confidence: "low" as const, note: "Unavailable", source: "none" as const },
};

describe("Mira Level 2 visual evidence and RAG integration", () => {
  it("validates exactly six versioned local visual pairs with rights metadata", () => {
    expect(MIRA_LEVEL2_VISUAL_PAIRS).toHaveLength(6);
    MIRA_LEVEL2_VISUAL_PAIRS.forEach(pair => {
      expect(visualPairSchema.safeParse(pair).success).toBe(true);
      expect(pair.rightsStatus).toBe("mira_owned_generated");
      expect(pair.assetAPath).toMatch(/^\/mira\/level2\/visual-pairs\/v1\//);
    });
  });

  it("persists shoot context and visual choices with pair/version/shown-order metadata", () => {
    const core = normalizeLevel2Answer("core_tension_probe", {
      anchorLine: "Keep authority human and visually specific.",
      shootContext: { shootPurpose: "website", objective: ["build trust"], usageChannels: ["website", "LinkedIn"], practicalConstraints: ["indoor"] },
    });
    const pair = MIRA_LEVEL2_VISUAL_PAIRS[0]!;
    const visual = normalizeLevel2Answer("ab_visual_calibration", { pairs: [{
      ...pair, optionA: pair.valueA, optionB: pair.valueB, chosen: "A", shownOrder: deterministicShownOrder(41, pair.pairId),
      rationale: "intimacy", reasonTags: ["intimacy"], confidence: 3,
    }] });
    expect(readStoredLevel2Answer("core_tension_probe", JSON.parse(JSON.stringify(core)) as never)).toEqual(core);
    expect(readStoredLevel2Answer("ab_visual_calibration", JSON.parse(JSON.stringify(visual)) as never)).toEqual(visual);
    expect(visual.rawPairs[0]).toMatchObject({ pairVersion: "mira_visual_pairs_v1", primaryDimension: "proximity", assetVersion: "1.0.0" });
  });

  it("does not force visual rules from both, neither, or not-sure", () => {
    for (const chosen of ["both", "neither", "not_sure"] as const) {
      const pair = MIRA_LEVEL2_VISUAL_PAIRS[0]!;
      const normalized = normalizeLevel2Answer("ab_visual_calibration", { pairs: [{ ...pair, optionA: pair.valueA, optionB: pair.valueB, chosen, rationale: "", confidence: 1 }] });
      expect(normalized.rawPairs[0]?.selectedValue).toBeNull();
    }
  });

  it("raises confidence only after compatible repeated reason evidence", () => {
    const answers = buildLevel2FixtureAnswers("editorial_founder");
    answers.ab_visual_calibration = normalizeLevel2Answer("ab_visual_calibration", { pairs: MIRA_LEVEL2_VISUAL_PAIRS.slice(0, 3).map(pair => ({
      ...pair, optionA: pair.valueA, optionB: pair.valueB, chosen: "A", reasonTags: ["simplicity"], rationale: "simplicity", confidence: 3,
    })) });
    const synthesis = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: unavailableSecondary });
    expect(synthesis.createHandoff.visualEvidence.repeatedPatterns).toContain("simplicity");
    expect(synthesis.createHandoff.visualEvidence.preferredDimensions.every(item => item.confidence > 0.55)).toBe(true);
  });

  it("indexes only reviewed approved valid Knowledge Objects and retrieves relevant bounded results", () => {
    expect(MIRA_KNOWLEDGE_OBJECTS).toHaveLength(50);
    expect(MIRA_KNOWLEDGE_OBJECTS.every(item => knowledgeObjectSchema.safeParse(item).success)).toBe(true);
    const draft = { ...MIRA_KNOWLEDGE_OBJECTS[0]!, id: "draft", status: "draft" };
    const malformed = { id: "malformed" };
    expect(indexApprovedKnowledge([...MIRA_KNOWLEDGE_OBJECTS, draft, malformed])).toHaveLength(50);
    const results = retrieveMiraKnowledge({ query: "founder wants authority without corporate stiffness", objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4 });
    expect(results.some(item => item.knowledgeObjectId === "mira-ko-v1-005")).toBe(true);
    expect(results[0]?.source.version).toBe("v1");
    expect(results.length).toBeLessThanOrEqual(4);
  });

  it("keeps irrelevant, empty, and contradictory research supporting rather than authoritative", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    const relevant = retrieveMiraKnowledge({ query: "authority intimacy texture trust", objects: MIRA_KNOWLEDGE_OBJECTS });
    const withResearch = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: unavailableSecondary, retrievedKnowledge: relevant });
    const withoutResearch = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: unavailableSecondary, retrievedKnowledge: [] });
    expect(withResearch.createPreparation).toEqual(withoutResearch.createPreparation);
    expect(withResearch.createHandoff.knowledgeContext.provenance[0]).toContain("@v1");
    expect(withResearch.canonicalEvidence.filter(item => item.sourceType === "notion_rag").every(item => !item.userConfirmed && item.directness === "supporting_hypothesis")).toBe(true);
    expect(retrieveMiraKnowledge({ query: "underwater astronomy", objects: MIRA_KNOWLEDGE_OBJECTS })).toEqual([]);
  });

  it("produces one deterministic compatible CREATE handoff", () => {
    const answers = buildLevel2FixtureAnswers("playful_operator");
    const params = { answers, level1Result: null, secondaryHypotheses: unavailableSecondary, retrievedKnowledge: MIRA_KNOWLEDGE_OBJECTS.slice(0, 1).map(item => retrieveMiraKnowledge({ query: item.tags.join(" "), objects: [item] })[0]!) };
    expect(synthesizeMiraLevel2Preparation(params).createHandoff).toEqual(synthesizeMiraLevel2Preparation(params).createHandoff);
  });
});
