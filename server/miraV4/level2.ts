import { ENV } from "../_core/env";
import {
  createConfiguredBirthDataProvider,
  prepareBirthDataModule,
  type BirthDataInput,
} from "../miraV3/birthData";
import type { MiraLevel1Result } from "./level1";
import { z } from "zod";
import { VISUAL_CHOICES, VISUAL_REASON_TAGS } from "../../shared/miraLevel2VisualPairs";
import type { MiraRetrievedKnowledge } from "./knowledgeRag";

export const LEVEL2_INTERACTION_ORDER = [
  "core_tension_probe",
  "ab_visual_calibration",
  "reference_interpretation",
  "notion_intelligence",
  "create_preparation",
] as const;

export type MiraLevel2QuestionKey = (typeof LEVEL2_INTERACTION_ORDER)[number];

export type MiraLevel2Answers = {
  core_tension_probe: {
    rawText: string;
    shootContext?: {
      shootPurpose: string;
      objective: string[];
      usageChannels: string[];
      practicalConstraints: string[];
    };
    derived: {
      anchorLine: string;
      confidence: "tentative" | "clear";
    };
  };
  ab_visual_calibration: {
    rawPairs: Array<{
      pairId: string;
      optionA: string;
      optionB: string;
      chosen: (typeof VISUAL_CHOICES)[number] | "tie";
      rationale: string;
      confidence: number;
      pairVersion?: string;
      primaryDimension?: string;
      secondaryVariables?: string[];
      assetAId?: string;
      assetBId?: string;
      assetVersion?: string;
      rightsStatus?: string;
      contextTags?: string[];
      shownOrder?: ["A", "B"] | ["B", "A"];
      reasonTags?: string[];
      selectedValue?: string | null;
    }>;
    derived: {
      directionalBias: "A" | "B" | "balanced";
      recurringReason: string;
    };
  };
  reference_interpretation: {
    rawReferences: Array<{
      referenceId: string;
      observedSignal: string;
      supportsDirection: boolean;
      confidence: number;
    }>;
    derived: {
      keptSignals: string[];
      rejectedSignals: string[];
    };
  };
  notion_intelligence: {
    rawManualContext: string | null;
    rawSignals: Array<{
      source: string;
      signal: string;
      confidence: number;
    }>;
    derived: {
      status: "available" | "unavailable";
      failOpenReason: string | null;
    };
  };
  create_preparation: {
    rawDirection: string;
    rawGuardrails: string[];
    rawExperiments: string[];
    derived: {
      direction: string;
      guardrails: string[];
      experiments: string[];
    };
  };
};

export type MiraLevel2SecondaryHypotheses = {
  numerology: {
    status: "available" | "unavailable";
    confidence: "low";
    contextSummary: string;
    lens: string;
    source: "dakidarts" | "none";
  };
  humanDesign: {
    status: "unavailable";
    confidence: "low";
    note: string;
    source: "none";
  };
};

export type MiraLevel2Synthesis = {
  evidenceHierarchy: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  calibrationInsights: string[];
  visualDecisionRules: string[];
  referenceInterpretation: {
    keep: string[];
    avoid: string[];
  };
  notionIntelligence: {
    status: "available" | "unavailable";
    usedSignals: string[];
    failOpenReason: string | null;
  };
  secondaryHypotheses: MiraLevel2SecondaryHypotheses;
  canonicalEvidence: Array<{
    dimension: string;
    value: string;
    sourceType: "user_statement" | "visual_ab" | "reference_annotation" | "notion_rag" | "numerology" | "human_design";
    directness: "direct" | "observed" | "supporting_hypothesis";
    confidence: number;
    context: string;
    sourceId: string;
    sourceVersion: string;
    userConfirmed: boolean;
  }>;
  createHandoff: {
    shootContext: MiraLevel2Answers["core_tension_probe"]["shootContext"] | null;
    brandContext: { level1Pattern: string | null; coreTension: string; work: string | null; audience: string | null };
    visualEvidence: {
      preferredDimensions: Array<{ dimension: string; value: string; confidence: number }>;
      repeatedPatterns: string[];
      rejectedPatterns: string[];
      referenceSignals: string[];
      rationales: string[];
      confidence: "low" | "medium" | "high";
    };
    knowledgeContext: { retrievedKnowledge: MiraRetrievedKnowledge[]; provenance: string[] };
    personalContext: { numerologySignals: string[]; humanDesignSignals: string[] };
    personalReference: {
      provided: boolean;
      imageId: string | null;
      purpose: "subject_identity_reference";
    };
    visualDirection: {
      emotionalRegister: string;
      colourDirection: string;
      lightingDirection: string;
      compositionDirection: string;
      environmentDirection: string;
      movementDirection: string;
      stylingDirection: string;
      intimacyDistance: string;
      textureMaterialDirection: string;
      photographicLanguage: string;
    };
    creativeRules: { mustHave: string[]; avoid: string[]; unresolvedQuestions: string[] };
    createHandoff: {
      strongestEvidence: string[];
      supportingResearch: string[];
      creativeHypotheses: string[];
      confidence: "low" | "medium" | "high";
      rationale: string;
    };
  };
  createPreparation: {
    direction: string;
    guardrails: string[];
    experiments: string[];
  };
  provenanceLabel: "MIRA synthesis with evidence hierarchy";
};

