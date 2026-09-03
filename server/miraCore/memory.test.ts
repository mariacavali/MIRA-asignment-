import { describe, expect, it } from "vitest";
import { applyShootMemoryPatch, emptyShootMemory, evaluateDiscoveryGate, hasEnoughForCreativeSynthesis, memoryPatchForTextTestAnswer } from "./memory";

const eventId = "11111111-1111-4111-8111-111111111111";
const explicit = (value: string | string[]) => ({
  value,
  kind: "explicit" as const,
  confidence: "high" as const,
  sourceEventIds: [eventId],
  clientConfirmed: true,
  updatedAt: "2026-09-01T10:00:00.000Z",
});

describe("MIRA shoot memory", () => {
  it("starts empty and validates", () => {
    expect(emptyShootMemory().schemaVersion).toBe("1.0");
    expect(emptyShootMemory().completeness.visualWorld).toBe("missing");
  });

  it("updates a value instead of preserving contradictory old truth", () => {
    const first = applyShootMemoryPatch(emptyShootMemory(), {
      changes: [{ operation: "set", path: "visualWorld.colours", value: explicit(["warm ivory"]) }],
    });
    const updated = applyShootMemoryPatch(first, {
      changes: [{ operation: "set", path: "visualWorld.colours", value: explicit(["deep red", "charcoal"]) }],
    });
    expect(updated.visualWorld.colours?.value).toEqual(["deep red", "charcoal"]);
  });

  it("can unset an unsupported interpretation", () => {
    const current = applyShootMemoryPatch(emptyShootMemory(), {
      changes: [{ operation: "set", path: "expression.tensions", value: { ...explicit(["visibility"]), kind: "interpreted", confidence: "low", clientConfirmed: false } }],
    });
    const updated = applyShootMemoryPatch(current, {
      changes: [{ operation: "unset", path: "expression.tensions", reason: "Client explicitly rejected this interpretation" }],
    });
    expect(updated.expression.tensions).toBeUndefined();
  });

  it("does not allow an interpretation to overwrite a direct client answer", () => {
    const direct = applyShootMemoryPatch(emptyShootMemory(), { changes: [{ operation: "set", path: "brand.desiredPerception", value: explicit("quietly confident") }] });
    const interpreted = applyShootMemoryPatch(direct, { changes: [{ operation: "set", path: "brand.desiredPerception", value: { ...explicit("bold and loud"), kind: "interpreted", confidence: "low", clientConfirmed: false } }] });
    expect(interpreted.brand.desiredPerception?.value).toBe("quietly confident");
  });

  it("blocks creative discovery when minimum information is incomplete", () => {
    const sparse = applyShootMemoryPatch(emptyShootMemory(), { changes: [{ operation: "set", path: "brand.audience", value: explicit("creative founders") }] });
    expect(evaluateDiscoveryGate(sparse)).toMatchObject({ ready: false, required: 8 });
  });

  it("never counts the scheduling confirm/request-change field toward Discovery coverage", () => {
    const withScheduleOnly = applyShootMemoryPatch(emptyShootMemory(), {
      changes: [{ operation: "set", path: "shootContext.scheduleConfirmation", value: explicit(["confirmed"]) }],
    });
    // Deliberately identical to the sparse case above except for the added
    // scheduling field - the gate result must not change.
    expect(evaluateDiscoveryGate(withScheduleOnly)).toMatchObject({ ready: false, covered: 0, required: 8 });
  });

  it("requires brand, visual, and shoot context before creative synthesis", () => {
    const ready = applyShootMemoryPatch(emptyShootMemory(), {
      changes: [
        { operation: "set", path: "brand.audience", value: explicit(["creative founders"]) },
        { operation: "set", path: "brand.offer", value: explicit("brand strategy") },
        { operation: "set", path: "brand.intendedUses", value: explicit(["website"]) },
        { operation: "set", path: "visualWorld.colours", value: explicit(["charcoal"]) },
        { operation: "set", path: "visualWorld.light", value: explicit(["soft directional light"]) },
        { operation: "set", path: "visualWorld.environments", value: explicit(["modern architecture"]) },
        { operation: "set", path: "visualWorld.composition", value: explicit(["negative space"]) },
        { operation: "set", path: "shootContext.location", value: explicit("client studio") },
      ],
    });
    expect(hasEnoughForCreativeSynthesis(ready)).toBe(true);
  });

  it("rejects unknown permanent-memory paths", () => {
    expect(() => applyShootMemoryPatch(emptyShootMemory(), {
      changes: [{ operation: "set", path: "casualConversation.favoriteSnack" as never, value: explicit("cake") }],
    })).toThrow();
  });

  it("maps a text-test answer to evidence-linked permanent memory", () => {
    const patch = memoryPatchForTextTestAnswer({
      answerIndex: 1,
      answer: "Independent founders using the images on their websites.",
      sourceEventId: "550e8400-e29b-41d4-a716-446655440000",
      recordedAt: new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(patch.changes[0]).toMatchObject({
      operation: "set",
      path: "brand.audience",
      value: {
        kind: "explicit",
        confidence: "high",
        clientConfirmed: true,
        sourceEventIds: ["550e8400-e29b-41d4-a716-446655440000"],
      },
    });
  });

  it("rejects a text-test answer outside the six-question contract", () => {
    expect(() => memoryPatchForTextTestAnswer({
      answerIndex: 6,
      answer: "Extra answer",
      sourceEventId: "550e8400-e29b-41d4-a716-446655440000",
    })).toThrow("outside the memory contract");
  });
});
