import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MiraLevel2Answers, MiraLevel2QuestionKey, MiraLevel2Synthesis } from "./level2";
import { LEVEL2_INTERACTION_ORDER, readStoredLevel2Answer } from "./level2";

const persisted = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
  order: [] as string[],
  synthesis: null as unknown,
  fixtureReplaceCount: 0,
}));

const journey = {
  id: 41, userId: 7, birthDate: null, birthTime: null, birthCity: null,
  birthCountry: null, birthTimezone: null,
};

const discoverResult = {
  firstPattern: "A precise point of view is becoming more visible.",
  whatLeads: [],
  contrastToKeep: "You do not need to choose between warm and precise. The work gets stronger when both stay visible.",
  visualInstinct: "clear conviction - Precise + Warm - clean space + texture",
  notThis: ["Generic polish"],
  goDeeper: "Calibrate the visual world.",
  interpretationLabel: "MIRA interpretation" as const,
};

function reloadedLevel2State() {
  const answers: Partial<MiraLevel2Answers> = {};
  for (const key of LEVEL2_INTERACTION_ORDER) {
    const value = persisted.answers.get(key);
    if (value) {
      (answers as Record<string, unknown>)[key] = readStoredLevel2Answer(
        key,
        JSON.parse(JSON.stringify(value)) as Record<string, unknown>,
      );
    }
  }
  return { journey, answers, rawEvidence: {}, synthesis: persisted.synthesis as MiraLevel2Synthesis | null };
}

