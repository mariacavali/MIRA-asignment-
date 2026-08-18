import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { protectedProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import {
  appendMiraV4Level1Answer,
  appendMiraV4Level2Answer,
  appendMiraV4Level2Inspiration,
  appendMiraV4Level2PersonalReference,
  createMiraV4Journey,
  createMiraV4Level1Journey,
  claimMiraV4CreativeDna,
  completeMiraV4CreativeDna,
  appendMiraV4CreativeTurn,
  appendMiraV4RecognitionTurn,
  completeMiraV4Inspiration,
  claimMiraV4VisualSet,
  completeMiraV4VisualSet,
  failMiraV4CreativeDna,
  failMiraV4VisualSet,
  getMiraV4CreativeDnaRecord,
  getMiraV4CreativeDnaSource,
  getMiraV4CreativeState,
  getMiraV4Level1State,
  getMiraV4Level2State,
  getMiraV4MoodboardState,
  getMiraV4VisualSet,
  getMiraV4RecognitionState,
  getOwnedMiraV4Journey,
  listMiraV4Journeys,
  replaceMiraV4Level2Fixture,
  saveMiraV4Level1Result,
  saveMiraV4Level2Synthesis,
  saveMiraV4CreateVisualState,
  saveMiraV4BirthDetails,
  saveMiraV4CreativeBrief,
  saveMiraV4InspirationAsset,
  saveMiraV4QuickContext,
  startMiraV4Recognition,
} from "./db";
import {
  buildRecognitionAssistantMessage,
  generateCreativeQuestion,
  generateRecognitionQuestion,
  shouldGenerateCreativeQuestion,
  shouldGenerateRecognitionQuestion,
} from "./reflection";
import { buildMiraV4BrandBlueprintPreview } from "./brandBlueprint";
import {
  fingerprintMiraV4CreativeDnaSource,
  synthesizeMiraV4CreativeDna,
  type MiraV4CreativeDnaSource,
} from "./creativeDna";
import { resolveBirthLocation, searchBirthCities } from "./birthLocation";
import {
  MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
  MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
} from "../../shared/miraV4CreativeDna";
import { generateImage, resolveImageInputUrl } from "../_core/imageGeneration";
import {
  buildFinalMoodboardPrompts,
  buildRefinedVisualPrompts,
  compileMiraV4VisualSource,
  fingerprintMiraV4FinalMoodboard,
  fingerprintMiraV4RefinedVisualSet,
  MIRA_V4_VISUAL_PROMPT_VERSION,
  type MiraV4SelectedVisualReference,
} from "./moodboard";
import {
  ANTI_SIGNAL_VALUES,
  BRAND_SEASON_VALUES,
  buildLevel1FixtureAnswers,
  DESIRED_AUDIENCE_RESPONSE_VALUES,
  EXPRESSIVE_ENERGY_VALUES,
  LEVEL1_FIXTURE_PROFILES,
  getNextLevel1QuestionKey,
  LEVEL1_QUESTION_ORDER,
  LEVEL1_SEGMENTS,
  normalizeLevel1Answer,
  PROTECTED_TENSION_VALUES,
  SOCIAL_PRESENCE_VALUES,
  synthesizeMiraLevel1Result,
  type MiraLevel1Answers,
  type MiraLevel1FixtureProfile,
  VISUAL_INGREDIENT_VALUES,
} from "./level1";
import {
  buildLevel2FixtureAnswers,
  buildLevel2SecondaryHypotheses,
  buildLevel2RetrievalQuery,
  getNextLevel2QuestionKey,
  LEVEL2_FIXTURE_PROFILES,
  LEVEL2_INTERACTION_ORDER,
  normalizeLevel2Answer,
  synthesizeMiraLevel2Preparation,
  type MiraLevel2Answers,
  type MiraLevel2FixtureProfile,
} from "./level2";
import { getNotionDatabaseSpecification, loadMiraKnowledgeCorpus, loadNotionIntelligence } from "./notionAdapter";
import { MIRA_KNOWLEDGE_OBJECTS, retrieveMiraKnowledgeHybrid } from "./knowledgeRag";
import { compileLevel2CreateDirection } from "./level2Create";
import { createInitialFrameStates, generateLevel2CreateFrames, type MiraLevel2CreateFrameState } from "./level2CreateGeneration";

const journeyInput = z.object({ journeyId: z.number().int().positive() });

const creativeBriefSchema = z.object({
  journeyId: z.number().int().positive(),
  warmth: z.number().int().min(0).max(100),
  structure: z.number().int().min(0).max(100),
  expression: z.number().int().min(0).max(100),
  texture: z.string().trim().min(1).max(80),
  colorAttraction: z.string().trim().min(1).max(80),
  typography: z.string().trim().min(1).max(80),
  imageryWorld: z.string().trim().min(1).max(80),
});

const V4_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const level1JourneyInput = z.object({ journeyId: z.number().int().positive() });

const level1ChoiceArray = (values: readonly string[], min = 1, max = values.length) =>
  z.array(z.enum(values as [string, ...string[]])).min(min).max(max)
    .superRefine((list, ctx) => {
      if (new Set(list).size !== list.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate selections are not allowed" });
      }
    });

const level1AnswerSchema = z.discriminatedUnion("key", [
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("brand_season"),
    value: z.object({
      brand_season: z.enum(BRAND_SEASON_VALUES),
      rawSelection: z.string().trim().min(1).max(180),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("work_anchor"),
    value: z.object({
      work_anchor: z.string().trim().max(140).nullable(),
      audience: z.string().trim().max(140).nullable().optional(),
      stillFindingWords: z.boolean(),
    }).superRefine((value, ctx) => {
      if (!value.stillFindingWords && !value.work_anchor?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add one line or choose that you are still finding the words." });
      }
      if (value.stillFindingWords && value.work_anchor?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose either text or still-finding-words mode." });
      }
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("desired_audience_response"),
    value: z.object({
      desired_audience_response: level1ChoiceArray(DESIRED_AUDIENCE_RESPONSE_VALUES, 1, 2),
      rawSelections: z.array(z.string().trim().min(1).max(160)).min(1).max(2),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("social_presence"),
    value: z.object({
      social_presence: z.enum(SOCIAL_PRESENCE_VALUES),
      rawSelection: z.string().trim().min(1).max(180),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("expressive_energies"),
    value: z.object({
      expressive_energies: level1ChoiceArray(EXPRESSIVE_ENERGY_VALUES, 2, 2),
      expressive_energy_other: z.string().trim().max(80).nullable(),
      rawSelections: z.array(z.string().trim().min(1).max(80)).min(2).max(2),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("visual_ingredients"),
    value: z.object({
      visual_ingredients: level1ChoiceArray(VISUAL_INGREDIENT_VALUES, 1, 3),
      rawSelections: z.array(z.string().trim().min(1).max(80)).min(1).max(3),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("protected_tension"),
    value: z.object({
      protected_tension: z.enum(PROTECTED_TENSION_VALUES),
      rawSelection: z.string().trim().min(1).max(160),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("anti_signals"),
    value: z.object({
      anti_signals: level1ChoiceArray(ANTI_SIGNAL_VALUES, 1, 2),
      anti_signal_other: z.string().trim().max(140).nullable(),
      rawSelections: z.array(z.string().trim().min(1).max(160)).min(1).max(2),
    }),
  }),
]);

function stringifyLevel1Answer(input: z.infer<typeof level1AnswerSchema>) {
  switch (input.key) {
    case "brand_season":
      return `Brand season: ${input.value.rawSelection}`;
    case "work_anchor":
      return input.value.stillFindingWords ? "Work anchor: still finding the words" : `Work anchor: ${input.value.work_anchor ?? ""} | Audience: ${input.value.audience ?? ""}`;
    case "desired_audience_response":
      return `Desired response: ${input.value.rawSelections.join(" | ")}`;
    case "social_presence":
      return `Social presence: ${input.value.rawSelection}`;
    case "expressive_energies":
      return `Expressive energies: ${input.value.rawSelections.join(" + ")}${input.value.expressive_energy_other ? ` | other: ${input.value.expressive_energy_other}` : ""}`;
    case "visual_ingredients":
      return `Visual ingredients: ${input.value.rawSelections.join(" | ")}`;
    case "protected_tension":
      return `Protected tension: ${input.value.rawSelection}`;
    case "anti_signals":
      return `Anti-signals: ${input.value.rawSelections.join(" | ")}${input.value.anti_signal_other ? ` | other: ${input.value.anti_signal_other}` : ""}`;
    default:
      return "Level 1 answer";
  }
}

const level2AnswerSchema = z.discriminatedUnion("key", [
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("core_tension_probe"),
    value: z.object({
      anchorLine: z.string().trim().min(8).max(260),
      shootContext: z.object({
        shootPurpose: z.string().trim().min(1).max(80),
        objective: z.array(z.string().trim().min(1).max(80)).min(1).max(4),
        usageChannels: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
        practicalConstraints: z.array(z.string().trim().min(1).max(80)).max(6),
      }).optional(),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("ab_visual_calibration"),
    value: z.object({
      pairs: z.array(z.object({
        pairId: z.string().trim().min(1).max(80),
        optionA: z.string().trim().min(1).max(140),
        optionB: z.string().trim().min(1).max(140),
        chosen: z.enum(["A", "B", "both", "neither", "not_sure", "tie"]),
        rationale: z.string().trim().max(240),
        confidence: z.number().int().min(1).max(5),
        pairVersion: z.string().trim().min(1).max(80).optional(),
        primaryDimension: z.string().trim().min(1).max(80).optional(),
        secondaryVariables: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
        assetAId: z.string().trim().min(1).max(100).optional(),
        assetBId: z.string().trim().min(1).max(100).optional(),
        assetVersion: z.string().trim().min(1).max(40).optional(),
        rightsStatus: z.string().trim().min(1).max(80).optional(),
        contextTags: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
        shownOrder: z.union([z.tuple([z.literal("A"), z.literal("B")]), z.tuple([z.literal("B"), z.literal("A")])]).optional(),
        reasonTags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
      })).min(1).max(6),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("reference_interpretation"),
    value: z.object({
      references: z.array(z.object({
        referenceId: z.string().trim().min(1).max(80),
        observedSignal: z.string().trim().min(2).max(220),
        supportsDirection: z.boolean(),
        confidence: z.number().int().min(1).max(5),
      })).max(6),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("notion_intelligence"),
    value: z.object({
      status: z.enum(["available", "unavailable"]),
      manualContext: z.string().trim().max(350).nullable(),
      failOpenReason: z.string().trim().max(220).nullable(),
      signals: z.array(z.object({
        source: z.string().trim().min(1).max(80),
        signal: z.string().trim().min(1).max(220),
        confidence: z.number().int().min(1).max(5),
      })).max(10),
    }),
  }),
  z.object({
    journeyId: z.number().int().positive(),
    key: z.literal("create_preparation"),
    value: z.object({
      direction: z.string().trim().min(8).max(280),
      guardrails: z.array(z.string().trim().min(2).max(180)).max(5),
      experiments: z.array(z.string().trim().min(2).max(180)).max(5),
    }),
  }),
]);

function stringifyLevel2Answer(input: z.infer<typeof level2AnswerSchema>) {
  switch (input.key) {
    case "core_tension_probe":
      return `Core tension probe: ${input.value.anchorLine}`;
    case "ab_visual_calibration":
      return `A/B calibration: ${input.value.pairs.length} pair(s) reviewed`;
    case "reference_interpretation":
      return `Reference interpretation: ${input.value.references.length} reference(s) interpreted`;
    case "notion_intelligence":
      return `Notion intelligence: ${input.value.status}`;
    case "create_preparation":
      return `Create preparation: ${input.value.direction}`;
    default:
      return "Level 2 answer";
  }
}

function formatLevel1State(state: {
  journey: Awaited<ReturnType<typeof getOwnedMiraV4Journey>>;
  answers: Partial<MiraLevel1Answers>;
  rawEvidence?: Partial<Record<string, unknown>>;
  result: ReturnType<typeof synthesizeMiraLevel1Result> | null;
}) {
  return {
    journey: state.journey,
    answers: state.answers,
    rawEvidence: state.rawEvidence ?? {},
    result: state.result,
    nextKey: getNextLevel1QuestionKey(state.answers),
    isComplete: Boolean(state.result),
    segments: LEVEL1_SEGMENTS,
    questionOrder: LEVEL1_QUESTION_ORDER,
    fixtureProfiles: LEVEL1_FIXTURE_PROFILES,
  };
}

function formatLevel2State(state: {
  journey: Awaited<ReturnType<typeof getOwnedMiraV4Journey>>;
  answers: Partial<MiraLevel2Answers>;
  rawEvidence?: Partial<Record<string, unknown>>;
  synthesis: ReturnType<typeof synthesizeMiraLevel2Preparation> | null;
  inspirations?: Array<{ id: string; storageKey: string; originalName: string; mimeType: string }>;
  personalReferenceImage?: { id: string; storageKey: string; originalName: string; mimeType: string } | null;
}) {
  return {
    journey: state.journey,
    answers: state.answers,
    rawEvidence: state.rawEvidence ?? {},
    synthesis: state.synthesis,
    nextKey: getNextLevel2QuestionKey(state.answers),
    isComplete: Boolean(state.synthesis),
    interactionOrder: LEVEL2_INTERACTION_ORDER,
    fixtureProfiles: LEVEL2_FIXTURE_PROFILES,
    notionSpecification: getNotionDatabaseSpecification(),
    inspirations: state.inspirations?.map(item => ({ id: item.id, originalName: item.originalName, mimeType: item.mimeType, url: `/manus-storage/${item.storageKey}` })) ?? [],
    personal_reference_image: state.personalReferenceImage
      ? {
          id: state.personalReferenceImage.id,
          originalName: state.personalReferenceImage.originalName,
          mimeType: state.personalReferenceImage.mimeType,
          url: `/manus-storage/${state.personalReferenceImage.storageKey}`,
          purpose: "subject_identity_reference" as const,
        }
      : null,
  };
}

function isImageProviderUsageExhausted(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /usage exhausted/i.test(message);
}
const inspirationUploadSchema = z.object({
  journeyId: z.number().int().positive(),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(V4_IMAGE_TYPES),
  base64: z.string().min(4).max(Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8),
});

const level2InspirationUploadSchema = inspirationUploadSchema.extend({});
const level2PersonalReferenceUploadSchema = inspirationUploadSchema.extend({});

function decodeInspirationImage(input: z.infer<typeof inspirationUploadSchema>) {
  const bytes = Buffer.from(input.base64, "base64");
  const validSignature = input.mimeType === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : input.mimeType === "image/png"
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !validSignature) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid JPEG, PNG, or WebP image up to 8 MB" });
  }
  return bytes;
}

export const quickContextSchema = z.object({
  journeyId: z.number().int().positive(),
  building: z.string().trim().min(2).max(1200),
  currentPosition: z.string().trim().min(2).max(1200),
  needMost: z.string().trim().min(2).max(1200),
  firstCreation: z.string().trim().min(2).max(1200),
});

export const birthDetailsSchema = z
  .object({
    journeyId: z.number().int().positive(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    birthTimeUnknown: z.boolean(),
    birthCity: z.string().trim().min(2).max(255),
    birthPlaceId: z.string().trim().min(2).max(255),
  })
  .superRefine((input, ctx) => {
    if (!input.birthTimeUnknown && !input.birthTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthTime"],
        message: "Add a birth time or choose that it is unknown.",
      });
    }
  });

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Journey not found" });
}

export const miraV4Router = router({
  createLevel1Journey: protectedProcedure.mutation(({ ctx }) => createMiraV4Level1Journey(ctx.user.id)),

  getLevel1State: protectedProcedure.input(level1JourneyInput).query(async ({ ctx, input }) => {
    const state = await getMiraV4Level1State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    return formatLevel1State(state);
  }),

  saveLevel1Answer: protectedProcedure.input(level1AnswerSchema).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4Level1State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.result) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Level 1 is already complete" });
    }

    const nextKey = getNextLevel1QuestionKey(state.answers);
    if (!nextKey) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Level 1 has no remaining questions" });
    }
    const nextIndex = LEVEL1_QUESTION_ORDER.indexOf(nextKey);
    const inputIndex = LEVEL1_QUESTION_ORDER.indexOf(input.key);
    if (inputIndex < 0 || inputIndex > nextIndex) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This answer is out of sequence" });
    }

    const normalized = normalizeLevel1Answer(
      input.key,
      input.value as unknown as Record<string, unknown>,
    );

    await appendMiraV4Level1Answer({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      key: input.key,
      content: stringifyLevel1Answer(input),
      value: normalized,
    });

    const updated = await getMiraV4Level1State(ctx.user.id, input.journeyId);
    if (!updated) notFound();
    const finalKey = getNextLevel1QuestionKey(updated.answers);

    if (!finalKey && !updated.result) {
      const completedAnswers = updated.answers as MiraLevel1Answers;
      const result = synthesizeMiraLevel1Result(completedAnswers);
      await saveMiraV4Level1Result({ userId: ctx.user.id, journeyId: input.journeyId, result });
      const completedState = await getMiraV4Level1State(ctx.user.id, input.journeyId);
      if (!completedState) notFound();
      return formatLevel1State(completedState);
    }

    return formatLevel1State(updated);
  }),

  loadLevel1Fixture: protectedProcedure
    .input(z.object({
      journeyId: z.number().int().positive(),
      profile: z.enum(LEVEL1_FIXTURE_PROFILES).default("playful_colourful"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV !== "development") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fixture loading is available only in development" });
      }

      const state = await getMiraV4Level1State(ctx.user.id, input.journeyId);
      if (!state) notFound();

      const fixtureAnswers: MiraLevel1Answers = buildLevel1FixtureAnswers(input.profile as MiraLevel1FixtureProfile);

      for (const key of LEVEL1_QUESTION_ORDER) {
        await appendMiraV4Level1Answer({
          userId: ctx.user.id,
          journeyId: input.journeyId,
          key,
          content: `Fixture answer (${input.profile}) for ${key}`,
          value: fixtureAnswers[key],
        });
      }

      const refreshed = await getMiraV4Level1State(ctx.user.id, input.journeyId);
      if (!refreshed) notFound();
      if (!refreshed.result) {
        await saveMiraV4Level1Result({
          userId: ctx.user.id,
          journeyId: input.journeyId,
          result: synthesizeMiraLevel1Result(refreshed.answers as MiraLevel1Answers),
        });
      }

      const completed = await getMiraV4Level1State(ctx.user.id, input.journeyId);
      if (!completed) notFound();
      return formatLevel1State(completed);
    }),

  getLevel2State: protectedProcedure.input(level1JourneyInput).query(async ({ ctx, input }) => {
    const [state, discoverState] = await Promise.all([
      getMiraV4Level2State(ctx.user.id, input.journeyId),
      getMiraV4Level1State(ctx.user.id, input.journeyId),
    ]);
    if (!state) notFound();
    return {
      ...formatLevel2State(state),
      discoverResult: discoverState?.result ?? null,
    };
  }),

  getLevel2CreateDirection: protectedProcedure.input(level1JourneyInput).query(async ({ ctx, input }) => {
    const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (!state.synthesis) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete DEEPER before entering CREATE" });
    }
    const direction = compileLevel2CreateDirection(state.synthesis);
    const visualSet = await getMiraV4VisualSet(ctx.user.id, input.journeyId, "moodboard");
    const stored = visualSet?.sourceFingerprint === direction.sourceFingerprint
      ? (visualSet.referencesJson ?? []) as MiraLevel2CreateFrameState[]
      : [];
    const generatedCount = stored.filter(frame => frame.status === "complete" && frame.url).length;
    const generating = stored.some(frame => frame.status === "generating");
    return {
      ...direction,
      imageStatus: generatedCount === 5 ? "generated" as const
        : generating ? "generating" as const
          : generatedCount > 0 ? "partially_generated" as const
            : "structured_prompts" as const,
      frameStates: stored.length ? stored : createInitialFrameStates(direction),
    };
  }),

  uploadLevel2Inspiration: protectedProcedure.input(level2InspirationUploadSchema).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.synthesis) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "References are locked after DEEPER is complete" });
    if ((state.inspirations?.length ?? 0) >= 5) throw new TRPCError({ code: "BAD_REQUEST", message: "You can add up to five inspiration images" });
    const bytes = decodeInspirationImage(input);
    const id = randomUUID();
    const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const stored = await storagePut(`mira-v4/${ctx.user.id}/${input.journeyId}/level2-inspiration/${id}.${extension}`, bytes, input.mimeType);
    const saved = await appendMiraV4Level2Inspiration({ userId: ctx.user.id, journeyId: input.journeyId, id, storageKey: stored.key, originalName: input.originalName, mimeType: input.mimeType });
    if (!saved) throw new TRPCError({ code: "CONFLICT", message: "You can add up to five inspiration images" });
    return { id, url: stored.url, originalName: input.originalName, mimeType: input.mimeType };
  }),

  uploadLevel2PersonalReference: protectedProcedure.input(level2PersonalReferenceUploadSchema).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.synthesis) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your personal reference is locked after DEEPER is complete" });
    if (state.personalReferenceImage) throw new TRPCError({ code: "CONFLICT", message: "One personal reference photo is supported for now" });
    const bytes = decodeInspirationImage(input);
    const id = randomUUID();
    const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const stored = await storagePut(`mira-v4/${ctx.user.id}/${input.journeyId}/level2-personal-reference/${id}.${extension}`, bytes, input.mimeType);
    const saved = await appendMiraV4Level2PersonalReference({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      id,
      storageKey: stored.key,
      originalName: input.originalName,
      mimeType: input.mimeType,
    });
    if (!saved) throw new TRPCError({ code: "CONFLICT", message: "One personal reference photo is supported for now" });
    return { id, url: stored.url, originalName: input.originalName, mimeType: input.mimeType, purpose: "subject_identity_reference" as const };
  }),

  generateLevel2CreateFrames: protectedProcedure.input(z.object({
    journeyId: z.number().int().positive(),
    frameIds: z.array(z.enum(["frame_1", "frame_2", "frame_3", "frame_4", "frame_5"])).max(5).optional(),
  })).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (!state.synthesis) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete DEEPER before generating CREATE" });
    const direction = compileLevel2CreateDirection(state.synthesis);
    const visualSet = await getMiraV4VisualSet(ctx.user.id, input.journeyId, "moodboard");
    let existing = visualSet?.sourceFingerprint === direction.sourceFingerprint
      ? (visualSet.referencesJson ?? []) as MiraLevel2CreateFrameState[]
      : createInitialFrameStates(direction);
    if (existing.some(frame => frame.status === "generating")) {
      const requested = new Set(input.frameIds ?? []);
      const interrupted = existing.filter(frame => frame.status === "generating");
      if (requested.size !== 1 || interrupted.some(frame => !requested.has(frame.id as never))) {
        throw new TRPCError({ code: "CONFLICT", message: "CREATE image generation is already in progress" });
      }
      existing = existing.map(frame => frame.status === "generating" ? { ...frame, status: "failed", errorCode: "generation_interrupted" } : frame);
    }
    const persist = async (frames: MiraLevel2CreateFrameState[]) => {
      const complete = frames.filter(frame => frame.status === "complete").length;
      const failed = frames.some(frame => frame.status === "failed");
      await saveMiraV4CreateVisualState({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        sourceFingerprint: direction.sourceFingerprint,
        promptVersion: direction.mariaStyle.promptVersion,
        campaignPlan: direction as unknown as Record<string, unknown>,
        references: frames,
        status: complete === 5 ? "complete" : failed ? "retryable_error" : "in_progress",
        errorCode: failed ? "create_frame_generation_failed" : null,
      });
    };
    const frames = await generateLevel2CreateFrames({
      direction,
      existing,
      frameIds: input.frameIds,
      generate: generateImage,
      resolveReference: resolveImageInputUrl,
      inspirationImages: (state.inspirations ?? []).map(image => ({ url: `/manus-storage/${image.storageKey}`, mimeType: image.mimeType })),
      personalReferenceImage: state.personalReferenceImage
        ? { url: `/manus-storage/${state.personalReferenceImage.storageKey}`, mimeType: state.personalReferenceImage.mimeType }
        : undefined,
      onState: persist,
    });
    return {
      complete: frames.filter(frame => frame.status === "complete").length,
      failed: frames.filter(frame => frame.status === "failed").map(frame => frame.id),
    };
  }),

  pullLevel2NotionSignals: protectedProcedure
    .input(z.object({
      journeyId: z.number().int().positive(),
      manualContext: z.string().trim().max(350).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
      if (!state) notFound();

      const snapshot = await loadNotionIntelligence();
      const normalized = normalizeLevel2Answer("notion_intelligence", {
        status: snapshot.status,
        manualContext: input.manualContext,
        failOpenReason: snapshot.failOpenReason,
        signals: snapshot.signals,
      });

      await appendMiraV4Level2Answer({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        key: "notion_intelligence",
        content: `Notion intelligence: ${snapshot.status}`,
        value: normalized,
      });

      const refreshed = await getMiraV4Level2State(ctx.user.id, input.journeyId);
      if (!refreshed) notFound();
      return formatLevel2State(refreshed);
    }),

  saveLevel2Answer: protectedProcedure.input(level2AnswerSchema).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.synthesis) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Level 2 is already complete" });
    }

    let nextKey = getNextLevel2QuestionKey(state.answers);
    if (nextKey === "notion_intelligence" && input.key === "create_preparation") {
      const snapshot = await loadNotionIntelligence();
      await appendMiraV4Level2Answer({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        key: "notion_intelligence",
        content: "Supporting intelligence prepared",
        value: normalizeLevel2Answer("notion_intelligence", { status: snapshot.status, manualContext: null, failOpenReason: snapshot.failOpenReason, signals: snapshot.signals }),
      });
      nextKey = "create_preparation";
    }
    if (!nextKey) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Level 2 has no remaining interactions" });
    }
    const nextIndex = LEVEL2_INTERACTION_ORDER.indexOf(nextKey);
    const inputIndex = LEVEL2_INTERACTION_ORDER.indexOf(input.key);
    if (inputIndex < 0 || inputIndex > nextIndex) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This answer is out of sequence" });
    }

    const normalized = normalizeLevel2Answer(
      input.key,
      input.value as unknown as Record<string, unknown>,
    );

    await appendMiraV4Level2Answer({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      key: input.key,
      content: stringifyLevel2Answer(input),
      value: normalized,
    });

    // Notion is supporting intelligence, never a customer-facing interaction.
    // Populate the existing internal slot after the customer confirms references;
    // the local approved Knowledge Object corpus remains the synthesis fallback.
    if (input.key === "reference_interpretation") {
      const snapshot = await loadNotionIntelligence();
      await appendMiraV4Level2Answer({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        key: "notion_intelligence",
        content: "Supporting intelligence prepared",
        value: normalizeLevel2Answer("notion_intelligence", {
          status: snapshot.status,
          manualContext: null,
          failOpenReason: snapshot.failOpenReason,
          signals: snapshot.signals,
        }),
      });
    }

    const updated = await getMiraV4Level2State(ctx.user.id, input.journeyId);
    if (!updated) notFound();
    const finalKey = getNextLevel2QuestionKey(updated.answers);

    if (!finalKey && !updated.synthesis) {
      const level1State = await getMiraV4Level1State(ctx.user.id, input.journeyId);
      const secondaryHypotheses = await buildLevel2SecondaryHypotheses({
        birthData: {
          birthDate: updated.journey.birthDate,
          birthTime: updated.journey.birthTime,
          birthCity: updated.journey.birthCity,
          birthCountry: updated.journey.birthCountry,
          birthTimezone: updated.journey.birthTimezone,
        },
      });

      const knowledgeCorpus = await loadMiraKnowledgeCorpus();
      const retrieval = await retrieveMiraKnowledgeHybrid({
        query: buildLevel2RetrievalQuery(updated.answers as MiraLevel2Answers, level1State?.result ?? null),
        objects: knowledgeCorpus.objects,
        topK: 3,
      });
      const synthesis = synthesizeMiraLevel2Preparation({
        answers: updated.answers as MiraLevel2Answers,
        level1Result: level1State?.result ?? null,
        secondaryHypotheses,
        retrievedKnowledge: retrieval.results,
        personalReferenceImage: updated.personalReferenceImage,
      });

      await saveMiraV4Level2Synthesis({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        synthesis,
      });

      const completedState = await getMiraV4Level2State(ctx.user.id, input.journeyId);
      if (!completedState) notFound();
      return formatLevel2State(completedState);
    }

    return formatLevel2State(updated);
  }),

  loadLevel2Fixture: protectedProcedure
    .input(z.object({
      journeyId: z.number().int().positive(),
      profile: z.enum(LEVEL2_FIXTURE_PROFILES).default("editorial_founder"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV !== "development") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fixture loading is available only in development" });
      }

      const state = await getMiraV4Level2State(ctx.user.id, input.journeyId);
      if (!state) notFound();

      const fixtureAnswers: MiraLevel2Answers = buildLevel2FixtureAnswers(input.profile as MiraLevel2FixtureProfile);

      const level1State = await getMiraV4Level1State(ctx.user.id, input.journeyId);
      const knowledgeCorpus = await loadMiraKnowledgeCorpus();
      const retrieval = await retrieveMiraKnowledgeHybrid({
        query: buildLevel2RetrievalQuery(fixtureAnswers, level1State?.result ?? null),
        objects: knowledgeCorpus.objects,
        topK: 3,
      });
      const synthesis = synthesizeMiraLevel2Preparation({
        answers: fixtureAnswers,
        level1Result: level1State?.result ?? null,
        secondaryHypotheses: await buildLevel2SecondaryHypotheses({
          birthData: {
            birthDate: state.journey.birthDate,
            birthTime: state.journey.birthTime,
            birthCity: state.journey.birthCity,
            birthCountry: state.journey.birthCountry,
            birthTimezone: state.journey.birthTimezone,
          },
        }),
        retrievedKnowledge: retrieval.results,
        personalReferenceImage: state.personalReferenceImage,
      });

      await replaceMiraV4Level2Fixture({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        answers: fixtureAnswers,
        synthesis,
        profile: input.profile,
      });

      const completed = await getMiraV4Level2State(ctx.user.id, input.journeyId);
      if (!completed) notFound();
      return formatLevel2State(completed);
    }),

  createJourney: protectedProcedure.mutation(({ ctx }) => createMiraV4Journey(ctx.user.id)),

  listJourneys: protectedProcedure.query(({ ctx }) => listMiraV4Journeys(ctx.user.id)),

  getJourney: protectedProcedure.input(journeyInput).query(async ({ ctx, input }) => {
    const journey = await getOwnedMiraV4Journey(ctx.user.id, input.journeyId);
    if (!journey) notFound();
    return journey;
  }),

  saveQuickContext: protectedProcedure.input(quickContextSchema).mutation(async ({ ctx, input }) => {
    const saved = await saveMiraV4QuickContext(ctx.user.id, input.journeyId, {
      building: input.building,
      currentPosition: input.currentPosition,
      needMost: input.needMost,
      firstCreation: input.firstCreation,
    });
    if (!saved) notFound();
    return saved;
  }),

  saveBirthDetails: protectedProcedure.input(birthDetailsSchema).mutation(async ({ ctx, input }) => {
    let location: Awaited<ReturnType<typeof resolveBirthLocation>>;
    try {
      location = await resolveBirthLocation(input.birthPlaceId);
    } catch (error) {
      console.error("Mira V4 birth-location resolution failed", error);
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a city from the suggested locations so Mira can set country and timezone automatically." });
    }
    const saved = await saveMiraV4BirthDetails(ctx.user.id, input.journeyId, {
      birthDate: input.birthDate,
      birthTime: input.birthTime,
      birthTimeUnknown: input.birthTimeUnknown,
      birthCity: location.city,
      birthCountry: location.country,
      birthTimezone: location.timezone,
    });
    if (!saved) notFound();
    return saved;
  }),

  searchBirthCities: protectedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(120) }))
    .query(async ({ input }) => {
      try {
        return await searchBirthCities(input.query);
      } catch (error) {
        console.error("Mira V4 birth-city search failed", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "City search is temporarily unavailable. Please try again." });
      }
    }),

  startRecognition: protectedProcedure.input(journeyInput).mutation(async ({ ctx, input }) => {
    const journey = await getOwnedMiraV4Journey(ctx.user.id, input.journeyId);
    if (!journey) notFound();
    if (journey.status !== "recognition" || !["recognition_ready", "recognition"].includes(journey.currentStep)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Recognition is not ready" });
    }
    const state = await startMiraV4Recognition(ctx.user.id, input.journeyId);
    if (!state) notFound();
    return state;
  }),

  getRecognitionState: protectedProcedure.input(journeyInput).query(async ({ ctx, input }) => {
    const state = await getMiraV4RecognitionState(ctx.user.id, input.journeyId);
    if (!state) notFound();
    return state;
  }),

  submitRecognitionAnswer: protectedProcedure
    .input(z.object({ journeyId: z.number().int().positive(), answer: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV4RecognitionState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      if (state.journey.status !== "recognition" || state.journey.currentStep !== "recognition" || state.journey.turnCount >= 2) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Recognition is not accepting answers" });
      }

      const nextTurnCount = state.journey.turnCount + 1;
      const adaptive = shouldGenerateRecognitionQuestion(nextTurnCount)
        ? await generateRecognitionQuestion({
            completedAnswers: nextTurnCount,
            messages: state.messages.map(message => ({ role: message.role, content: message.content })),
            newAnswer: input.answer,
            quickContext: {
              building: state.journey.building,
              currentPosition: state.journey.currentPosition,
              needMost: state.journey.needMost,
              firstCreation: state.journey.firstCreation,
            },
          })
        : undefined;
      const assistantQuestion = adaptive
        ? buildRecognitionAssistantMessage(nextTurnCount, adaptive.question)
        : undefined;
      const saved = await appendMiraV4RecognitionTurn({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        expectedTurnCount: state.journey.turnCount,
        answer: input.answer,
        assistantQuestion,
        assistantProvenance: adaptive?.provenance,
      });
      if (!saved.saved) throw new TRPCError({ code: "CONFLICT", message: "Another answer was saved first" });
      return saved;
    }),

  saveCreativeBrief: protectedProcedure.input(creativeBriefSchema).mutation(async ({ ctx, input }) => {
    const { journeyId, ...creativeInputs } = input;
    const saved = await saveMiraV4CreativeBrief(ctx.user.id, journeyId, creativeInputs);
    if (!saved) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Creative Brief is not ready" });
    return saved;
  }),

  getCreativeState: protectedProcedure.input(journeyInput).query(async ({ ctx, input }) => {
    const state = await getMiraV4CreativeState(ctx.user.id, input.journeyId);
    if (!state) notFound();
    return state;
  }),

  getBrandBlueprintPreview: protectedProcedure.input(journeyInput).query(async ({ ctx, input }) => {
    const source = await getMiraV4CreativeDnaSource(ctx.user.id, input.journeyId);
    if (!source) notFound();
    if (!["creative_brief", "inspiration", "pre_generation_mirror", "visual_discovery", "visual_refinement", "moodboard"].includes(source.journey.currentStep)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brand Blueprint preview is not ready" });
    }

    return buildMiraV4BrandBlueprintPreview({
      journey: {
        building: source.journey.building,
        currentPosition: source.journey.currentPosition,
        needMost: source.journey.needMost,
        firstCreation: source.journey.firstCreation,
      },
      messages: source.messages.map(message => ({
        phase: message.phase,
        role: message.role,
        content: message.content,
      })),
    });
  }),

  submitCreativeAnswer: protectedProcedure
    .input(z.object({ journeyId: z.number().int().positive(), answer: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV4CreativeState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      if (state.journey.currentStep !== "creative_discovery" || state.journey.creativeTurnCount >= 5) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Creative Discovery is not accepting answers" });
      }
      const nextTurnCount = state.journey.creativeTurnCount + 1;
      const adaptive = shouldGenerateCreativeQuestion(nextTurnCount)
        ? await generateCreativeQuestion({
            completedAnswers: nextTurnCount,
            messages: state.messages.map(message => ({ role: message.role, content: message.content })),
            newAnswer: input.answer,
            quickContext: { building: state.journey.building, currentPosition: state.journey.currentPosition, needMost: state.journey.needMost, firstCreation: state.journey.firstCreation },
            creativeInputs: state.journey.creativeInputs,
          })
        : undefined;
      const saved = await appendMiraV4CreativeTurn({ userId: ctx.user.id, journeyId: input.journeyId, expectedTurnCount: state.journey.creativeTurnCount, answer: input.answer, assistantQuestion: adaptive?.question, assistantProvenance: adaptive?.provenance });
      if (!saved.saved) throw new TRPCError({ code: "CONFLICT", message: "Another answer was saved first" });
      return saved;
    }),

  uploadInspirationImage: protectedProcedure.input(inspirationUploadSchema).mutation(async ({ ctx, input }) => {
    const journey = await getOwnedMiraV4Journey(ctx.user.id, input.journeyId);
    if (!journey) notFound();
    if (journey.currentStep !== "inspiration" || journey.inspirationAssetId) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This journey is not accepting another inspiration image" });
    }
    const bytes = decodeInspirationImage(input);
    const assetId = randomUUID();
    const extension = input.mimeType === "image/jpeg" ? "jpg" : input.mimeType === "image/png" ? "png" : "webp";
    let stored: Awaited<ReturnType<typeof storagePut>>;
    try {
      stored = await storagePut(`mira-v4/${ctx.user.id}/${input.journeyId}/inspiration/${assetId}.${extension}`, bytes, input.mimeType);
    } catch (error) {
      console.error("Mira V4 private inspiration storage unavailable", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Private image storage is temporarily unavailable. No image record was created." });
    }
    const saved = await saveMiraV4InspirationAsset({ userId: ctx.user.id, journeyId: input.journeyId, assetId, storageKey: stored.key, originalName: input.originalName, mimeType: input.mimeType, byteSize: bytes.length });
    if (!saved) throw new TRPCError({ code: "CONFLICT", message: "An inspiration image was already saved" });
    return { assetId, originalName: input.originalName, mimeType: input.mimeType, byteSize: bytes.length };
  }),

  completeInspiration: protectedProcedure
    .input(z.object({ journeyId: z.number().int().positive(), explanation: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const saved = await completeMiraV4Inspiration(ctx.user.id, input.journeyId, input.explanation || null);
      if (!saved) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Inspiration is not ready" });
      return saved;
    }),

  synthesizeCreativeDna: protectedProcedure.input(journeyInput).mutation(async ({ ctx, input }) => {
    const existing = await getMiraV4CreativeDnaRecord(ctx.user.id, input.journeyId);
    if (existing?.status === "complete" && existing.creativeDnaJson) {
      return {
        status: "complete" as const,
        reused: true,
        schemaVersion: existing.schemaVersion,
        promptVersion: existing.promptVersion,
      };
    }

    const sourceState = await getMiraV4CreativeDnaSource(ctx.user.id, input.journeyId);
    if (!sourceState) notFound();
    const { journey, messages } = sourceState;
    if (
      journey.currentStep !== "pre_generation_mirror" ||
      journey.turnCount !== 2 ||
      journey.creativeTurnCount !== 5 ||
      !journey.creativeInputs
    ) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Creative DNA is not ready to synthesize" });
    }

    const source: MiraV4CreativeDnaSource = {
      journey: {
        building: journey.building,
        currentPosition: journey.currentPosition,
        needMost: journey.needMost,
        firstCreation: journey.firstCreation,
        birthDate: journey.birthDate,
        birthTime: journey.birthTime,
        birthTimeUnknown: journey.birthTimeUnknown,
        birthCity: journey.birthCity,
        creativeInputs: journey.creativeInputs,
      },
      conversation: messages.map(message => ({
        phase: message.phase,
        role: message.role,
        content: message.content,
      })),
      inspiration: {
        imageReference: journey.inspirationStorageKey,
        userExplanation: journey.inspirationExplanation,
        influenceRule: "supporting_evidence_only",
      },
    };
    const sourceFingerprint = fingerprintMiraV4CreativeDnaSource(source);
    const claim = await claimMiraV4CreativeDna({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      sourceFingerprint,
    });

    if (!claim.claimed) {
      if (claim.record?.status === "complete" && claim.record.creativeDnaJson) {
        return {
          status: "complete" as const,
          reused: true,
          schemaVersion: claim.record.schemaVersion,
          promptVersion: claim.record.promptVersion,
        };
      }
      throw new TRPCError({ code: "CONFLICT", message: "Creative DNA synthesis is already in progress" });
    }

    try {
      const inspirationImageUrl = journey.inspirationStorageKey
        ? await storageGetSignedUrl(journey.inspirationStorageKey)
        : undefined;
      const synthesis = await synthesizeMiraV4CreativeDna({ source, inspirationImageUrl });
      const completed = await completeMiraV4CreativeDna({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        creativeDna: synthesis.creativeDna,
        model: synthesis.model,
      });
      if (!completed?.creativeDnaJson) throw new Error("Creative DNA was not persisted");
      return {
        status: "complete" as const,
        reused: false,
        schemaVersion: MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
        promptVersion: MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
      };
    } catch (error) {
      console.error("Mira V4 Creative DNA synthesis failed", error);
      await failMiraV4CreativeDna(ctx.user.id, input.journeyId, "creative_dna_synthesis_failed");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Creative DNA could not be completed. Your journey is safe and the synthesis can be retried.",
      });
    }
  }),

  getMoodboardState: protectedProcedure.input(journeyInput).query(async ({ ctx, input }) => {
    const state = await getMiraV4MoodboardState(ctx.user.id, input.journeyId);
    if (!state) notFound();
    return state;
  }),

  generateVisualReferences: protectedProcedure.input(journeyInput).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4MoodboardState(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.initial?.status === "complete") return { status: "complete" as const, reused: true };
    if (state.initial?.status === "in_progress") {
      throw new TRPCError({ code: "CONFLICT", message: "Visual direction generation is already in progress" });
    }
    if (state.journey.currentStep !== "visual_discovery" || !state.creativeDna?.creativeDnaJson) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Visual direction is not ready" });
    }

    const source = compileMiraV4VisualSource(state.creativeDna.creativeDnaJson);
    const claim = await claimMiraV4VisualSet({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      stage: "initial",
      sourceFingerprint: source.sourceFingerprint,
      promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION,
      campaignPlan: source.campaignPlan as unknown as Record<string, unknown>,
    });
    if (!claim.claimed) {
      if (claim.record?.status === "complete") return { status: "complete" as const, reused: true };
      throw new TRPCError({ code: "CONFLICT", message: "Visual direction generation is already in progress" });
    }

    try {
      const generated = await Promise.all(source.references.map(async reference => {
        const image = await generateImage({ prompt: reference.prompt, quality: "medium" });
        if (!image.url) throw new Error("Visual reference generation returned no image URL");
        return { ...reference, url: image.url };
      }));
      await completeMiraV4VisualSet({ userId: ctx.user.id, journeyId: input.journeyId, stage: "initial", references: generated });
      return { status: "complete" as const, reused: false };
    } catch (error) {
      console.error("Mira V4 visual direction generation failed", error);
      const usageExhausted = isImageProviderUsageExhausted(error);
      await failMiraV4VisualSet({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        stage: "initial",
        errorCode: usageExhausted ? "image_generation_usage_exhausted" : "visual_direction_generation_failed",
      });
      if (usageExhausted) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Image generation is temporarily unavailable because the image service has reached its current usage limit. Your progress is safe. Please retry Visual Direction once image generation is available.",
        });
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Visual direction could not be completed. Your progress is safe and this stage can be retried." });
    }
  }),

  refineVisualReferences: protectedProcedure.input(z.object({
    journeyId: z.number().int().positive(),
    referenceId: z.string().trim().min(1).max(80),
    reasons: z.array(z.string().trim().min(2).max(280)).max(5),
    note: z.string().trim().max(500).nullable(),
  })).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4MoodboardState(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.refined?.status === "complete") return { status: "complete" as const, reused: true };
    if (!state.initial?.referencesJson || state.initial.status !== "complete" || !state.creativeDna?.creativeDnaJson) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Choose visual references before refining the direction" });
    }
    const initial = state.initial.referencesJson;
    const selected = initial.find(reference => reference.id === input.referenceId) as MiraV4SelectedVisualReference | undefined;
    if (!selected) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose one generated visual direction before refining it." });
    }
    const source = compileMiraV4VisualSource(state.creativeDna.creativeDnaJson);
    const selection = { referenceIds: [input.referenceId], reasons: input.reasons, note: input.note || null };
    const claim = await claimMiraV4VisualSet({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      stage: "refined",
      sourceFingerprint: fingerprintMiraV4RefinedVisualSet({
        sourceFingerprint: source.sourceFingerprint,
        referenceId: input.referenceId,
        reasons: input.reasons,
        note: input.note || null,
      }),
      promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION,
      campaignPlan: source.campaignPlan as unknown as Record<string, unknown>,
      selection,
    });
    if (!claim.claimed) {
      if (claim.record?.status === "complete") return { status: "complete" as const, reused: true };
      throw new TRPCError({ code: "CONFLICT", message: "The one visual refinement round is already in progress" });
    }
    try {
      const prompts = buildRefinedVisualPrompts({
        campaignPlan: source.campaignPlan,
        compositeImagePrompt: source.compositeImagePrompt,
        selected,
        selection: { reasons: input.reasons, note: input.note || null },
      });
      const selectedImageUrl = await resolveImageInputUrl(selected.url);
      const generated = await Promise.all(prompts.map(async reference => {
        const image = await generateImage({
          prompt: reference.prompt,
          originalImages: [{ url: selectedImageUrl, mimeType: "image/png" }],
          quality: "medium",
        });
        if (!image.url) throw new Error("Refined visual generation returned no image URL");
        return { ...reference, url: image.url };
      }));
      await completeMiraV4VisualSet({ userId: ctx.user.id, journeyId: input.journeyId, stage: "refined", references: generated });
      return { status: "complete" as const, reused: false };
    } catch (error) {
      console.error("Mira V4 visual refinement failed", error);
      await failMiraV4VisualSet({ userId: ctx.user.id, journeyId: input.journeyId, stage: "refined", errorCode: "visual_refinement_failed" });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Visual refinement could not be completed. Your selected references are safe and this stage can be retried." });
    }
  }),

  generateFinalMoodboard: protectedProcedure.input(z.object({
    journeyId: z.number().int().positive(),
    referenceId: z.string().trim().min(1).max(80),
    preserve: z.string().trim().min(2).max(300),
    avoid: z.string().trim().min(2).max(300),
    note: z.string().trim().max(500).nullable(),
  })).mutation(async ({ ctx, input }) => {
    const state = await getMiraV4MoodboardState(ctx.user.id, input.journeyId);
    if (!state) notFound();
    if (state.moodboard?.status === "complete" && state.moodboard.referencesJson?.length === 5) {
      return {
        status: "complete" as const,
        reused: true,
        urls: state.moodboard.referencesJson.map(reference => reference.url),
      };
    }
    if (!state.refined?.referencesJson || state.refined.status !== "complete" || !state.creativeDna?.creativeDnaJson) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete the selected visual refinement before generating the Moodboard" });
    }
    const selected = state.refined.referencesJson
      .find(reference => reference.id === input.referenceId) as MiraV4SelectedVisualReference | undefined;
    if (!selected) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose one refined visual direction for the final campaign." });
    }
    const source = compileMiraV4VisualSource(state.creativeDna.creativeDnaJson);
    const refinement = { preserve: input.preserve, avoid: input.avoid, note: input.note || null };
    const claim = await claimMiraV4VisualSet({
      userId: ctx.user.id,
      journeyId: input.journeyId,
      stage: "moodboard",
      sourceFingerprint: fingerprintMiraV4FinalMoodboard({
        sourceFingerprint: source.sourceFingerprint,
        refinedSourceFingerprint: state.refined.sourceFingerprint,
        referenceId: input.referenceId,
        preserve: input.preserve,
        avoid: input.avoid,
        note: input.note || null,
      }),
      promptVersion: MIRA_V4_VISUAL_PROMPT_VERSION,
      campaignPlan: source.campaignPlan as unknown as Record<string, unknown>,
      selection: { referenceIds: [input.referenceId], reasons: [] },
      refinement,
    });
    if (!claim.claimed) {
      if (claim.record?.status === "complete" && claim.record.referencesJson?.length === 5) {
        return {
          status: "complete" as const,
          reused: true,
          urls: claim.record.referencesJson.map(reference => reference.url),
        };
      }
      throw new TRPCError({ code: "CONFLICT", message: "Moodboard generation is already in progress" });
    }
    try {
      const prompts = buildFinalMoodboardPrompts({
        creativeDna: state.creativeDna.creativeDnaJson,
        campaignPlan: source.campaignPlan,
        compositeImagePrompt: source.compositeImagePrompt,
        selected,
        refinement,
      });
      const selectedImageUrl = await resolveImageInputUrl(selected.url);
      const generated = await Promise.all(prompts.map(async reference => {
        const image = await generateImage({
          prompt: reference.prompt,
          originalImages: [{ url: selectedImageUrl, mimeType: "image/png" }],
          quality: "high",
        });
        if (!image.url) throw new Error("Moodboard generation returned no image URL");
        return { id: reference.id, direction: reference.direction, prompt: reference.prompt, url: image.url };
      }));
      await completeMiraV4VisualSet({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        stage: "moodboard",
        references: generated,
        finalMoodboardUrl: generated[0]?.url,
      });
      return { status: "complete" as const, reused: false, urls: generated.map(reference => reference.url) };
    } catch (error) {
      console.error("Mira V4 Moodboard generation failed", error);
      await failMiraV4VisualSet({ userId: ctx.user.id, journeyId: input.journeyId, stage: "moodboard", errorCode: "moodboard_generation_failed" });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The final Moodboard could not be completed. Your campaign evidence is safe and this stage can be retried." });
    }
  }),
});
