import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { miraV4CreativeDna, miraV4Journeys, miraV4Messages, miraV4VisualSets } from "../../drizzle/schema";
import { getDb } from "../db";
import { FIRST_CREATIVE_DISCOVERY_QUESTION, FIRST_RECOGNITION_QUESTION } from "./reflection";
import {
  MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
  MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
  type MiraV4CreativeDna,
} from "../../shared/miraV4CreativeDna";
import {
  readStoredLevel1Answer,
  type MiraLevel1Answers,
  type MiraLevel1Result,
  type MiraLevel1QuestionKey,
} from "./level1";
import {
  readStoredLevel2Answer,
  LEVEL2_INTERACTION_ORDER,
  type MiraLevel2Answers,
  type MiraLevel2QuestionKey,
  type MiraLevel2Synthesis,
} from "./level2";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

async function loadMiraV4Messages(
  userId: number,
  journeyId: number,
  phase?: "recognition" | "creative_discovery",
) {
  const db = await requireDb();
  const conditions = [eq(miraV4Messages.journeyId, journeyId), eq(miraV4Messages.userId, userId)];
  if (phase) conditions.push(eq(miraV4Messages.phase, phase));
  return db
    .select()
    .from(miraV4Messages)
    .where(and(...conditions))
    .orderBy(asc(miraV4Messages.ordinal));
}

type MiraLevel1AnswerEntry = {
  type: "mira_l1_answer";
  key: MiraLevel1QuestionKey;
  value: MiraLevel1Answers[MiraLevel1QuestionKey] | Record<string, unknown>;
};

type MiraLevel1ResultEntry = {
  type: "mira_l1_result";
  value: MiraLevel1Result;
};

type MiraLevel2AnswerEntry = {
  type: "mira_l2_answer";
  key: MiraLevel2QuestionKey;
  value: MiraLevel2Answers[MiraLevel2QuestionKey] | Record<string, unknown>;
};

type MiraLevel2ResultEntry = {
  type: "mira_l2_result";
  value: MiraLevel2Synthesis;
};

type MiraLevel2InspirationEntry = {
  type: "mira_l2_inspiration";
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
};

export type MiraLevel2PersonalReferenceEntry = {
  type: "mira_l2_personal_reference";
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
};

function parseLevel2InspirationEntry(value: unknown): MiraLevel2InspirationEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "mira_l2_inspiration" || typeof raw.id !== "string" || typeof raw.storageKey !== "string") return null;
  return {
    type: "mira_l2_inspiration",
    id: raw.id,
    storageKey: raw.storageKey,
    originalName: String(raw.originalName ?? "Inspiration image"),
    mimeType: String(raw.mimeType ?? "image/jpeg"),
  };
}

function parseLevel2PersonalReferenceEntry(value: unknown): MiraLevel2PersonalReferenceEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "mira_l2_personal_reference" || typeof raw.id !== "string" || typeof raw.storageKey !== "string") return null;
  return {
    type: "mira_l2_personal_reference",
    id: raw.id,
    storageKey: raw.storageKey,
    originalName: String(raw.originalName ?? "Personal reference image"),
    mimeType: String(raw.mimeType ?? "image/jpeg"),
  };
}

function parseLevel1AnswerEntry(value: unknown): MiraLevel1AnswerEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "mira_l1_answer") return null;
  if (typeof raw.key !== "string") return null;
  if (!raw.value || typeof raw.value !== "object") return null;
  return {
    type: "mira_l1_answer",
    key: raw.key as MiraLevel1QuestionKey,
    value: raw.value as MiraLevel1Answers[MiraLevel1QuestionKey] | Record<string, unknown>,
  };
}

function parseLevel1ResultEntry(value: unknown): MiraLevel1ResultEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "mira_l1_result") return null;
  if (!raw.value || typeof raw.value !== "object") return null;
  return {
    type: "mira_l1_result",
    value: raw.value as MiraLevel1Result,
  };
}

function parseLevel2AnswerEntry(value: unknown): MiraLevel2AnswerEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "mira_l2_answer") return null;
  if (typeof raw.key !== "string") return null;
  if (!raw.value || typeof raw.value !== "object") return null;
  return {
    type: "mira_l2_answer",
    key: raw.key as MiraLevel2QuestionKey,
    value: raw.value as MiraLevel2Answers[MiraLevel2QuestionKey] | Record<string, unknown>,
  };
}

