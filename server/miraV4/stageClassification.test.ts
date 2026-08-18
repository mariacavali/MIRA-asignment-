import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLevel1FixtureAnswers,
  getNextLevel1QuestionKey,
  synthesizeMiraLevel1Result,
} from "./level1";
import { buildLevel2FixtureAnswers, synthesizeMiraLevel2Preparation } from "./level2";
import { compileLevel2CreateDirection } from "./level2Create";

const discover = readFileSync(new URL("../../client/src/pages/MiraLevel1Journey.tsx", import.meta.url), "utf8");
const create = readFileSync(new URL("../../client/src/pages/MiraLevel2Create.tsx", import.meta.url), "utf8");

describe("MIRA stage classification", () => {
  it("classifies protected contrast and anti-signals as DISCOVER, never CREATE", () => {
    const protectedBlock = discover.match(/protected_tension:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? "";
    const antiSignalsBlock = discover.match(/anti_signals:\s*\{[\s\S]*?\n\s*\},/)?.[0] ?? "";

    expect(protectedBlock).toContain('stage: "DISCOVER"');
    expect(antiSignalsBlock).toContain('stage: "DISCOVER"');
    expect(protectedBlock).not.toContain('stage: "CREATE"');
    expect(antiSignalsBlock).not.toContain('stage: "CREATE"');
    expect(discover).toContain('<SegmentHeader stage="DISCOVER" />');
  });

  it("preserves the existing keys, completion order and Creative DNA inputs", () => {
    const answers = buildLevel1FixtureAnswers("playful_colourful");
    expect(getNextLevel1QuestionKey(answers)).toBeNull();
    expect(answers.protected_tension.derived.protected_tension).toBe("playful_powerful");
    expect(answers.anti_signals.derived.anti_signals).toEqual(["safe_expected", "overly_serious"]);

    const result = synthesizeMiraLevel1Result(answers);
    expect(result.contrastToKeep).toContain("playful and powerful");
    expect(result.notThis).toEqual(["safe and expected", "overly serious"]);
  });

  it("leaves DEEPER synthesis and CREATE production handoff intact", () => {
    const discoverResult = synthesizeMiraLevel1Result(buildLevel1FixtureAnswers("playful_colourful"));
    const synthesis = synthesizeMiraLevel2Preparation({
      level1Result: discoverResult,
      answers: buildLevel2FixtureAnswers("editorial_founder"),
      secondaryHypotheses: {
        numerology: { status: "unavailable", confidence: "low", contextSummary: "Unavailable", lens: "None", source: "none" },
        humanDesign: { status: "unavailable", confidence: "low", note: "Unavailable", source: "none" },
      },
    });
    const experience = compileLevel2CreateDirection(synthesis);

    expect(experience.frames).toHaveLength(5);
    expect(experience.frames.every(frame => frame.prompt.includes(experience.creativeDirection))).toBe(true);
    expect(create).not.toContain("Which contrast should MIRA protect?");
    expect(create).not.toContain("The fastest way to get your brand wrong?");
  });
});