export const LEVEL2_FIXTURE_PROFILES = [
  "editorial_founder",
  "quiet_luxury",
  "playful_operator",
] as const;

export type MiraLevel2FixtureProfile = (typeof LEVEL2_FIXTURE_PROFILES)[number];

const confidenceSchema = z.number().int().min(1).max(5);
const canonicalLevel2AnswerSchemas = {
  core_tension_probe: z.object({
    rawText: z.string(),
    shootContext: z.object({
      shootPurpose: z.string(), objective: z.array(z.string()), usageChannels: z.array(z.string()), practicalConstraints: z.array(z.string()),
    }).optional(),
    derived: z.object({ anchorLine: z.string(), confidence: z.enum(["tentative", "clear"]) }),
  }),
  ab_visual_calibration: z.object({
    rawPairs: z.array(z.object({
      pairId: z.string(), optionA: z.string(), optionB: z.string(), chosen: z.enum([...VISUAL_CHOICES, "tie"]),
      rationale: z.string(), confidence: confidenceSchema,
      pairVersion: z.string().optional(), primaryDimension: z.string().optional(), secondaryVariables: z.array(z.string()).optional(),
      assetAId: z.string().optional(), assetBId: z.string().optional(), assetVersion: z.string().optional(), rightsStatus: z.string().optional(),
      contextTags: z.array(z.string()).optional(), shownOrder: z.union([z.tuple([z.literal("A"), z.literal("B")]), z.tuple([z.literal("B"), z.literal("A")])]).optional(),
      reasonTags: z.array(z.string()).optional(), selectedValue: z.string().nullable().optional(),
    })),
    derived: z.object({ directionalBias: z.enum(["A", "B", "balanced"]), recurringReason: z.string() }),
  }),
  reference_interpretation: z.object({
    rawReferences: z.array(z.object({
      referenceId: z.string(), observedSignal: z.string(), supportsDirection: z.boolean(), confidence: confidenceSchema,
    })),
    derived: z.object({ keptSignals: z.array(z.string()), rejectedSignals: z.array(z.string()) }),
  }),
  notion_intelligence: z.object({
    rawManualContext: z.string().nullable(),
    rawSignals: z.array(z.object({ source: z.string(), signal: z.string(), confidence: confidenceSchema })),
    derived: z.object({ status: z.enum(["available", "unavailable"]), failOpenReason: z.string().nullable() }),
  }),
  create_preparation: z.object({
    rawDirection: z.string(), rawGuardrails: z.array(z.string()), rawExperiments: z.array(z.string()),
    derived: z.object({ direction: z.string(), guardrails: z.array(z.string()), experiments: z.array(z.string()) }),
  }),
} satisfies Record<MiraLevel2QuestionKey, z.ZodType>;

/** Reads the stable canonical format, with a narrow fallback for legacy raw submissions. */
export function readStoredLevel2Answer(
  key: MiraLevel2QuestionKey,
  storedValue: Record<string, unknown>,
): MiraLevel2Answers[MiraLevel2QuestionKey] {
  const canonical = canonicalLevel2AnswerSchemas[key].safeParse(storedValue);
  if (canonical.success) return storedValue as MiraLevel2Answers[MiraLevel2QuestionKey];

  const looksCanonical = "derived" in storedValue
    || Object.keys(storedValue).some(field => field.startsWith("raw"));
  if (looksCanonical) {
    throw new Error(`Invalid canonical Level 2 answer for ${key}`);
  }

  return normalizeLevel2Answer(key, storedValue);
}

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

export function getNextLevel2QuestionKey(answers: Partial<MiraLevel2Answers>) {
  for (const key of LEVEL2_INTERACTION_ORDER) {
    if (!answers[key]) return key;
  }
  return null;
}