function parseLevel2ResultEntry(value: unknown): MiraLevel2ResultEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "mira_l2_result") return null;
  if (!raw.value || typeof raw.value !== "object") return null;
  return {
    type: "mira_l2_result",
    value: raw.value as MiraLevel2Synthesis,
  };
}

export async function createMiraV4Level1Journey(userId: number) {
  const db = await requireDb();
  const [created] = await db
    .insert(miraV4Journeys)
    .values({ userId, status: "intake", currentStep: "quick_context" })
    .$returningId();
  return { journeyId: created.id };
}

export async function getMiraV4Level1State(userId: number, journeyId: number) {
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;

  const messages = await loadMiraV4Messages(userId, journeyId);
  const answers: Partial<MiraLevel1Answers> = {};
  const rawEvidence: Partial<Record<MiraLevel1QuestionKey, unknown>> = {};
  let result: MiraLevel1Result | null = null;

  for (const message of messages) {
    const answer = parseLevel1AnswerEntry(message.provenance);
    if (answer) {
      (rawEvidence as Record<string, unknown>)[answer.key] = answer.value;
      (answers as Record<string, unknown>)[answer.key] = readStoredLevel1Answer(
        answer.key,
        answer.value as Record<string, unknown>,
      );
      continue;
    }
    const level1Result = parseLevel1ResultEntry(message.provenance);
    if (level1Result) result = level1Result.value;
  }

  return { journey, answers, rawEvidence, result };
}

export async function appendMiraV4Level1Answer(params: {
  userId: number;
  journeyId: number;
  key: MiraLevel1QuestionKey;
  content: string;
  value: MiraLevel1Answers[MiraLevel1QuestionKey] | Record<string, unknown>;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const latestRows = await tx
      .select({ ordinal: miraV4Messages.ordinal })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(desc(miraV4Messages.ordinal))
      .limit(1);
    const nextOrdinal = (latestRows[0]?.ordinal ?? 0) + 1;

    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: nextOrdinal,
      phase: "recognition",
      role: "user",
      content: params.content,
      provenance: {
        type: "mira_l1_answer",
        key: params.key,
        value: params.value,
      },
    });

    await tx
      .update(miraV4Journeys)
      .set({ status: "recognition", currentStep: "recognition" })
      .where(and(eq(miraV4Journeys.id, params.journeyId), eq(miraV4Journeys.userId, params.userId)));
  });
}

export async function getMiraV4Level2State(userId: number, journeyId: number) {
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;

  const messages = await loadMiraV4Messages(userId, journeyId);
  const answers: Partial<MiraLevel2Answers> = {};
  const rawEvidence: Partial<Record<MiraLevel2QuestionKey, unknown>> = {};
  let synthesis: MiraLevel2Synthesis | null = null;
  const inspirations: MiraLevel2InspirationEntry[] = [];
  let personalReferenceImage: MiraLevel2PersonalReferenceEntry | null = null;

  for (const message of messages) {
    const answer = parseLevel2AnswerEntry(message.provenance);
    if (answer) {
      (rawEvidence as Record<string, unknown>)[answer.key] = answer.value;
      (answers as Record<string, unknown>)[answer.key] = readStoredLevel2Answer(
        answer.key,
        answer.value as Record<string, unknown>,
      );
      continue;
    }
    const result = parseLevel2ResultEntry(message.provenance);
    if (result) synthesis = result.value;
    const inspiration = parseLevel2InspirationEntry(message.provenance);
    if (inspiration) inspirations.push(inspiration);
    const personalReference = parseLevel2PersonalReferenceEntry(message.provenance);
    if (personalReference) personalReferenceImage = personalReference;
  }

  return { journey, answers, rawEvidence, synthesis, inspirations, personalReferenceImage };
}

export async function appendMiraV4Level2Inspiration(params: {
  userId: number;
  journeyId: number;
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const rows = await tx.select({ ordinal: miraV4Messages.ordinal, provenance: miraV4Messages.provenance })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(desc(miraV4Messages.ordinal));
    const count = rows.filter(row => parseLevel2InspirationEntry(row.provenance)).length;
    if (count >= 5) return false;
    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: (rows[0]?.ordinal ?? 0) + 1,
      phase: "recognition",
      role: "user",
      content: "Inspiration image added",
      provenance: { type: "mira_l2_inspiration", id: params.id, storageKey: params.storageKey, originalName: params.originalName, mimeType: params.mimeType },
    });
    return true;
  });
}

