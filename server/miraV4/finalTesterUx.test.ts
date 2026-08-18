import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJourneyStepIndex, writeJourneyStep } from "../../client/src/lib/miraJourneyStepHistory";
import { buildLevel1FixtureAnswers, readStoredLevel1Answer } from "./level1";

const discover = readFileSync(new URL("../../client/src/pages/MiraLevel1Journey.tsx", import.meta.url), "utf8");
const deeper = readFileSync(new URL("../../client/src/pages/MiraLevel2Journey.tsx", import.meta.url), "utf8");
const create = readFileSync(new URL("../../client/src/pages/MiraLevel2Create.tsx", import.meta.url), "utf8");

describe("final tester UX regressions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps customer journey copy free of assumed gender", () => {
    const customerCopy = [discover, deeper, create].join("\n");
    expect(customerCopy).not.toMatch(/\b(?:she|her|hers|he|him|his)\b/i);
    expect(discover).toContain("They understand what I need.");
    expect(discover).toContain("I want to work with them.");
  });

  it("neutralizes legacy stored audience labels without changing stable evidence IDs", () => {
    const stored = buildLevel1FixtureAnswers("calm_minimal").desired_audience_response;
    const read = readStoredLevel1Answer("desired_audience_response", stored as unknown as Record<string, unknown>);
    expect(read.rawSelections).toEqual(["I could trust them with this.", "They understand what I need."]);
    expect(read.derived.desired_audience_response).toEqual(["i_could_trust_her", "understands_my_need"]);
  });

  it("writes and restores quiz steps through browser history URLs", () => {
    let current = new URL("https://mira.test/mira-1/journey/41");
    const stack: URL[] = [new URL(current)];
    let pointer = 0;
    vi.stubGlobal("window", {
      get location() { return current; },
      history: {
        state: {},
        pushState: (_state: unknown, _title: string, url: URL) => { current = new URL(url); stack.splice(++pointer); stack.push(new URL(current)); },
        replaceState: (_state: unknown, _title: string, url: URL) => { current = new URL(url); stack[pointer] = new URL(current); },
      },
    });
    const order = ["q1", "q2", "q3", "q4"];
    writeJourneyStep("question", "q2");
    writeJourneyStep("question", "q3");
    writeJourneyStep("question", "q4");
    current = stack[--pointer]!;
    expect(readJourneyStepIndex("question", order)).toBe(2);
    current = stack[--pointer]!;
    expect(readJourneyStepIndex("question", order)).toBe(1);
    current = stack[++pointer]!;
    expect(readJourneyStepIndex("question", order)).toBe(2);
  });

  it("uses the clarified optional inspiration copy without changing signals", () => {
    expect(deeper).toContain("What do you like about this image?");
    expect(deeper).toContain("Add an inspiration image and choose what catches your eye.");
    expect(deeper).toContain("Inspiration is optional.");
    for (const signal of ["the light", "the colour", "the composition", "the environment", "the movement", "the styling", "the texture / finish", "Something else"]) {
      expect(deeper).toContain(signal);
    }
  });
});