export function normalizeLevel2Answer(
  key: MiraLevel2QuestionKey,
  rawValue: Record<string, unknown>,
): MiraLevel2Answers[MiraLevel2QuestionKey] {
  if (key === "core_tension_probe") {
    const anchor = cleanText(rawValue.anchorLine ?? rawValue.text, 260);
    const shoot = rawValue.shootContext && typeof rawValue.shootContext === "object" ? rawValue.shootContext as Record<string, unknown> : {};
    const cleanList = (value: unknown, max: number) => Array.isArray(value) ? value.map(item => cleanText(item, 80)).filter(Boolean).slice(0, max) : [];
    return {
      rawText: anchor,
      shootContext: cleanText(shoot.shootPurpose, 80) ? {
        shootPurpose: cleanText(shoot.shootPurpose, 80),
        objective: cleanList(shoot.objective, 4),
        usageChannels: cleanList(shoot.usageChannels, 6),
        practicalConstraints: cleanList(shoot.practicalConstraints, 6),
      } : undefined,
      derived: {
        anchorLine: anchor,
        confidence: anchor.length >= 30 ? "clear" : "tentative",
      },
    };
  }

  if (key === "ab_visual_calibration") {
    const rawPairs = Array.isArray(rawValue.pairs) ? rawValue.pairs : [];
    const pairs: MiraLevel2Answers["ab_visual_calibration"]["rawPairs"] = rawPairs
      .map((item, index) => {
        const row = (item && typeof item === "object") ? item as Record<string, unknown> : {};
        const chosenRaw = String(row.chosen ?? "not_sure");
        const chosen = ([...VISUAL_CHOICES, "tie"] as string[]).includes(chosenRaw)
          ? chosenRaw as MiraLevel2Answers["ab_visual_calibration"]["rawPairs"][number]["chosen"] : "not_sure";
        const shownOrderRaw = Array.isArray(row.shownOrder) ? row.shownOrder : ["A", "B"];
        const shownOrder: ["A", "B"] | ["B", "A"] = shownOrderRaw[0] === "B" ? ["B", "A"] : ["A", "B"];
        const selectedAssetSide = chosen === "A" ? shownOrder[0] : chosen === "B" ? shownOrder[1] : null;
        return {
          pairId: cleanText(row.pairId, 80) || `pair_${index + 1}`,
          optionA: cleanText(row.optionA, 140),
          optionB: cleanText(row.optionB, 140),
          chosen,
          rationale: cleanText(row.rationale, 240),
          confidence: toConfidence(row.confidence),
          pairVersion: cleanText(row.pairVersion, 80) || undefined,
          primaryDimension: cleanText(row.primaryDimension, 80) || undefined,
          secondaryVariables: Array.isArray(row.secondaryVariables) ? row.secondaryVariables.map(item => cleanText(item, 80)).filter(Boolean) : undefined,
          assetAId: cleanText(row.assetAId, 100) || undefined,
          assetBId: cleanText(row.assetBId, 100) || undefined,
          assetVersion: cleanText(row.assetVersion, 40) || undefined,
          rightsStatus: cleanText(row.rightsStatus, 80) || undefined,
          contextTags: Array.isArray(row.contextTags) ? row.contextTags.map(item => cleanText(item, 80)).filter(Boolean) : undefined,
          shownOrder,
          reasonTags: Array.isArray(row.reasonTags) ? row.reasonTags.map(item => cleanText(item, 40)).filter(item => (VISUAL_REASON_TAGS as readonly string[]).includes(item)) : [],
          selectedValue: selectedAssetSide === "A" ? cleanText(row.optionA, 140) : selectedAssetSide === "B" ? cleanText(row.optionB, 140) : null,
        };
      })
      .filter(pair => pair.optionA && pair.optionB)
      .slice(0, 6);

    const votesA = pairs.filter(pair => pair.chosen === "A").length;
    const votesB = pairs.filter(pair => pair.chosen === "B").length;
    const directionalBias = votesA === votesB ? "balanced" : votesA > votesB ? "A" : "B";
    const recurringReason = pairs
      .map(pair => pair.rationale)
      .find(reason => reason.length > 16) ?? "No strong rationale yet.";

    return {
      rawPairs: pairs,
      derived: {
        directionalBias,
        recurringReason,
      },
    };
  }

  if (key === "reference_interpretation") {
    const rawReferences = Array.isArray(rawValue.references) ? rawValue.references : [];
    const references = rawReferences
      .map((item, index) => {
        const row = (item && typeof item === "object") ? item as Record<string, unknown> : {};
        return {
          referenceId: cleanText(row.referenceId, 80) || `reference_${index + 1}`,
          observedSignal: cleanText(row.observedSignal, 220),
          supportsDirection: Boolean(row.supportsDirection),
          confidence: toConfidence(row.confidence),
        };
      })
      .filter(reference => reference.observedSignal.length > 0)
      .slice(0, 6);

    return {
      rawReferences: references,
      derived: {
        keptSignals: references.filter(item => item.supportsDirection).map(item => item.observedSignal),
        rejectedSignals: references.filter(item => !item.supportsDirection).map(item => item.observedSignal),
      },
    };
  }

  if (key === "notion_intelligence") {
    const rawSignals = Array.isArray(rawValue.signals) ? rawValue.signals : [];
    const normalizedSignals = rawSignals
      .map(item => {
        const row = (item && typeof item === "object") ? item as Record<string, unknown> : {};
        return {
          source: cleanText(row.source, 80),
          signal: cleanText(row.signal, 220),
          confidence: toConfidence(row.confidence),
        };
      })
      .filter(item => item.source && item.signal)
      .slice(0, 10);

    const statusRaw = String(rawValue.status ?? "unavailable");
    const status = statusRaw === "available" ? "available" : "unavailable";
    const failOpenReason = cleanText(rawValue.failOpenReason, 220) || null;

    return {
      rawManualContext: cleanText(rawValue.manualContext, 350) || null,
      rawSignals: normalizedSignals,
      derived: {
        status,
        failOpenReason,
      },
    };
  }

  const direction = cleanText(rawValue.direction, 280);
  const guardrails = Array.isArray(rawValue.guardrails) ? rawValue.guardrails.map(item => cleanText(item, 180)).filter(Boolean).slice(0, 5) : [];
  const experiments = Array.isArray(rawValue.experiments) ? rawValue.experiments.map(item => cleanText(item, 180)).filter(Boolean).slice(0, 5) : [];

  return {
    rawDirection: direction,
    rawGuardrails: guardrails,
    rawExperiments: experiments,
    derived: {
      direction,
      guardrails,
      experiments,
    },
  };
}