export async function appendMiraV4Level2PersonalReference(params: {
  userId: number;
  journeyId: number;
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const rows = await tx.select({ ordinal: miraV4Messages.ordinal, provenance: miraV4Messages.provenance })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(desc(miraV4Messages.ordinal));
    if (rows.some(row => parseLevel2PersonalReferenceEntry(row.provenance))) return false;
    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: (rows[0]?.ordinal ?? 0) + 1,
      phase: "recognition",
      role: "user",
      content: "Personal reference image added",
      provenance: {
        type: "mira_l2_personal_reference",
        id: params.id,
        storageKey: params.storageKey,
        originalName: params.originalName,
        mimeType: params.mimeType,
      },
    });
    return true;
  });
}

export async function appendMiraV4Level2Answer(params: {
  userId: number;
  journeyId: number;
  key: MiraLevel2QuestionKey;
  content: string;
  value: MiraLevel2Answers[MiraLevel2QuestionKey] | Record<string, unknown>;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const latestRows = await tx
      .select({ ordinal: miraV4Messages.ordinal })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(desc(miraV4Messages.ordinal))
      .limit(1);
    const nextOrdinal = (latestRows[0]?.ordinal ?? 0) + 1;

    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: nextOrdinal,
      phase: "recognition",
      role: "user",
      content: params.content,
      provenance: {
        type: "mira_l2_answer",
        key: params.key,
        value: params.value,
      },
    });

    await tx
      .update(miraV4Journeys)
      .set({ status: "brand_dna_draft", currentStep: "brand_dna" })
      .where(and(eq(miraV4Journeys.id, params.journeyId), eq(miraV4Journeys.userId, params.userId)));
  });
}

export async function saveMiraV4Level2Synthesis(params: {
  userId: number;
  journeyId: number;
  synthesis: MiraLevel2Synthesis;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const latestRows = await tx
      .select({ ordinal: miraV4Messages.ordinal })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(desc(miraV4Messages.ordinal))
      .limit(1);
    const nextOrdinal = (latestRows[0]?.ordinal ?? 0) + 1;

    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: nextOrdinal,
      phase: "recognition",
      role: "assistant",
      content: params.synthesis.createPreparation.direction,
      provenance: {
        type: "mira_l2_result",
        value: params.synthesis,
      },
    });

    await tx
      .update(miraV4Journeys)
      .set({ status: "brand_dna_draft", currentStep: "brand_dna" })
      .where(and(eq(miraV4Journeys.id, params.journeyId), eq(miraV4Journeys.userId, params.userId)));
  });
}

export async function replaceMiraV4Level2Fixture(params: {
  userId: number;
  journeyId: number;
  answers: MiraLevel2Answers;
  synthesis: MiraLevel2Synthesis;
  profile: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const rows = await tx
      .select({ id: miraV4Messages.id, ordinal: miraV4Messages.ordinal, provenance: miraV4Messages.provenance })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(asc(miraV4Messages.ordinal));
    const level2Ids = rows
      .filter(row => parseLevel2AnswerEntry(row.provenance) || parseLevel2ResultEntry(row.provenance))
      .map(row => row.id);
    if (level2Ids.length) {
      await tx.delete(miraV4Messages).where(inArray(miraV4Messages.id, level2Ids));
    }
    const retainedOrdinals = rows.filter(row => !level2Ids.includes(row.id)).map(row => row.ordinal);
    let ordinal = retainedOrdinals.length ? Math.max(...retainedOrdinals) + 1 : 1;
    const values: Array<typeof miraV4Messages.$inferInsert> = LEVEL2_INTERACTION_ORDER.map(key => ({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: ordinal++,
      phase: "recognition" as const,
      role: "user" as const,
      content: `Fixture answer (${params.profile}) for ${key}`,
      provenance: { type: "mira_l2_answer", key, value: params.answers[key] },
    }));
    values.push({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: ordinal++,
      phase: "recognition",
      role: "assistant",
      content: params.synthesis.createPreparation.direction,
      provenance: { type: "mira_l2_result", value: params.synthesis },
    });
    await tx.insert(miraV4Messages).values(values);
    await tx.update(miraV4Journeys)
      .set({ status: "brand_dna_draft", currentStep: "brand_dna" })
      .where(and(eq(miraV4Journeys.id, params.journeyId), eq(miraV4Journeys.userId, params.userId)));
  });
}