const dbMocks = vi.hoisted(() => ({
  appendMiraV4Level1Answer: vi.fn(),
  appendMiraV4Level2Answer: vi.fn(async (input: { key: MiraLevel2QuestionKey; value: unknown }) => {
    persisted.answers.set(input.key, JSON.parse(JSON.stringify(input.value)));
    persisted.order.push(input.key);
  }),
  appendMiraV4Level2Inspiration: vi.fn(),
  appendMiraV4Level2PersonalReference: vi.fn(),
  createMiraV4Journey: vi.fn(), createMiraV4Level1Journey: vi.fn(),
  getMiraV4Level1State: vi.fn(async () => ({ journey, answers: {}, rawEvidence: {}, result: discoverResult })),
  getMiraV4Level2State: vi.fn(async () => reloadedLevel2State()),
  getMiraV4VisualSet: vi.fn(async () => undefined),
  getOwnedMiraV4Journey: vi.fn(), listMiraV4Journeys: vi.fn(),
  replaceMiraV4Level2Fixture: vi.fn(async (input: { answers: MiraLevel2Answers; synthesis: MiraLevel2Synthesis }) => {
    persisted.fixtureReplaceCount += 1;
    persisted.answers.clear();
    persisted.order = [];
    for (const key of LEVEL2_INTERACTION_ORDER) {
      persisted.answers.set(key, JSON.parse(JSON.stringify(input.answers[key])));
      persisted.order.push(key);
    }
    persisted.synthesis = JSON.parse(JSON.stringify(input.synthesis));
  }),
  saveMiraV4Level1Result: vi.fn(),
  saveMiraV4Level2Synthesis: vi.fn(async (input: { synthesis: MiraLevel2Synthesis }) => {
    persisted.synthesis = JSON.parse(JSON.stringify(input.synthesis));
  }),
  saveMiraV4CreateVisualState: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import { miraV4Router } from "./router";

function caller() {
  return miraV4Router.createCaller({ user: { id: 7 }, req: {}, res: {} } as never);
}

const inputs = [
  { key: "core_tension_probe", value: { anchorLine: "Protect intimacy while making the point unmistakable." } },
  { key: "ab_visual_calibration", value: { pairs: [{ pairId: "pair_1", optionA: "Restrained contrast", optionB: "Bright maximalism", chosen: "A", rationale: "Restraint preserves precision and trust.", confidence: 5 }] } },
  { key: "reference_interpretation", value: { references: [{ referenceId: "ref_1", observedSignal: "Tactile tailoring with quiet contrast", supportsDirection: true, confidence: 4 }] } },
  { key: "create_preparation", value: { direction: "Editorial intimacy with restrained contrast.", guardrails: ["Avoid maximalism"], experiments: ["Test one shadow-led frame"] } },
] as const;

describe("Mira Level 2 persisted router round trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persisted.answers.clear();
    persisted.order = [];
    persisted.synthesis = null;
    persisted.fixtureReplaceCount = 0;
  });

  it("saves and reloads all five interactions in sequence and synthesizes reloaded evidence", async () => {
    for (const input of inputs) await caller().saveLevel2Answer({ journeyId: 41, ...input } as never);

    expect(persisted.order).toEqual(LEVEL2_INTERACTION_ORDER);
    const state = await caller().getLevel2State({ journeyId: 41 });
    expect(state.discoverResult).toEqual(discoverResult);
    expect(Object.keys(state.answers)).toEqual(LEVEL2_INTERACTION_ORDER);
    expect(state.answers.ab_visual_calibration?.rawPairs[0]).toMatchObject({
      pairId: "pair_1", optionA: "Restrained contrast", optionB: "Bright maximalism", chosen: "A",
      rationale: "Restraint preserves precision and trust.", confidence: 5,
    });
    expect(state.synthesis?.calibrationInsights.join(" ")).toContain("Restraint preserves precision and trust.");
    expect(state.synthesis?.createPreparation.direction).toBe("Editorial intimacy with restrained contrast.");
    const create = await caller().getLevel2CreateDirection({ journeyId: 41 });
    expect(create.frames).toHaveLength(5);
    expect(create.creativeDirection).toBe("Editorial intimacy with restrained contrast.");
    expect(create.avoid).toContain("Avoid maximalism");
    expect(create.frames.every(frame => frame.prompt.includes("Avoid maximalism"))).toBe(true);
  });

  it("accepts an intentionally empty inspiration list", async () => {
    await caller().saveLevel2Answer({ journeyId: 41, ...inputs[0] } as never);
    await caller().saveLevel2Answer({ journeyId: 41, ...inputs[1] } as never);
    await caller().saveLevel2Answer({
      journeyId: 41,
      key: "reference_interpretation",
      value: { references: [] },
    });

    const state = await caller().getLevel2State({ journeyId: 41 });
    expect(state.answers.reference_interpretation).toEqual({
      rawReferences: [],
      derived: { keptSignals: [], rejectedSignals: [] },
    });
  });

  it("replaces fixture evidence atomically when the same fixture is loaded twice", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await caller().loadLevel2Fixture({ journeyId: 41, profile: "editorial_founder" });
      await caller().loadLevel2Fixture({ journeyId: 41, profile: "editorial_founder" });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
    expect(persisted.fixtureReplaceCount).toBe(2);
    expect(persisted.order).toEqual(LEVEL2_INTERACTION_ORDER);
    expect(persisted.answers.size).toBe(5);
  });

  it.each([
    { label: "empty optional refinements", guardrails: [], experiments: [] },
    { label: "one experiment", guardrails: [], experiments: ["one movement-led frame"] },
  ])("completes CREATE handoff with $label", async ({ guardrails, experiments }) => {
    for (const input of inputs.slice(0, 3)) await caller().saveLevel2Answer({ journeyId: 41, ...input } as never);
    const state = await caller().saveLevel2Answer({
      journeyId: 41,
      key: "create_preparation",
      value: { direction: "Editorial intimacy with restrained contrast.", guardrails, experiments },
    });
    expect(state.synthesis?.createPreparation.guardrails).toEqual(guardrails);
    expect(state.synthesis?.createPreparation.experiments).toEqual(experiments);
    const create = await caller().getLevel2CreateDirection({ journeyId: 41 });
    expect(create.frames).toHaveLength(5);
  });
});