export async function buildLevel2SecondaryHypotheses(params: {
  birthData?: {
    birthDate: string | null;
    birthTime: string | null;
    birthCity: string | null;
    birthCountry: string | null;
    birthTimezone: string | null;
  };
  fullNameAtBirth?: string;
}) : Promise<MiraLevel2SecondaryHypotheses> {
  const base: MiraLevel2SecondaryHypotheses = {
    numerology: {
      status: "unavailable",
      confidence: "low",
      contextSummary: "Optional numerology context unavailable; DEEPER uses user evidence only.",
      lens: "No secondary lens available.",
      source: "none",
    },
    humanDesign: {
      status: "unavailable",
      confidence: "low",
      note: "No active Human Design integration in the current V4 pipeline.",
      source: "none",
    },
  };

  if (!params.birthData?.birthDate || !params.birthData.birthCity || !params.birthData.birthCountry || !params.birthData.birthTimezone) {
    return base;
  }

  const provider = createConfiguredBirthDataProvider({
    apiKey: ENV.dakidartsApiKey,
    baseUrl: ENV.dakidartsApiBaseUrl,
  });

  if (!provider) return base;

  const payload: BirthDataInput = {
    fullNameAtBirth: (params.fullNameAtBirth ?? "Private Mira User").trim() || "Private Mira User",
    birthDate: params.birthData.birthDate,
    birthTime: params.birthData.birthTime ?? "",
    timezone: params.birthData.birthTimezone,
    birthCity: params.birthData.birthCity,
    birthCountry: params.birthData.birthCountry,
  };

  const prepared = await prepareBirthDataModule(payload, provider);
  const output = prepared.output;
  if (!output.available || !output.recognitionLayer) {
    return {
      ...base,
      numerology: {
        status: "unavailable",
        confidence: "low",
        contextSummary: output.statusMessage,
        lens: "Optional context did not produce a safe supporting lens.",
        source: "none",
      },
    };
  }

  return {
    ...base,
    numerology: {
      status: "available",
      confidence: "low",
      contextSummary: output.recognitionLayer.contextSummary,
      lens: output.recognitionLayer.adaptiveQuestionLens,
      source: "dakidarts",
    },
  };
}

