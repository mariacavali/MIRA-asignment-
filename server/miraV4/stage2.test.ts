import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
const storageMocks = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn(), storagePut: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  claimMiraV4CreativeDna: vi.fn(),
  completeMiraV4CreativeDna: vi.fn(),
  appendMiraV4CreativeTurn: vi.fn(),
  appendMiraV4RecognitionTurn: vi.fn(),
  completeMiraV4Inspiration: vi.fn(),
  createMiraV4Journey: vi.fn(),
  failMiraV4CreativeDna: vi.fn(),
  getMiraV4CreativeState: vi.fn(),
  getMiraV4CreativeDnaRecord: vi.fn(),
  getMiraV4CreativeDnaSource: vi.fn(),
  getMiraV4RecognitionState: vi.fn(),
  getOwnedMiraV4Journey: vi.fn(),
  listMiraV4Journeys: vi.fn(),
  saveMiraV4BirthDetails: vi.fn(),
  saveMiraV4CreativeBrief: vi.fn(),
  saveMiraV4InspirationAsset: vi.fn(),
  saveMiraV4QuickContext: vi.fn(),
  startMiraV4Recognition: vi.fn(),
}));

vi.mock("../_core/llm", () => llmMocks);
vi.mock("../storage", () => storageMocks);
vi.mock("./db", () => dbMocks);

import {
  buildRecognitionAssistantMessage,
  FIRST_CREATIVE_DISCOVERY_QUESTION,
  FIRST_RECOGNITION_QUESTION,
  shouldGenerateCreativeQuestion,
  shouldGenerateRecognitionQuestion,
} from "./reflection";
import { miraV4Router } from "./router";

function caller(userId = 7) {
  return miraV4Router.createCaller({ user: { id: userId }, req: {}, res: {} } as never);
}

function recognitionState(turnCount = 0) {
  return {
    journey: {
      id: 41,
      userId: 7,
      status: "recognition",
      currentStep: "recognition",
      turnCount,
      creativeTurnCount: 0,
      creativeInputs: null,
      building: "An editorial personal-brand studio",
      currentPosition: "Ready to become visible",
      needMost: "Coherence",
      firstCreation: "A private Brand Book",
    },
    messages: [{ id: 1, role: "assistant", content: FIRST_RECOGNITION_QUESTION }],
  };
}

function creativeState(creativeTurnCount = 0) {
  return {
    journey: {
      ...recognitionState(2).journey,
      status: "creative_discovery",
      currentStep: "creative_discovery",
      creativeTurnCount,
      creativeInputs: { warmth: 35, structure: 70, expression: 55, texture: "Tactile", colorAttraction: "Earthy", typography: "Editorial serif", imageryWorld: "Atmospheric spaces" },
    },
    messages: [{ id: 5, role: "assistant", content: FIRST_CREATIVE_DISCOVERY_QUESTION }],
  };
}

