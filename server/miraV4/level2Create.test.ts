import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLevel2FixtureAnswers, synthesizeMiraLevel2Preparation } from "./level2";
import { normalizeLevel2Answer } from "./level2";
import { compileLevel2CreateDirection } from "./level2Create";
import { MIRA_KNOWLEDGE_OBJECTS, retrieveMiraKnowledge } from "./knowledgeRag";
import { MIRA_LEVEL2_VISUAL_PAIRS } from "../../shared/miraLevel2VisualPairs";

const secondaryUnavailable = {
  numerology: { status: "unavailable" as const, confidence: "low" as const, contextSummary: "Unavailable", lens: "None", source: "none" as const },
  humanDesign: { status: "unavailable" as const, confidence: "low" as const, note: "Unavailable", source: "none" as const },
};

describe("MIRA Level 2 CREATE MVP", () => {
  it("turns opposite six-pair visual evidence into materially different campaign specifications and prompts", () => {
    const makeAnswers = (choices: Record<string, string>) => {
      const answers = buildLevel2FixtureAnswers("editorial_founder");
      answers.core_tension_probe = {
        rawText: "Create an editorial founder shoot that communicates human authority.",
        shootContext: { shootPurpose: "founder website campaign", objective: ["communicate human authority"], usageChannels: ["website"], practicalConstraints: [] },
        derived: { anchorLine: "Create an editorial founder shoot that communicates human authority.", confidence: "clear" },
      };
      answers.create_preparation = {
        rawDirection: "A coherent editorial founder campaign.", rawGuardrails: ["No generic corporate imagery"], rawExperiments: [],
        derived: { direction: "A coherent editorial founder campaign.", guardrails: ["No generic corporate imagery"], experiments: [] },
      };
      answers.ab_visual_calibration = normalizeLevel2Answer("ab_visual_calibration", {
        pairs: MIRA_LEVEL2_VISUAL_PAIRS.map(pair => ({
          ...pair,
          optionA: pair.valueA,
          optionB: pair.valueB,
          shownOrder: ["A", "B"],
          chosen: pair.valueA === choices[pair.primaryDimension] ? "A" : "B",
          rationale: `Explicit ${choices[pair.primaryDimension]} preference for this shoot.`,
          reasonTags: [pair.primaryDimension === "proximity" ? "intimacy" : pair.primaryDimension],
          confidence: 5,
        })),
      });
      return answers;
    };
    const campaignFor = (choices: Record<string, string>) => {
      const synthesis = synthesizeMiraLevel2Preparation({ answers: makeAnswers(choices), level1Result: null, secondaryHypotheses: secondaryUnavailable, retrievedKnowledge: [] });
      return { synthesis, create: compileLevel2CreateDirection(synthesis) };
    };
    const testA = campaignFor({ proximity: "intimate", light: "soft", environment: "organic", movement: "dynamic", density: "layered", finish: "raw" });
    const testB = campaignFor({ proximity: "environmental", light: "graphic", environment: "architectural", movement: "still", density: "minimal", finish: "polished" });

    expect(testA.synthesis.canonicalEvidence.filter(item => item.sourceType === "visual_ab")).toHaveLength(6);
    expect(testB.synthesis.canonicalEvidence.filter(item => item.sourceType === "visual_ab")).toHaveLength(6);
    expect(testA.create.sourceFingerprint).not.toBe(testB.create.sourceFingerprint);
    expect(testA.create.campaignLanguage).toMatchObject({
      light: expect.stringContaining("broad window light"), location: expect.stringContaining("lived-in plaster interior"),
      movement: expect.stringContaining("continuous action"), composition: expect.stringContaining("active foreground"),
      materials: expect.stringContaining("visible grain"), atmosphere: expect.stringContaining("kinetic energy"),
    });
    expect(testB.create.campaignLanguage).toMatchObject({
      light: expect.stringContaining("hard directional source"), location: expect.stringContaining("quiet modernist interior"),
      movement: expect.stringContaining("composed stillness"), composition: expect.stringContaining("generous negative space"),
      materials: expect.stringContaining("polished photographic finish"), atmosphere: expect.stringContaining("quietly tense"),
    });
    expect(testA.create.frames.map(frame => frame.title)).not.toEqual(testB.create.frames.map(frame => frame.title));
    expect(testA.create.frames[2]?.prompt).toContain("walking, turning, reaching");
    expect(testB.create.frames[2]?.prompt).toContain("locked or highly controlled camera");
    expect(testA.create.frames.every(frame => frame.prompt.includes("MARIA VISUAL-DIRECTION BIAS"))).toBe(true);
    expect(testB.create.frames.every(frame => frame.prompt.includes("MARIA VISUAL-DIRECTION BIAS"))).toBe(true);
    expect(testA.create.evidenceUsed).toEqual(expect.arrayContaining(["movement: dynamic", "finish: raw"]));
    expect(testB.create.evidenceUsed).toEqual(expect.arrayContaining(["movement: still", "finish: polished"]));
  });

  it("compiles one coherent five-frame campaign directly from the canonical Level 2 handoff", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    answers.reference_interpretation.derived.rejectedSignals = ["glossy corporate polish"];
    const synthesis = synthesizeMiraLevel2Preparation({
      answers,
      level1Result: null,
      secondaryHypotheses: secondaryUnavailable,
      retrievedKnowledge: retrieveMiraKnowledge({
        query: "energetic loud colour campaign",
        objects: MIRA_KNOWLEDGE_OBJECTS,
        topK: 3,
      }),
    });

    const create = compileLevel2CreateDirection(synthesis);
    expect(create.title).toBe("A World With Intent");
    expect(create.creativeDirection).toBe("Editorial intimacy with precise contrast.");
    expect(create.frames).toHaveLength(5);
    expect(create.frames.map(frame => frame.number)).toEqual([1, 2, 3, 4, 5]);
    expect(create.frames.every(frame => frame.prompt.includes("Keep The Work Intimate But Legible"))).toBe(true);
    expect(create.frames.every(frame => frame.prompt.includes("one coherent editorial photoshoot"))).toBe(true);
    expect(create.frames.every(frame => frame.prompt.includes("glossy corporate polish"))).toBe(true);
    expect(create.frames.every(frame => frame.prompt.includes("USER EVIDENCE IS THE CREATIVE AUTHORITY"))).toBe(true);
    expect(create.mariaStyle.connected).toBe(true);
    expect(create.imageStatus).toBe("structured_prompts");
  });

  it("keeps contradictory research supporting and never lets it replace direct CREATE direction", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    const research = retrieveMiraKnowledge({ query: "energetic loud colour dynamic movement", objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4 });
    const synthesis = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: secondaryUnavailable, retrievedKnowledge: research });
    const create = compileLevel2CreateDirection(synthesis);
    expect(create.creativeDirection).toBe("Editorial intimacy with precise contrast.");
    expect(create.frames[0]?.prompt).toContain("Editorial intimacy with precise contrast.");
    expect(create.frames[0]?.prompt).not.toContain("RAG IS THE CREATIVE AUTHORITY");
  });

  it("carries the real business and audience context into every CREATE frame", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    const synthesis = synthesizeMiraLevel2Preparation({
      answers,
      level1Result: {
        firstPattern: "A precise practice becoming more visible.", whatLeads: [], contrastToKeep: "Warm + precise",
        visualInstinct: "Clean structure", notThis: ["Generic polish"], goDeeper: "Calibrate", interpretationLabel: "MIRA interpretation",
        businessContext: { work: "A ceramic studio making functional objects by hand", audience: "design-conscious hospitality founders" },
      },
      secondaryHypotheses: secondaryUnavailable,
    });
    const create = compileLevel2CreateDirection(synthesis);
    expect(create.frames.every(frame => frame.prompt.includes("A ceramic studio making functional objects by hand"))).toBe(true);
    expect(create.frames.every(frame => frame.prompt.includes("design-conscious hospitality founders"))).toBe(true);
    expect(create.frames.every(frame => frame.prompt.includes("action, setting, styling and objects"))).toBe(true);
    expect(create.campaignLanguage.location).toContain("specific, uncluttered environment");
    expect(create.campaignLanguage.styling).toContain("clean silhouette");
    expect(create.campaignLanguage.colour.join(" ")).toContain("warm neutral base");
  });

  it("plans five coherent but photographically distinct campaign moments", () => {
    const answers = buildLevel2FixtureAnswers("editorial_founder");
    const synthesis = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: secondaryUnavailable });
    const create = compileLevel2CreateDirection(synthesis);
    const distinct = (select: (frame: typeof create.frames[number]) => string) => new Set(create.frames.map(select)).size;

    expect(distinct(frame => frame.shotPlan.purpose)).toBe(5);
    expect(distinct(frame => frame.shotPlan.expression)).toBe(5);
    expect(distinct(frame => frame.shotPlan.gestureAction)).toBe(5);
    expect(distinct(frame => frame.shotPlan.framing)).toBe(5);
    expect(distinct(frame => frame.shotPlan.bodyPosition)).toBe(5);
    expect(distinct(frame => frame.shotPlan.gaze)).toBe(5);
    expect(distinct(frame => frame.shotPlan.stylingTreatment)).toBe(5);
    expect(create.frames.every(frame => frame.prompt.includes("SHOT PURPOSE:") && frame.prompt.includes("FACIAL EXPRESSION:") && frame.prompt.includes("FRAME STYLING TREATMENT:"))).toBe(true);
    expect(create.continuityRules.join(" ")).toContain("recognizable subject");
    expect(create.continuityRules.join(" ")).toContain("cannot repeat the same pose");
  });

  it("carries inspiration interpretation plus business, audience and shoot purpose into every final frame prompt", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    answers.core_tension_probe = normalizeLevel2Answer("core_tension_probe", {
      anchorLine: "Keep the craft human and precise.",
      shootContext: { shootPurpose: "hospitality founder website campaign", objective: ["build trust"], usageChannels: ["website"], practicalConstraints: [] },
    });
    answers.reference_interpretation = normalizeLevel2Answer("reference_interpretation", { references: [{
      referenceId: "customer-image-1", observedSignal: "the light, the texture / finish", supportsDirection: true, confidence: 5,
    }] });
    const synthesis = synthesizeMiraLevel2Preparation({
      answers,
      level1Result: {
        firstPattern: "Visible craft", whatLeads: [], contrastToKeep: "Warm + precise", visualInstinct: "Tactile precision", notThis: [], goDeeper: "Continue", interpretationLabel: "MIRA interpretation",
        businessContext: { work: "A ceramic studio making functional objects by hand", audience: "design-conscious hospitality founders" },
      },
      secondaryHypotheses: secondaryUnavailable,
    });
    const create = compileLevel2CreateDirection(synthesis);
    for (const frame of create.frames) {
      expect(frame.prompt).toContain("the light, the texture / finish");
      expect(frame.prompt).toContain("A ceramic studio making functional objects by hand");
      expect(frame.prompt).toContain("design-conscious hospitality founders");
      expect(frame.prompt).toContain(synthesis.createHandoff.shootContext!.shootPurpose);
    }
  });

  it("carries an optional personal identity reference through synthesis without turning it into creative evidence", () => {
    const synthesis = synthesizeMiraLevel2Preparation({
      answers: buildLevel2FixtureAnswers("editorial_founder"),
      level1Result: null,
      secondaryHypotheses: secondaryUnavailable,
      personalReferenceImage: { id: "personal-photo-1" },
    });
    const create = compileLevel2CreateDirection(synthesis);
    expect(synthesis.createHandoff.personalReference).toEqual({
      provided: true,
      imageId: "personal-photo-1",
      purpose: "subject_identity_reference",
    });
    expect(create.personalReference).toEqual(synthesis.createHandoff.personalReference);
    expect(create.frames.every(frame => frame.prompt.includes("use the separately supplied personal photo only to ground visible subject identity"))).toBe(true);
    expect(synthesis.canonicalEvidence.some(item => item.sourceId === "personal-photo-1")).toBe(false);
  });

  it("synthesizes the shoot title from the evidence theme instead of copying the confirmed direction", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    const synthesis = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: secondaryUnavailable });
    const create = compileLevel2CreateDirection(synthesis);
    expect(create.title).not.toBe("Editorial Intimacy With Precise");
    expect(create.title.toLowerCase()).not.toContain(synthesis.createPreparation.direction.toLowerCase().split(" ").slice(0, 4).join(" "));
  });

  it("wires DEEPER completion into the new dark editorial CREATE route", () => {
    const app = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
    const deeper = readFileSync(new URL("../../client/src/pages/MiraLevel2Journey.tsx", import.meta.url), "utf8");
    const create = readFileSync(new URL("../../client/src/pages/MiraLevel2Create.tsx", import.meta.url), "utf8");
    expect(app).toContain('/mira-1/journey/:journeyId/create');
    expect(deeper).toContain('/mira-1/journey/${journeyId}/create');
    expect(create).toContain("Mira123Shell");
    expect(create).toContain("Five-frame campaign story");
  });
});