export function synthesizeMiraLevel2Preparation(params: {
  answers: MiraLevel2Answers;
  level1Result: MiraLevel1Result | null;
  secondaryHypotheses: MiraLevel2SecondaryHypotheses;
  retrievedKnowledge?: MiraRetrievedKnowledge[];
  personalReferenceImage?: { id: string } | null;
}): MiraLevel2Synthesis {
  const { answers, level1Result, secondaryHypotheses } = params;
  const retrievedKnowledge = params.retrievedKnowledge ?? [];
  const ab = answers.ab_visual_calibration;
  const refs = answers.reference_interpretation;
  const notion = answers.notion_intelligence;
  const createPrep = answers.create_preparation;

  const coreInsight = answers.core_tension_probe.derived.anchorLine || level1Result?.firstPattern || "A clearer first pattern is still emerging.";
  const biasLabel = ab.derived.directionalBias === "balanced"
    ? "Balanced pull between both options"
    : ab.derived.directionalBias === "A"
      ? "Leaning toward option A traits"
      : "Leaning toward option B traits";

  const keepSignals = refs.derived.keptSignals.slice(0, 4);
  const rejectSignals = refs.derived.rejectedSignals.slice(0, 4);
  const decisivePairs = ab.rawPairs.filter(pair => pair.selectedValue && (pair.chosen === "A" || pair.chosen === "B"));
  const reasonCounts = new Map<string, number>();
  decisivePairs.flatMap(pair => pair.reasonTags ?? []).forEach(tag => reasonCounts.set(tag, (reasonCounts.get(tag) ?? 0) + 1));
  const repeatedPatterns = Array.from(reasonCounts.entries()).filter(([, count]) => count >= 2).map(([tag]) => tag);
  const preferredDimensions = decisivePairs.map(pair => ({
    dimension: pair.primaryDimension ?? pair.pairId,
    value: pair.selectedValue!,
    confidence: Math.min(1, Math.max(0.55, pair.confidence / 5) + (pair.reasonTags ?? []).filter(tag => repeatedPatterns.includes(tag)).length * 0.1),
  }));
  const overallConfidence: "low" | "medium" | "high" = decisivePairs.length >= 5 && repeatedPatterns.length >= 1 ? "high" : decisivePairs.length >= 3 ? "medium" : "low";
  const dimensionValue = (dimension: string, fallback: string) => preferredDimensions.find(item => item.dimension === dimension)?.value ?? fallback;
  const productionInstruction = (dimension: string, fallback: string) => {
    const selected = dimensionValue(dimension, "").toLowerCase();
    const instructions: Record<string, Record<string, string>> = {
      proximity: {
        intimate: "Work at intimate portrait distance: close and medium-close crops, eye-level physical presence, and facial or hand detail that makes the viewer feel within the subject's personal space.",
        environmental: "Work at environmental distance: wider frames that keep the subject in meaningful relationship to the surrounding space, with architecture carrying substantial visual weight.",
      },
      light: {
        soft: "Use broad, diffused natural light with gradual tonal transitions, open shadows, gentle falloff, and no hard-edged lighting pattern.",
        graphic: "Use hard, directional light that creates deliberate geometric shadow edges, bright-to-dark planes, and visibly structured lighting across subject and architecture.",
      },
      environment: {
        organic: "Set the campaign in one lived-in organic environment with natural irregularity, tactile surfaces, wood, plaster, foliage or weathered material, avoiding rigid corporate geometry.",
        architectural: "Set the campaign in one precise architectural environment defined by strong lines, planes, thresholds, repetition, and controlled built geometry.",
      },
      movement: {
        dynamic: "Direct real continuous action rather than a held pose: walking, turning, reaching, shifting weight or moving fabric; use responsive camera tracking and selective natural motion blur where it supports life.",
        still: "Direct composed stillness with a planted body, minimal gesture and a locked or highly controlled camera; let tension come from posture, geometry and gaze rather than action.",
      },
      density: {
        layered: "Build layered compositions with active foreground, subject plane and background, overlapping tactile elements, partial occlusion and multiple points of discovery while retaining editorial hierarchy.",
        minimal: "Build sparse compositions with generous negative space, few objects, clean separation, one dominant focal point and no incidental visual clutter.",
      },
      finish: {
        raw: "Keep the photographic finish materially honest and lightly imperfect: visible grain and surface texture, restrained retouching, natural creases and edges, never airbrushed or excessively polished.",
        polished: "Use a precise polished photographic finish: crisp controlled detail, clean surfaces, deliberate grooming, refined tonal consistency and disciplined retouching without becoming generic or synthetic.",
      },
    };
    return instructions[dimension]?.[selected] ?? fallback;
  };
  const atmosphereWords: Record<string, string> = {
    intimate: "intimate and present", environmental: "spatial and observational",
    soft: "soft-edged", graphic: "sculpted by graphic contrast",
    organic: "organic and lived-in", architectural: "architectural and precise",
    dynamic: "alive with kinetic energy", still: "controlled and quietly tense",
    layered: "layered and abundant", minimal: "spare and distilled",
    raw: "materially honest", polished: "immaculately resolved",
  };
  const selectedValues = new Map(preferredDimensions.map(item => [item.dimension, item.value.toLowerCase()]));
  const atmosphereDirection = ["proximity", "light", "environment", "movement", "density", "finish"]
    .map(dimension => atmosphereWords[selectedValues.get(dimension) ?? ""])
    .filter(Boolean)
    .join(", ");
  const stylingDirection = selectedValues.get("finish") === "raw" || selectedValues.get("environment") === "organic"
    ? "Use tactile, naturally draped wardrobe with visible material character, relaxed construction and styling that can move and crease without looking contrived."
    : selectedValues.get("finish") === "polished" || selectedValues.get("environment") === "architectural"
      ? "Use precise structured silhouettes, controlled tailoring, clean material surfaces and minimal deliberate accessories that echo the architecture."
      : repeatedPatterns.includes("styling") ? "Treat styling as a repeated decision signal." : "Keep styling aligned with direct evidence.";
  const canonicalEvidence: MiraLevel2Synthesis["canonicalEvidence"] = [
    {
      dimension: "core_tension", value: coreInsight, sourceType: "user_statement", directness: "direct", confidence: 1,
      context: "DEEPER core tension", sourceId: "core_tension_probe", sourceVersion: "mira_l2_v2", userConfirmed: true,
    },
    ...decisivePairs.map(pair => ({
      dimension: pair.primaryDimension ?? pair.pairId, value: pair.selectedValue!, sourceType: "visual_ab" as const,
      directness: "observed" as const, confidence: preferredDimensions.find(item => item.dimension === (pair.primaryDimension ?? pair.pairId))?.confidence ?? 0.55,
      context: (pair.reasonTags ?? []).join(", ") || "Visual selection", sourceId: pair.pairId,
      sourceVersion: pair.pairVersion ?? "legacy", userConfirmed: true,
    })),
    ...keepSignals.map((signal, index) => ({
      dimension: "reference_signal", value: signal, sourceType: "reference_annotation" as const, directness: "direct" as const,
      confidence: 0.85, context: "User-kept reference signal", sourceId: refs.rawReferences[index]?.referenceId ?? `reference_${index + 1}`,
      sourceVersion: "mira_l2_v2", userConfirmed: true,
    })),
    ...retrievedKnowledge.flatMap(item => item.visualImplications.slice(0, 2).map((implication, index) => ({
      dimension: item.category, value: implication, sourceType: "notion_rag" as const, directness: "supporting_hypothesis" as const,
      confidence: Math.min(item.confidence, item.retrievalScore), context: item.principle, sourceId: item.knowledgeObjectId,
      sourceVersion: item.source.version, userConfirmed: false,
    }))),
    ...(secondaryHypotheses.numerology.status === "available" ? [{
      dimension: "personal_context", value: secondaryHypotheses.numerology.contextSummary, sourceType: "numerology" as const,
      directness: "supporting_hypothesis" as const, confidence: 0.25, context: secondaryHypotheses.numerology.lens,
      sourceId: "dakidarts", sourceVersion: "mira_birth_v3", userConfirmed: false,
    }] : []),
  ];

  const strongestEvidence = canonicalEvidence
    .filter(item => item.userConfirmed && item.confidence >= 0.7)
    .map(item => `${item.dimension}: ${item.value}`).slice(0, 8);
  const supportingResearch = retrievedKnowledge.map(item => `${item.title}: ${item.principle}`).slice(0, 3);
  const shootContext = answers.core_tension_probe.shootContext ?? null;

  return {
    evidenceHierarchy: {
      primary: "User-stated evidence from Level 1 and DEEPER calibration.",
      secondary: "Observed repeat patterns across A/B and reference interpretation.",
      tertiary: "Optional secondary hypotheses (numerology/Human Design), never overriding user evidence.",
    },
    calibrationInsights: [
      coreInsight,
      `${biasLabel}. ${ab.derived.recurringReason}`,
      keepSignals.length
        ? `Repeated keep-signals: ${keepSignals.join("; ")}.`
        : "Reference keep-signals are still sparse; treat direction as provisional.",
    ],
    visualDecisionRules: [
      ...keepSignals.map(signal => `Preserve: ${signal}`),
      ...rejectSignals.map(signal => `Avoid: ${signal}`),
    ].slice(0, 8),
    referenceInterpretation: {
      keep: keepSignals,
      avoid: rejectSignals,
    },
    notionIntelligence: {
      status: notion.derived.status,
      usedSignals: notion.rawSignals.map(item => `${item.source}: ${item.signal}`).slice(0, 8),
      failOpenReason: notion.derived.failOpenReason,
    },
    secondaryHypotheses,
    canonicalEvidence,
    createPreparation: {
      direction: createPrep.derived.direction,
      guardrails: createPrep.derived.guardrails,
      experiments: createPrep.derived.experiments,
    },
    createHandoff: {
      shootContext,
      brandContext: {
        level1Pattern: level1Result?.firstPattern ?? null,
        coreTension: coreInsight,
        work: level1Result?.businessContext?.work ?? null,
        audience: level1Result?.businessContext?.audience ?? null,
      },
      visualEvidence: {
        preferredDimensions, repeatedPatterns, rejectedPatterns: rejectSignals,
        referenceSignals: keepSignals, rationales: decisivePairs.map(pair => pair.rationale).filter(Boolean), confidence: overallConfidence,
      },
      knowledgeContext: {
        retrievedKnowledge,
        provenance: retrievedKnowledge.map(item => `${item.knowledgeObjectId}@${item.source.version}`),
      },
      personalContext: {
        numerologySignals: secondaryHypotheses.numerology.status === "available" ? [secondaryHypotheses.numerology.contextSummary] : [],
        humanDesignSignals: [],
      },
      personalReference: {
        provided: Boolean(params.personalReferenceImage),
        imageId: params.personalReferenceImage?.id ?? null,
        purpose: "subject_identity_reference",
      },
      visualDirection: {
        emotionalRegister: atmosphereDirection || coreInsight,
        colourDirection: repeatedPatterns.includes("colour") ? "Follow the repeatedly selected colour character." : "Keep colour subordinate to confirmed mood and context.",
        lightingDirection: productionInstruction("light", "Resolve lighting during CREATE from the confirmed emotional register."),
        compositionDirection: productionInstruction("density", "Use a legible editorial composition."),
        environmentDirection: productionInstruction("environment", "Choose an environment that supports the shoot purpose."),
        movementDirection: productionInstruction("movement", "Balance stillness and movement around the intended story."),
        stylingDirection,
        intimacyDistance: productionInstruction("proximity", "Use purposeful portrait distance."),
        textureMaterialDirection: productionInstruction("finish", repeatedPatterns.includes("texture") ? "Make tactile material detail visible." : "Use texture only where it supports the direction."),
        photographicLanguage: productionInstruction("finish", `Use an editorial photographic finish with ${createPrep.derived.direction}`),
      },
      creativeRules: {
        mustHave: [...keepSignals, ...createPrep.derived.guardrails.map(item => `Protect: ${item}`)].slice(0, 8),
        avoid: [...rejectSignals, ...createPrep.derived.guardrails].slice(0, 8),
        unresolvedQuestions: decisivePairs.filter(pair => ["both", "neither", "not_sure", "tie"].includes(pair.chosen)).map(pair => pair.primaryDimension ?? pair.pairId),
      },
      createHandoff: {
        strongestEvidence, supportingResearch,
        creativeHypotheses: secondaryHypotheses.numerology.status === "available" ? [secondaryHypotheses.numerology.lens] : [],
        confidence: overallConfidence,
        rationale: "Direct user evidence and repeated visual behaviour determine direction; retrieved and birth-derived context only qualify it.",
      },
    },
    provenanceLabel: "MIRA synthesis with evidence hierarchy",
  };
}