export async function saveMiraV4Level1Result(params: {
  userId: number;
  journeyId: number;
  result: MiraLevel1Result;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const latestRows = await tx
      .select({ ordinal: miraV4Messages.ordinal })
      .from(miraV4Messages)
      .where(and(eq(miraV4Messages.userId, params.userId), eq(miraV4Messages.journeyId, params.journeyId)))
      .orderBy(desc(miraV4Messages.ordinal))
      .limit(1);
    const nextOrdinal = (latestRows[0]?.ordinal ?? 0) + 1;

    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: nextOrdinal,
      phase: "recognition",
      role: "assistant",
      content: params.result.firstPattern,
      provenance: {
        type: "mira_l1_result",
        value: params.result,
      },
    });

    await tx
      .update(miraV4Journeys)
      .set({ status: "brand_dna_draft", currentStep: "brand_dna" })
      .where(and(eq(miraV4Journeys.id, params.journeyId), eq(miraV4Journeys.userId, params.userId)));
  });
}

export async function createMiraV4Journey(userId: number) {
  const db = await requireDb();
  const [created] = await db
    .insert(miraV4Journeys)
    .values({ userId, status: "intake", currentStep: "quick_context" })
    .$returningId();
  return { journeyId: created.id };
}

export async function listMiraV4Journeys(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(miraV4Journeys)
    .where(and(eq(miraV4Journeys.userId, userId), ne(miraV4Journeys.status, "deleted")))
    .orderBy(desc(miraV4Journeys.updatedAt));
}