describe("Mira V4 Stage 3 input journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.appendMiraV4RecognitionTurn.mockResolvedValue({ saved: true, recognitionComplete: false, turnCount: 1 });
    dbMocks.appendMiraV4CreativeTurn.mockResolvedValue({ saved: true, creativeComplete: false, turnCount: 1 });
    llmMocks.invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify({ question: "You are drawn to quiet spaces with real texture. What emotional atmosphere should someone feel before they understand every word?" }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    });
  });

  it("seeds the opening Recognition question locally without a model call", async () => {
    dbMocks.getOwnedMiraV4Journey.mockResolvedValue({ id: 41, userId: 7, status: "recognition", currentStep: "recognition_ready" });
    dbMocks.startMiraV4Recognition.mockResolvedValue(recognitionState());
    await expect(caller().startRecognition({ journeyId: 41 })).resolves.toMatchObject({ messages: [{ content: FIRST_RECOGNITION_QUESTION }] });
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("uses one adaptive call after Recognition answer one", async () => {
    dbMocks.getMiraV4RecognitionState.mockResolvedValue(recognitionState(0));
    await caller().submitRecognitionAnswer({ journeyId: 41, answer: "I want people to trust their own perspective." });
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
    const recognitionTurnPayload = dbMocks.appendMiraV4RecognitionTurn.mock.calls[0]?.[0];
    expect(recognitionTurnPayload).toMatchObject({
      expectedTurnCount: 0,
      answer: "I want people to trust their own perspective.",
      assistantProvenance: expect.objectContaining({
        type: "v4_base_recognition_question",
        movement: "brand_wear",
        fallback: false,
      }),
    });
    expect(String(recognitionTurnPayload?.assistantQuestion ?? "").toLowerCase()).toContain("brand wear");
  });

  it("ends Recognition after answer two without a third question or model call", async () => {
    dbMocks.getMiraV4RecognitionState.mockResolvedValue(recognitionState(1));
    dbMocks.appendMiraV4RecognitionTurn.mockResolvedValue({ saved: true, recognitionComplete: true, turnCount: 2 });
    await caller().submitRecognitionAnswer({ journeyId: 41, answer: "The promise is permission to be unmistakably themselves." });
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV4RecognitionTurn).toHaveBeenCalledWith(expect.objectContaining({ expectedTurnCount: 1, assistantQuestion: undefined }));
  });

  it("keeps the Recognition bridge deterministic and the combined call ceiling at five", () => {
    expect(buildRecognitionAssistantMessage(1, "What would your brand wear?")).toContain("creative premise");
    expect(Array.from({ length: 2 }, (_, index) => index + 1).filter(shouldGenerateRecognitionQuestion)).toHaveLength(1);
    expect(Array.from({ length: 5 }, (_, index) => index + 1).filter(shouldGenerateCreativeQuestion)).toHaveLength(4);
  });

  it("uses one adaptive call for each eligible Creative Discovery answer", async () => {
    dbMocks.getMiraV4CreativeState.mockResolvedValue(creativeState(0));
    await caller().submitCreativeAnswer({ journeyId: 41, answer: "I am drawn to quiet editorial spaces with tactile detail." });
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV4CreativeTurn).toHaveBeenCalledWith(expect.objectContaining({ expectedTurnCount: 0, assistantQuestion: "How would you want people to feel when they arrived?" }));

    dbMocks.getMiraV4CreativeState.mockResolvedValue(creativeState(3));
    await caller().submitCreativeAnswer({ journeyId: 41, answer: "It needs to reveal the part of me that still feels too hidden." });
    expect(llmMocks.invokeLLM).toHaveBeenCalledTimes(1);
    const systemPrompt = String(llmMocks.invokeLLM.mock.calls[0]?.[0]?.messages?.[0]?.content);
    expect(systemPrompt).toContain("Do not ask a compound or multi-part question");
    expect(systemPrompt).toContain("fills the stated evidence gap for the visual brand world");
    expect(systemPrompt).toContain("Do not mention Creative DNA, Campaign Plan, Brand Book, mood boards, images, outputs, deliverables, or implementation stages");
    expect(dbMocks.appendMiraV4CreativeTurn).toHaveBeenLastCalledWith(expect.objectContaining({ expectedTurnCount: 3, assistantQuestion: expect.any(String) }));
  });

  it("uses one deterministic fallback when a live Creative Discovery response leaves scope", async () => {
    dbMocks.getMiraV4CreativeState.mockResolvedValue(creativeState(3));
    llmMocks.invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify({ question: "Which detail belongs in the Brand Book, and what image should accompany it?" }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    });

    await caller().submitCreativeAnswer({ journeyId: 41, answer: "I want a private, tactile atmosphere." });

    expect(llmMocks.invokeLLM).toHaveBeenCalledTimes(1);
    const creativeTurnPayload = dbMocks.appendMiraV4CreativeTurn.mock.calls[0]?.[0];
    expect(creativeTurnPayload).toMatchObject({
      expectedTurnCount: 3,
      answer: "I want a private, tactile atmosphere.",
      assistantProvenance: expect.objectContaining({
        type: "v4_adaptive_creative_discovery",
        fallback: true,
        scopeGuard: true,
        movement: "distinctive_anchor",
      }),
    });
    expect(String(creativeTurnPayload?.assistantQuestion ?? "").toLowerCase()).toContain("yours");
    expect(String(creativeTurnPayload?.assistantQuestion ?? "").toLowerCase()).not.toContain("brand book");
  });

  it("ends Creative Discovery after answer five without a sixth question or model call", async () => {
    dbMocks.getMiraV4CreativeState.mockResolvedValue(creativeState(4));
    dbMocks.appendMiraV4CreativeTurn.mockResolvedValue({ saved: true, creativeComplete: true, turnCount: 5 });
    await caller().submitCreativeAnswer({ journeyId: 41, answer: "It should feel quietly inevitable." });
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV4CreativeTurn).toHaveBeenCalledWith(expect.objectContaining({ expectedTurnCount: 4, assistantQuestion: undefined }));
  });

  it("stores one valid private inspiration image without analysis or generation", async () => {
    dbMocks.getOwnedMiraV4Journey.mockResolvedValue({ id: 41, userId: 7, currentStep: "inspiration", inspirationAssetId: null });
    dbMocks.saveMiraV4InspirationAsset.mockResolvedValue(true);
    storageMocks.storagePut.mockResolvedValue({ key: "mira-v4/7/41/inspiration/example.png", url: "/manus-storage/example.png" });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    await caller().uploadInspirationImage({ journeyId: 41, originalName: "reference.png", mimeType: "image/png", base64: png.toString("base64") });
    expect(storageMocks.storagePut).toHaveBeenCalledTimes(1);
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("keeps the V4 journey interface free of direct image generation and PDF rendering", () => {
    const journeySource = readFileSync(new URL("../../client/src/pages/MiraV4Journey.tsx", import.meta.url), "utf8");
    expect(journeySource).not.toContain("generateImage");
    expect(journeySource).not.toContain("renderPdf");
    expect(journeySource).toContain("five bounded visual directions");
    expect(journeySource).toContain("one final Moodboard of five connected images");
  });
});