export function buildLevel2RetrievalQuery(answers: MiraLevel2Answers, level1Result: MiraLevel1Result | null) {
  const shoot = answers.core_tension_probe.shootContext;
  return [
    level1Result?.firstPattern,
    level1Result?.businessContext?.work,
    level1Result?.businessContext?.audience,
    answers.core_tension_probe.derived.anchorLine,
    shoot?.shootPurpose,
    ...(shoot?.objective ?? []),
    ...(shoot?.usageChannels ?? []),
    ...answers.ab_visual_calibration.rawPairs.flatMap(pair => [pair.selectedValue, ...(pair.reasonTags ?? [])]),
    ...answers.reference_interpretation.derived.keptSignals,
    ...answers.reference_interpretation.derived.rejectedSignals.map(item => `avoid ${item}`),
  ].filter(Boolean).join(" ");
}

export function buildLevel2FixtureAnswers(profile: MiraLevel2FixtureProfile): MiraLevel2Answers {
  if (profile === "quiet_luxury") {
    return {
      core_tension_probe: {
        rawText: "Keep the work intimate but legible, never loud.",
        derived: { anchorLine: "Keep the work intimate but legible, never loud.", confidence: "clear" },
      },
      ab_visual_calibration: {
        rawPairs: [{ pairId: "pair_1", optionA: "Deep shadow", optionB: "Flat bright daylight", chosen: "A", rationale: "Shadow carries privacy and precision.", confidence: 5 }],
        derived: { directionalBias: "A", recurringReason: "Shadow carries privacy and precision." },
      },
      reference_interpretation: {
        rawReferences: [{ referenceId: "ref_1", observedSignal: "Quiet contrast with tactile tailoring", supportsDirection: true, confidence: 5 }],
        derived: { keptSignals: ["Quiet contrast with tactile tailoring"], rejectedSignals: [] },
      },
      notion_intelligence: {
        rawManualContext: "Recent notes mention calm authority and intimacy.",
        rawSignals: [{ source: "notion", signal: "Calm authority in client language", confidence: 4 }],
        derived: { status: "available", failOpenReason: null },
      },
      create_preparation: {
        rawDirection: "Editorial intimacy with precise contrast.",
        rawGuardrails: ["No generic luxury cues"],
        rawExperiments: ["Test one scene with hard edge shadow"],
        derived: {
          direction: "Editorial intimacy with precise contrast.",
          guardrails: ["No generic luxury cues"],
          experiments: ["Test one scene with hard edge shadow"],
        },
      },
    };
  }

  if (profile === "playful_operator") {
    return {
      core_tension_probe: {
        rawText: "Keep strategic sharpness while preserving play.",
        derived: { anchorLine: "Keep strategic sharpness while preserving play.", confidence: "clear" },
      },
      ab_visual_calibration: {
        rawPairs: [{ pairId: "pair_1", optionA: "Rigid symmetry", optionB: "Asymmetric movement", chosen: "B", rationale: "Movement keeps the work alive.", confidence: 4 }],
        derived: { directionalBias: "B", recurringReason: "Movement keeps the work alive." },
      },
      reference_interpretation: {
        rawReferences: [{ referenceId: "ref_1", observedSignal: "Playful gesture with disciplined frame", supportsDirection: true, confidence: 4 }],
        derived: { keptSignals: ["Playful gesture with disciplined frame"], rejectedSignals: [] },
      },
      notion_intelligence: {
        rawManualContext: "Notes emphasize surprise and clarity.",
        rawSignals: [],
        derived: { status: "unavailable", failOpenReason: "Notion sync unavailable; using manual context only." },
      },
      create_preparation: {
        rawDirection: "Disciplined structure with kinetic moments.",
        rawGuardrails: ["No chaotic styling"],
        rawExperiments: ["Test one motion-led portrait"],
        derived: {
          direction: "Disciplined structure with kinetic moments.",
          guardrails: ["No chaotic styling"],
          experiments: ["Test one motion-led portrait"],
        },
      },
    };
  }

  return {
    core_tension_probe: {
      rawText: "Protect the precise editorial spine while allowing emotional warmth.",
      derived: { anchorLine: "Protect the precise editorial spine while allowing emotional warmth.", confidence: "clear" },
    },
    ab_visual_calibration: {
      rawPairs: [{ pairId: "pair_1", optionA: "Structured framing", optionB: "Loose candid framing", chosen: "A", rationale: "Structure protects credibility.", confidence: 4 }],
      derived: { directionalBias: "A", recurringReason: "Structure protects credibility." },
    },
    reference_interpretation: {
      rawReferences: [{ referenceId: "ref_1", observedSignal: "Clean composition with subtle texture", supportsDirection: true, confidence: 4 }],
      derived: { keptSignals: ["Clean composition with subtle texture"], rejectedSignals: [] },
    },
    notion_intelligence: {
      rawManualContext: null,
      rawSignals: [],
      derived: { status: "unavailable", failOpenReason: "Notion sync not configured." },
    },
    create_preparation: {
      rawDirection: "Editorial clarity with tactile warmth.",
      rawGuardrails: ["Avoid over-polish", "Avoid trend-led motifs"],
      rawExperiments: ["Test one high-contrast interior set"],
      derived: {
        direction: "Editorial clarity with tactile warmth.",
        guardrails: ["Avoid over-polish", "Avoid trend-led motifs"],
        experiments: ["Test one high-contrast interior set"],
      },
    },
  };
}
