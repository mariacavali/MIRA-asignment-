import {
  type ShootMemoryPatch,
  MIRA_SHOOT_MEMORY_SCHEMA_VERSION,
  shootMemoryPatchSchema,
  shootMemorySchema,
  type ShootMemory,
} from "../../shared/miraCore";

type MemorySection = "identity" | "brand" | "expression" | "visualWorld" | "shootContext";

export function emptyShootMemory(): ShootMemory {
  return {
    schemaVersion: MIRA_SHOOT_MEMORY_SCHEMA_VERSION,
    identity: {},
    brand: {},
    expression: {},
    visualWorld: {},
    shootContext: {},
    openQuestions: [],
    completeness: {
      identity: "missing",
      brand: "missing",
      expression: "missing",
      visualWorld: "missing",
      shootContext: "missing",
    },
  };
}

function sectionCompleteness(section: Record<string, unknown>, enoughAt: number) {
  const populated = Object.keys(section).length;
  if (populated === 0) return "missing" as const;
  return populated >= enoughAt ? "enough" as const : "partial" as const;
}

export function deriveShootMemoryCompleteness(memory: ShootMemory): ShootMemory["completeness"] {
  return {
    identity: sectionCompleteness(memory.identity, 2),
    brand: sectionCompleteness(memory.brand, 3),
    expression: sectionCompleteness(memory.expression, 2),
    visualWorld: sectionCompleteness(memory.visualWorld, 4),
    shootContext: sectionCompleteness(memory.shootContext, 3),
  };
}

export function applyShootMemoryPatch(current: ShootMemory, input: ShootMemoryPatch): ShootMemory {
  const memory = structuredClone(shootMemorySchema.parse(current));
  const patch = shootMemoryPatchSchema.parse(input);

  for (const change of patch.changes) {
    const [section, field] = change.path.split(".") as [MemorySection, string];
    const target = memory[section] as Record<string, unknown>;
    if (change.operation === "set") {
      const existing = target[field] as { kind?: string } | undefined;
      if (existing?.kind === "explicit" && change.value.kind === "interpreted") continue;
      target[field] = change.value;
    }
    else delete target[field];
  }

  if (patch.openQuestions) memory.openQuestions = Array.from(new Set(patch.openQuestions));
  memory.completeness = deriveShootMemoryCompleteness(memory);
  return shootMemorySchema.parse(memory);
}

export function hasEnoughForCreativeSynthesis(memory: ShootMemory) {
  const completeness = deriveShootMemoryCompleteness(shootMemorySchema.parse(memory));
  return completeness.brand === "enough"
    && completeness.visualWorld === "enough"
    && completeness.shootContext !== "missing";
}

const DISCOVERY_SIGNALS = [
  ["identity.profession", "identity.role", "identity.business", "identity.relevantContext"],
  ["brand.offer", "brand.businessGoals", "brand.intendedUses"],
  ["brand.audience"],
  ["brand.desiredPerception", "expression.desiredFeeling", "expression.wantsToBeSeenAs"],
  ["identity.values", "identity.personality", "identity.recurringThemes"],
  ["visualWorld.colours", "visualWorld.light", "visualWorld.materials", "visualWorld.environments", "visualWorld.movement", "visualWorld.composition", "visualWorld.styling", "visualWorld.references"],
  ["visualWorld.avoid", "visualWorld.dislikes", "expression.discomforts", "expression.performativeSignals"],
  ["shootContext.location", "shootContext.constraints", "shootContext.channels", "shootContext.deliverables"],
] as const;

function memoryValueAt(memory: ShootMemory, path: string) {
  const [section, field] = path.split(".");
  return (memory as any)[section]?.[field] as { kind: "explicit" | "interpreted"; clientConfirmed: boolean } | undefined;
}

export function evaluateDiscoveryGate(memoryInput: ShootMemory) {
  const memory = shootMemorySchema.parse(memoryInput);
  const covered = DISCOVERY_SIGNALS.filter(paths => paths.some(path => memoryValueAt(memory, path))).length;
  const explicitOrConfirmed = DISCOVERY_SIGNALS.filter(paths => paths.some(path => { const value = memoryValueAt(memory, path); return value?.kind === "explicit" || value?.clientConfirmed; })).length;
  const ready = covered === DISCOVERY_SIGNALS.length
    && explicitOrConfirmed >= 6
    && memory.openQuestions.length === 0;
  return { ready, covered, required: DISCOVERY_SIGNALS.length, explicitOrConfirmed, unresolvedQuestions: memory.openQuestions.length };
}

const TEXT_TEST_MEMORY_PATHS = [
  "identity.relevantContext",
  "brand.audience",
  "expression.desiredFeeling",
  "visualWorld.references",
  "visualWorld.avoid",
  "shootContext.constraints",
] as const;

export function memoryPatchForTextTestAnswer(params: {
  answerIndex: number;
  answer: string;
  sourceEventId: string;
  recordedAt?: Date;
}): ShootMemoryPatch {
  const path = TEXT_TEST_MEMORY_PATHS[params.answerIndex];
  if (!path) throw new Error("Text-test answer index is outside the memory contract");
  return shootMemoryPatchSchema.parse({
    changes: [{
      operation: "set",
      path,
      value: {
        kind: "explicit",
        value: params.answer,
        confidence: "high",
        sourceEventIds: [params.sourceEventId],
        clientConfirmed: true,
        updatedAt: (params.recordedAt ?? new Date()).toISOString(),
      },
    }],
  });
}