export async function getOwnedMiraV4Journey(userId: number, journeyId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(miraV4Journeys)
    .where(
      and(
        eq(miraV4Journeys.id, journeyId),
        eq(miraV4Journeys.userId, userId),
        ne(miraV4Journeys.status, "deleted"),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function saveMiraV4QuickContext(
  userId: number,
  journeyId: number,
  input: {
    building: string;
    currentPosition: string;
    needMost: string;
    firstCreation: string;
  },
) {
  const db = await requireDb();
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;

  await db
    .update(miraV4Journeys)
    .set({ ...input, status: "intake", currentStep: "birth_details" })
    .where(and(eq(miraV4Journeys.id, journeyId), eq(miraV4Journeys.userId, userId)));
  return getOwnedMiraV4Journey(userId, journeyId);
}

export async function saveMiraV4BirthDetails(
  userId: number,
  journeyId: number,
  input: {
    birthDate: string;
    birthTime: string | null;
    birthTimeUnknown: boolean;
    birthCity: string;
    birthCountry: string;
    birthTimezone: string;
  },
) {
  const db = await requireDb();
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;

  await db
    .update(miraV4Journeys)
    .set({
      birthDate: input.birthDate,
      birthTime: input.birthTimeUnknown ? null : input.birthTime,
      birthTimeUnknown: input.birthTimeUnknown ? 1 : 0,
      birthCity: input.birthCity,
      birthCountry: input.birthCountry,
      birthTimezone: input.birthTimezone,
      status: "recognition",
      currentStep: "recognition_ready",
    })
    .where(and(eq(miraV4Journeys.id, journeyId), eq(miraV4Journeys.userId, userId)));
  return getOwnedMiraV4Journey(userId, journeyId);
}

export async function getMiraV4RecognitionState(userId: number, journeyId: number) {
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;
  const messages = await loadMiraV4Messages(userId, journeyId, "recognition");
  return { journey, messages };
}

export async function startMiraV4Recognition(userId: number, journeyId: number) {
  const db = await requireDb();
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;
  if (journey.currentStep === "recognition") return getMiraV4RecognitionState(userId, journeyId);

  await db.transaction(async tx => {
    const updateResult = await tx
      .update(miraV4Journeys)
      .set({ status: "recognition", currentStep: "recognition" })
      .where(
        and(
          eq(miraV4Journeys.id, journeyId),
          eq(miraV4Journeys.userId, userId),
          eq(miraV4Journeys.currentStep, "recognition_ready"),
          eq(miraV4Journeys.turnCount, 0),
        ),
      );
    const affectedRows = (updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affectedRows !== 1) return;
    await tx.insert(miraV4Messages).values({
      journeyId,
      userId,
      ordinal: 1,
      role: "assistant",
      phase: "recognition",
      content: FIRST_RECOGNITION_QUESTION,
      provenance: { type: "v4_opening_prompt", model: null },
    });
  });
  return getMiraV4RecognitionState(userId, journeyId);
}

export async function appendMiraV4RecognitionTurn(params: {
  userId: number;
  journeyId: number;
  expectedTurnCount: number;
  answer: string;
  assistantQuestion?: string;
  assistantProvenance?: Record<string, unknown>;
}) {
  const db = await requireDb();
  const nextTurnCount = params.expectedTurnCount + 1;
  const userOrdinal = params.expectedTurnCount * 2 + 2;
  const recognitionComplete = nextTurnCount >= 2;

  return db.transaction(async tx => {
    const updateResult = await tx
      .update(miraV4Journeys)
      .set({
        turnCount: nextTurnCount,
        status: recognitionComplete ? "creative_discovery" : "recognition",
        currentStep: recognitionComplete ? "creative_discovery" : "recognition",
      })
      .where(
        and(
          eq(miraV4Journeys.id, params.journeyId),
          eq(miraV4Journeys.userId, params.userId),
          eq(miraV4Journeys.status, "recognition"),
          eq(miraV4Journeys.currentStep, "recognition"),
          eq(miraV4Journeys.turnCount, params.expectedTurnCount),
        ),
      );
    const affectedRows = (updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affectedRows !== 1) return { saved: false as const, recognitionComplete: false };

    await tx.insert(miraV4Messages).values({
      journeyId: params.journeyId,
      userId: params.userId,
      ordinal: userOrdinal,
      role: "user",
      phase: "recognition",
      content: params.answer,
      provenance: { type: "v4_user_recognition", turn: nextTurnCount },
    });

    if (recognitionComplete) {
      await tx.insert(miraV4Messages).values({
        journeyId: params.journeyId,
        userId: params.userId,
        ordinal: userOrdinal + 1,
        role: "assistant",
        phase: "creative_discovery",
        content: FIRST_CREATIVE_DISCOVERY_QUESTION,
        provenance: { type: "v4_creative_opening_prompt", model: null },
      });
    } else if (params.assistantQuestion) {
      await tx.insert(miraV4Messages).values({
        journeyId: params.journeyId,
        userId: params.userId,
        ordinal: userOrdinal + 1,
        role: "assistant",
        phase: "recognition",
        content: params.assistantQuestion,
        provenance: params.assistantProvenance ?? null,
      });
    }

    return { saved: true as const, recognitionComplete, turnCount: nextTurnCount };
  });
}

export async function saveMiraV4CreativeBrief(
  userId: number,
  journeyId: number,
  creativeInputs: {
    warmth: number;
    structure: number;
    expression: number;
    texture: string;
    colorAttraction: string;
    typography: string;
    imageryWorld: string;
  },
) {
  const db = await requireDb();
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey || journey.currentStep !== "creative_brief" || journey.turnCount !== 2 || journey.creativeTurnCount !== 5) return undefined;

  const updated = await db
    .update(miraV4Journeys)
    .set({ creativeInputs, currentStep: "inspiration" })
    .where(and(eq(miraV4Journeys.id, journeyId), eq(miraV4Journeys.userId, userId), eq(miraV4Journeys.currentStep, "creative_brief"), eq(miraV4Journeys.creativeTurnCount, 5)));
  const affectedRows = (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
  return affectedRows === 1 ? getOwnedMiraV4Journey(userId, journeyId) : undefined;
}

export async function getMiraV4CreativeState(userId: number, journeyId: number) {
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;
  const messages = await loadMiraV4Messages(userId, journeyId, "creative_discovery");
  return { journey, messages };
}

export async function appendMiraV4CreativeTurn(params: {
  userId: number;
  journeyId: number;
  expectedTurnCount: number;
  answer: string;
  assistantQuestion?: string;
  assistantProvenance?: Record<string, unknown>;
}) {
  const db = await requireDb();
  const journey = await getOwnedMiraV4Journey(params.userId, params.journeyId);
  if (!journey) return { saved: false as const, creativeComplete: false };
  const nextTurnCount = params.expectedTurnCount + 1;
  const creativeComplete = nextTurnCount >= 5;
  const userOrdinal = journey.turnCount * 2 + params.expectedTurnCount * 2 + 2;

  return db.transaction(async tx => {
    const updated = await tx
      .update(miraV4Journeys)
      .set({ creativeTurnCount: nextTurnCount, currentStep: creativeComplete ? "creative_brief" : "creative_discovery" })
      .where(and(
        eq(miraV4Journeys.id, params.journeyId),
        eq(miraV4Journeys.userId, params.userId),
        eq(miraV4Journeys.currentStep, "creative_discovery"),
        eq(miraV4Journeys.creativeTurnCount, params.expectedTurnCount),
      ));
    const affectedRows = (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affectedRows !== 1) return { saved: false as const, creativeComplete: false };
    await tx.insert(miraV4Messages).values({ journeyId: params.journeyId, userId: params.userId, ordinal: userOrdinal, phase: "creative_discovery", role: "user", content: params.answer, provenance: { type: "v4_user_creative_discovery", turn: nextTurnCount } });
    if (!creativeComplete && params.assistantQuestion) {
      await tx.insert(miraV4Messages).values({ journeyId: params.journeyId, userId: params.userId, ordinal: userOrdinal + 1, phase: "creative_discovery", role: "assistant", content: params.assistantQuestion, provenance: params.assistantProvenance ?? null });
    }
    return { saved: true as const, creativeComplete, turnCount: nextTurnCount };
  });
}

export async function saveMiraV4InspirationAsset(params: {
  userId: number;
  journeyId: number;
  assetId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
}) {
  const db = await requireDb();
  const updated = await db
    .update(miraV4Journeys)
    .set({ inspirationAssetId: params.assetId, inspirationStorageKey: params.storageKey, inspirationOriginalName: params.originalName, inspirationMimeType: params.mimeType, inspirationByteSize: params.byteSize })
    .where(and(eq(miraV4Journeys.id, params.journeyId), eq(miraV4Journeys.userId, params.userId), eq(miraV4Journeys.currentStep, "inspiration"), isNull(miraV4Journeys.inspirationAssetId)));
  return (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows === 1;
}

export async function completeMiraV4Inspiration(userId: number, journeyId: number, explanation: string | null) {
  const db = await requireDb();
  const updated = await db
    .update(miraV4Journeys)
    .set({ inspirationExplanation: explanation, currentStep: "pre_generation_mirror" })
    .where(and(eq(miraV4Journeys.id, journeyId), eq(miraV4Journeys.userId, userId), eq(miraV4Journeys.currentStep, "inspiration")));
  const affectedRows = (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
  return affectedRows === 1 ? getOwnedMiraV4Journey(userId, journeyId) : undefined;
}

export async function getMiraV4CreativeDnaRecord(userId: number, journeyId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(miraV4CreativeDna)
    .where(and(eq(miraV4CreativeDna.userId, userId), eq(miraV4CreativeDna.journeyId, journeyId)))
    .limit(1);
  return rows[0];
}

export async function getMiraV4CreativeDnaSource(userId: number, journeyId: number) {
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;
  const messages = await loadMiraV4Messages(userId, journeyId);
  return { journey, messages };
}

export async function claimMiraV4CreativeDna(params: {
  userId: number;
  journeyId: number;
  sourceFingerprint: string;
}) {
  const db = await requireDb();
  const existing = await getMiraV4CreativeDnaRecord(params.userId, params.journeyId);
  if (existing?.status === "complete" || existing?.status === "in_progress") {
    return { claimed: false as const, record: existing };
  }

  if (existing?.status === "retryable_error") {
    const updated = await db
      .update(miraV4CreativeDna)
      .set({
        status: "in_progress",
        creativeDnaJson: null,
        sourceFingerprint: params.sourceFingerprint,
        schemaVersion: MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
        promptVersion: MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
        model: null,
        errorCode: null,
      })
      .where(and(
        eq(miraV4CreativeDna.id, existing.id),
        eq(miraV4CreativeDna.userId, params.userId),
        eq(miraV4CreativeDna.status, "retryable_error"),
      ));
    const affectedRows = (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    const record = await getMiraV4CreativeDnaRecord(params.userId, params.journeyId);
    return { claimed: affectedRows === 1, record };
  }

  try {
    await db.insert(miraV4CreativeDna).values({
      journeyId: params.journeyId,
      userId: params.userId,
      schemaVersion: MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
      promptVersion: MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
      status: "in_progress",
      sourceFingerprint: params.sourceFingerprint,
    });
    const record = await getMiraV4CreativeDnaRecord(params.userId, params.journeyId);
    return { claimed: true as const, record };
  } catch (error) {
    const record = await getMiraV4CreativeDnaRecord(params.userId, params.journeyId);
    if (record) return { claimed: false as const, record };
    throw error;
  }
}

export async function completeMiraV4CreativeDna(params: {
  userId: number;
  journeyId: number;
  creativeDna: MiraV4CreativeDna;
  model: string;
}) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const dnaUpdated = await tx
      .update(miraV4CreativeDna)
      .set({ status: "complete", creativeDnaJson: params.creativeDna, model: params.model, errorCode: null })
      .where(and(
        eq(miraV4CreativeDna.journeyId, params.journeyId),
        eq(miraV4CreativeDna.userId, params.userId),
        eq(miraV4CreativeDna.status, "in_progress"),
      ));
    const dnaAffected = (dnaUpdated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (dnaAffected !== 1) throw new Error("Creative DNA claim is no longer active");

    const journeyUpdated = await tx
      .update(miraV4Journeys)
      .set({ status: "brand_dna_draft", currentStep: "visual_discovery" })
      .where(and(
        eq(miraV4Journeys.id, params.journeyId),
        eq(miraV4Journeys.userId, params.userId),
        eq(miraV4Journeys.currentStep, "pre_generation_mirror"),
        eq(miraV4Journeys.turnCount, 2),
        eq(miraV4Journeys.creativeTurnCount, 5),
      ));
    const journeyAffected = (journeyUpdated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (journeyAffected !== 1) throw new Error("Stage 4 journey checkpoint could not be completed");
  });
  return getMiraV4CreativeDnaRecord(params.userId, params.journeyId);
}

export async function failMiraV4CreativeDna(userId: number, journeyId: number, errorCode: string) {
  const db = await requireDb();
  await db
    .update(miraV4CreativeDna)
    .set({ status: "retryable_error", creativeDnaJson: null, model: null, errorCode })
    .where(and(
      eq(miraV4CreativeDna.userId, userId),
      eq(miraV4CreativeDna.journeyId, journeyId),
      eq(miraV4CreativeDna.status, "in_progress"),
    ));
}

export type MiraV4VisualStage = "initial" | "refined" | "moodboard";

export type MiraV4StoredVisualReference = {
  id: string;
  url?: string;
  direction: string;
  prompt: string;
  status?: "pending" | "generating" | "complete" | "failed";
  errorCode?: string | null;
};

export type MiraV4VisualSelection = {
  referenceIds: string[];
  reasons: string[];
  note?: string | null;
};

export type MiraV4VisualRefinement = {
  preserve: string;
  avoid: string;
  note: string | null;
};

export async function getMiraV4VisualSet(userId: number, journeyId: number, stage: MiraV4VisualStage) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(miraV4VisualSets)
    .where(and(
      eq(miraV4VisualSets.userId, userId),
      eq(miraV4VisualSets.journeyId, journeyId),
      eq(miraV4VisualSets.stage, stage),
    ))
    .limit(1);
  return rows[0];
}

export async function getMiraV4MoodboardState(userId: number, journeyId: number) {
  const journey = await getOwnedMiraV4Journey(userId, journeyId);
  if (!journey) return undefined;
  const [creativeDna, initial, refined, moodboard] = await Promise.all([
    getMiraV4CreativeDnaRecord(userId, journeyId),
    getMiraV4VisualSet(userId, journeyId, "initial"),
    getMiraV4VisualSet(userId, journeyId, "refined"),
    getMiraV4VisualSet(userId, journeyId, "moodboard"),
  ]);
  return { journey, creativeDna, initial, refined, moodboard };
}

export async function claimMiraV4VisualSet(params: {
  userId: number;
  journeyId: number;
  stage: MiraV4VisualStage;
  sourceFingerprint: string;
  promptVersion: string;
  campaignPlan: Record<string, unknown>;
  selection?: MiraV4VisualSelection | null;
  refinement?: MiraV4VisualRefinement | null;
}) {
  const db = await requireDb();
  const existing = await getMiraV4VisualSet(params.userId, params.journeyId, params.stage);
  if (existing?.status === "in_progress") {
    return { claimed: false as const, record: existing };
  }

  const values = {
    status: "in_progress" as const,
    sourceFingerprint: params.sourceFingerprint,
    promptVersion: params.promptVersion,
    campaignPlanJson: params.campaignPlan,
    selectionJson: params.selection ?? null,
    refinementJson: params.refinement ?? null,
    referencesJson: null,
    finalMoodboardUrl: null,
    errorCode: null,
  };

  if (existing?.status === "retryable_error" || (existing?.status === "complete" && existing.promptVersion !== params.promptVersion)) {
    const expectedStatus = existing.status;
    const updated = await db
      .update(miraV4VisualSets)
      .set(values)
      .where(and(
        eq(miraV4VisualSets.id, existing.id),
        eq(miraV4VisualSets.userId, params.userId),
        eq(miraV4VisualSets.status, expectedStatus),
      ));
    const affectedRows = (updated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    return { claimed: affectedRows === 1, record: await getMiraV4VisualSet(params.userId, params.journeyId, params.stage) };
  }

  try {
    await db.insert(miraV4VisualSets).values({
      journeyId: params.journeyId,
      userId: params.userId,
      stage: params.stage,
      ...values,
    });
    return { claimed: true as const, record: await getMiraV4VisualSet(params.userId, params.journeyId, params.stage) };
  } catch (error) {
    const record = await getMiraV4VisualSet(params.userId, params.journeyId, params.stage);
    if (record) return { claimed: false as const, record };
    throw error;
  }
}

export async function completeMiraV4VisualSet(params: {
  userId: number;
  journeyId: number;
  stage: MiraV4VisualStage;
  references?: MiraV4StoredVisualReference[];
  finalMoodboardUrl?: string;
}) {
  const db = await requireDb();
  const transition = params.stage === "initial"
    ? { currentStep: "visual_refinement" as const }
    : params.stage === "refined"
      ? { currentStep: "visual_refinement" as const }
      : { currentStep: "moodboard" as const, status: "complete" as const };

  await db.transaction(async tx => {
    const visualUpdated = await tx
      .update(miraV4VisualSets)
      .set({
        status: "complete",
        referencesJson: params.references ?? null,
        finalMoodboardUrl: params.finalMoodboardUrl ?? null,
        errorCode: null,
      })
      .where(and(
        eq(miraV4VisualSets.userId, params.userId),
        eq(miraV4VisualSets.journeyId, params.journeyId),
        eq(miraV4VisualSets.stage, params.stage),
        eq(miraV4VisualSets.status, "in_progress"),
      ));
    const visualAffected = (visualUpdated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (visualAffected !== 1) throw new Error("Visual generation claim is no longer active");

    const journeyUpdated = await tx
      .update(miraV4Journeys)
      .set(transition)
      .where(and(
        eq(miraV4Journeys.userId, params.userId),
        eq(miraV4Journeys.id, params.journeyId),
      ));
    const journeyAffected = (journeyUpdated as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (journeyAffected !== 1) throw new Error("Moodboard journey checkpoint could not be completed");
  });
  return getMiraV4VisualSet(params.userId, params.journeyId, params.stage);
}

export async function failMiraV4VisualSet(params: {
  userId: number;
  journeyId: number;
  stage: MiraV4VisualStage;
  errorCode: string;
}) {
  const db = await requireDb();
  await db
    .update(miraV4VisualSets)
    .set({ status: "retryable_error", errorCode: params.errorCode })
    .where(and(
      eq(miraV4VisualSets.userId, params.userId),
      eq(miraV4VisualSets.journeyId, params.journeyId),
      eq(miraV4VisualSets.stage, params.stage),
      eq(miraV4VisualSets.status, "in_progress"),
    ));
}

export async function saveMiraV4CreateVisualState(params: {
  userId: number;
  journeyId: number;
  sourceFingerprint: string;
  promptVersion: string;
  campaignPlan: Record<string, unknown>;
  references: MiraV4StoredVisualReference[];
  status: "in_progress" | "complete" | "retryable_error";
  errorCode?: string | null;
}) {
  const db = await requireDb();
  const existing = await getMiraV4VisualSet(params.userId, params.journeyId, "moodboard");
  const values = {
    status: params.status,
    sourceFingerprint: params.sourceFingerprint,
    promptVersion: params.promptVersion,
    campaignPlanJson: params.campaignPlan,
    referencesJson: params.references,
    finalMoodboardUrl: params.references.find(reference => reference.status === "complete")?.url ?? null,
    errorCode: params.errorCode ?? null,
  };
  if (existing) {
    await db.update(miraV4VisualSets).set(values).where(and(
      eq(miraV4VisualSets.id, existing.id),
      eq(miraV4VisualSets.userId, params.userId),
      eq(miraV4VisualSets.journeyId, params.journeyId),
    ));
  } else {
    await db.insert(miraV4VisualSets).values({
      userId: params.userId,
      journeyId: params.journeyId,
      stage: "moodboard",
      ...values,
    });
  }
  return getMiraV4VisualSet(params.userId, params.journeyId, "moodboard");
}
