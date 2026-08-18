import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  appendMiraV3ReflectionTurn: vi.fn(),
  confirmMiraV3MirrorRevision: vi.fn(),
  createMiraV3Journey: vi.fn(),
  createMiraV3MediaAsset: vi.fn(),
  createMiraV3MirrorDraft: vi.fn(),
  createMiraV3MirrorEdit: vi.fn(),
  getLatestMiraV3ModuleOutput: vi.fn(),
  getMiraV3ConsentState: vi.fn(),
  getMiraV3JourneyState: vi.fn(),
  getMiraV3MediaAssetForAnalysis: vi.fn(),
  getOwnedMiraV3Journey: vi.fn(),
  listMiraV3Journeys: vi.fn(),
  listMiraV3MediaAssets: vi.fn(),
  recordMiraV3Consent: vi.fn(),
  removeMiraV3MediaAsset: vi.fn(),
  resumeMiraV3ReflectionAfterBirthInterlude: vi.fn(),
  saveMiraV3MediaAnalysis: vi.fn(),
  saveMiraV3ModuleOutput: vi.fn(),
  saveMiraV3RenderArtifact: vi.fn(),
  softDeleteMiraV3Journey: vi.fn(),
}));

const reflectionMocks = vi.hoisted(() => ({ generateAdaptiveQuestion: vi.fn(), rephraseQuestionForClarity: vi.fn() }));
const recognitionMocks = vi.hoisted(() => ({ generateRecognitionResult: vi.fn() }));
const bundleMocks = vi.hoisted(() => ({ generateReflectionBundle: vi.fn() }));

vi.mock("./db", () => dbMocks);
vi.mock("./reflection", async importOriginal => {
  const actual = await importOriginal<typeof import("./reflection")>();
  return {
    ...actual,
    generateAdaptiveQuestion: reflectionMocks.generateAdaptiveQuestion,
    rephraseQuestionForClarity: reflectionMocks.rephraseQuestionForClarity,
  };
});
vi.mock("./recognition", async importOriginal => {
  const actual = await importOriginal<typeof import("./recognition")>();
  return { ...actual, generateRecognitionResult: recognitionMocks.generateRecognitionResult };
});
vi.mock("./bundle", async importOriginal => {
  const actual = await importOriginal<typeof import("./bundle")>();
  return { ...actual, generateReflectionBundle: bundleMocks.generateReflectionBundle };
});

import { miraV3Router } from "./router";

const assetId = "550e8400-e29b-41d4-a716-446655440000";

const completedImageAnalysis = {
  summary: "Muted editorial references with restrained negative space.",
  colorObservations: [],
  compositionObservations: [],
  materialObservations: [],
  silhouetteObservations: [],
  patternRhythmObservations: [],
  motifs: [],
  atmosphereObservations: [],
  crossImageConsistencies: [],
  translationIdeas: [{ cue: "Muted editorial restraint", application: "Use warm neutrals and generous negative space." }],
  limits: [],
};

const recognitionResult = {
  throughline: "Precise work becomes recognizable when restraint is intentional rather than protective.",
  supportedPatterns: Array.from({ length: 3 }, (_, index) => ({
    id: `P${index + 1}`,
    statement: `Supported pattern ${index + 1}`,
    support: [
      { source: "conversation" as const, reference: `turn:${index + 1}` },
      { source: "conversation" as const, reference: `turn:${index + 2}` },
    ],
    confidence: "supporting" as const,
  })),
  tensionsToResolve: [],
  documentGuidance: {
    brandSoul: [{ text: "Let precision lead.", patternIds: ["P1"] }],
    brandExpression: [{ text: "Make restraint intentional.", patternIds: ["P2"] }],
    shootMoodBoard: [{ text: "Use editorial asymmetry.", patternIds: ["P3"] }],
  },
  limits: [],
  generation: { model: "gpt-5-mini", fallback: false, promptTokens: 10, completionTokens: 20, totalTokens: 30 },
};

const generatedBundle = {
  mirror: {
    whatHasAlwaysBeenTrue: "Careful work can still be direct.",
    thread: "Precision protects depth.",
    whoThisIsFor: "People who want recognition rather than performance.",
    returningSentence: "Make precision visible without making it perform.",
    recognition: "Restraint becomes authority when it is chosen rather than automatic.",
  },
  essence: {
    coreTruth: "Clarity preserves depth.", naturalGift: "Naming the hidden thread.",
    feltExperience: "Quiet recognition.", peoplePortrait: "Thoughtful founders.",
    direction: "Precision leads; performance follows.", voiceQualities: ["quiet", "exact", "human"],
    currentChapter: "Choosing precision over performance.",
    strengths: ["Pattern recognition", "Clear language", "Quiet discernment"],
    zoneOfGenius: "Making the invisible precise without reducing its depth.",
    shadows: ["Over-refining before sharing", "Mistaking quiet for hesitation"],
    decisionCompass: "Choose what preserves depth and returns agency.",
    naturalContribution: "Language that helps thoughtful people recognize what they already know.",
    growthEdge: "Let the work be seen before every edge is resolved.",
  },
  visualDirection: {
    atmosphere: "Editorial quiet.", colorIntentions: ["warm ivory", "soft black", "muted brass"],
    materialCues: ["paper", "stone", "linen"], compositionPrinciples: ["negative space", "asymmetry", "clear hierarchy"],
    photographicDirection: "Natural light and unperformed expression.",
  },
  evidence: Array.from({ length: 8 }, (_, index) => ({ turn: index + 1, quote: `Answer ${index + 1}`, supports: ["mirror"] })),
  moduleEvidence: [],
  generation: { model: "gpt-5-mini", fallback: false, promptTokens: 10, completionTokens: 20, totalTokens: 30 },
};

function caller() {
  return miraV3Router.createCaller({ user: { id: 7 }, req: {}, res: {} } as never);
}

function reflectionState(turnCount: number) {
  return {
    journey: {
      id: 11,
      status: "reflection",
      currentStep: "conversation",
      turnCount,
      activeSessionId: "session-11",
    },
    messages: [
      { role: "assistant", content: "What change are you here to create?" },
      { role: "user", content: "I want careful work to feel more human and less performative." },
    ],
    revisions: [],
  };
}

describe("Mira V3 adaptive reflection evidence routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.listMiraV3MediaAssets.mockResolvedValue([
      { id: assetId, status: "analyzed", analysis: completedImageAnalysis },
    ]);
    dbMocks.getLatestMiraV3ModuleOutput.mockImplementation(async (_userId, _journeyId, moduleType) => {
      if (moduleType === "birth_data") {
        return {
          status: "complete",
          normalizedResult: {
            output: {
              available: true,
              recognitionLayer: {
                confidence: "tentative",
                contextSummary: "Measured expression may coexist with a wish for stronger visibility.",
                adaptiveQuestionLens: "Explore whether restraint protects precision or keeps an important truth hidden.",
              },
              statusMessage: "Optional birth context saved.",
            },
          },
        };
      }
      if (moduleType === "image_reference_analysis") {
        return { status: "complete", normalizedResult: { output: { evidence: [] } } };
      }
      return null;
    });
    dbMocks.appendMiraV3ReflectionTurn.mockResolvedValue({ saved: true, turnCount: 4, currentStep: "conversation" });
    reflectionMocks.generateAdaptiveQuestion.mockResolvedValue({
      question: "I’m noticing something interesting… where does careful restraint strengthen your authority, and where does it make your clearest conviction harder to see?",
      provenance: { type: "adaptive_reflection", mode: "multi_signal_probe_opportunity" },
    });
    reflectionMocks.rephraseQuestionForClarity.mockResolvedValue({
      question: "What part of this feels hardest to say plainly?",
      fallback: false,
    });
    recognitionMocks.generateRecognitionResult.mockResolvedValue(recognitionResult);
    bundleMocks.generateReflectionBundle.mockResolvedValue(generatedBundle);
    dbMocks.createMiraV3MirrorDraft.mockResolvedValue({ id: 31, status: "draft", bundle: generatedBundle });
  });

  it("loads only the private Recognition Layer at the boundary between the two conversations", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(3));

    await caller().submitReflectionTurn({ journeyId: 11, answer: "I often edit myself until the strongest idea feels too quiet." });

    expect(dbMocks.getLatestMiraV3ModuleOutput).toHaveBeenCalledWith(7, 11, "birth_data");
    expect(dbMocks.getLatestMiraV3ModuleOutput).not.toHaveBeenCalledWith(7, 11, "image_reference_analysis");
    expect(dbMocks.listMiraV3MediaAssets).not.toHaveBeenCalled();
    expect(reflectionMocks.generateAdaptiveQuestion).toHaveBeenCalledWith(expect.objectContaining({
      completedUserTurns: 4,
      signalContext: {
        birthRecognitionLayer: expect.objectContaining({ confidence: "tentative", contextSummary: expect.any(String) }),
        imageSignals: [],
      },
    }));
    expect(dbMocks.appendMiraV3ReflectionTurn).toHaveBeenCalledWith(expect.objectContaining({
      expectedTurnCount: 3,
      assistantQuestion: expect.stringContaining("I’m noticing something interesting…"),
    }));
  });

  it("continues the conversation after the first answer without re-entering birth intake or loading private context prematurely", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(0));
    dbMocks.appendMiraV3ReflectionTurn.mockResolvedValue({ saved: true, turnCount: 1, currentStep: "conversation" });

    await expect(caller().submitReflectionTurn({ journeyId: 11, answer: "I want the work to feel unmistakably mine." }))
      .resolves.toMatchObject({ saved: true, turnCount: 1, currentStep: "conversation" });

    expect(dbMocks.getLatestMiraV3ModuleOutput).not.toHaveBeenCalled();
    expect(dbMocks.listMiraV3MediaAssets).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV3ReflectionTurn).toHaveBeenCalledWith(expect.objectContaining({
      expectedTurnCount: 0,
      answer: "I want the work to feel unmistakably mine.",
    }));
  });

  it("rephrases the active question without saving a message or advancing the turn", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(3));

    await expect(caller().rephraseReflectionQuestion({ journeyId: 11 })).resolves.toEqual({
      question: "What part of this feels hardest to say plainly?",
      fallback: false,
    });

    expect(reflectionMocks.rephraseQuestionForClarity).toHaveBeenCalledWith("What change are you here to create?");
    expect(dbMocks.appendMiraV3ReflectionTurn).not.toHaveBeenCalled();
    expect(dbMocks.saveMiraV3ModuleOutput).not.toHaveBeenCalled();
  });

  it("intercepts an explicit typed incomprehension response without saving or advancing the turn", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(3));

    await expect(caller().submitReflectionTurn({ journeyId: 11, answer: "I don't understand the question." }))
      .resolves.toMatchObject({
        saved: false,
        rephrased: true,
        question: "What part of this feels hardest to say plainly?",
        turnCount: 3,
        currentStep: "conversation",
      });

    expect(reflectionMocks.rephraseQuestionForClarity).toHaveBeenCalledWith("What change are you here to create?");
    expect(reflectionMocks.generateAdaptiveQuestion).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV3ReflectionTurn).not.toHaveBeenCalled();
    expect(dbMocks.saveMiraV3ModuleOutput).not.toHaveBeenCalled();
  });

  it("does not treat a substantive answer that contains misunderstanding as a rephrase request", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(2));

    await caller().submitReflectionTurn({ journeyId: 11, answer: "I don't understand why my clients expect me to sound louder than I am." });

    expect(reflectionMocks.rephraseQuestionForClarity).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV3ReflectionTurn).toHaveBeenCalledWith(expect.objectContaining({
      expectedTurnCount: 2,
      answer: "I don't understand why my clients expect me to sound louder than I am.",
    }));
  });

  it("keeps the journey at seven answers when the eighth response is an incomprehension request", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(7));

    await expect(caller().submitReflectionTurn({ journeyId: 11, answer: "What do you mean?" }))
      .resolves.toMatchObject({
        saved: false,
        rephrased: true,
        turnCount: 7,
        currentStep: "conversation",
      });

    expect(reflectionMocks.rephraseQuestionForClarity).toHaveBeenCalledWith("What change are you here to create?");
    expect(reflectionMocks.generateAdaptiveQuestion).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV3ReflectionTurn).not.toHaveBeenCalled();
    expect(dbMocks.createMiraV3MirrorDraft).not.toHaveBeenCalled();
  });

  it("accepts the eighth answer without generating a ninth question or loading optional evidence", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(reflectionState(7));
    dbMocks.appendMiraV3ReflectionTurn.mockResolvedValue({ saved: true, turnCount: 8, currentStep: "mirror_ready" });

    await expect(caller().submitReflectionTurn({ journeyId: 11, answer: "I will state the decision plainly and let the work support it." }))
      .resolves.toMatchObject({ saved: true, turnCount: 8, currentStep: "mirror_ready" });

    expect(reflectionMocks.generateAdaptiveQuestion).not.toHaveBeenCalled();
    expect(dbMocks.getLatestMiraV3ModuleOutput).not.toHaveBeenCalled();
    expect(dbMocks.listMiraV3MediaAssets).not.toHaveBeenCalled();
    expect(dbMocks.appendMiraV3ReflectionTurn).toHaveBeenCalledWith(expect.objectContaining({
      expectedTurnCount: 7,
      assistantQuestion: undefined,
      assistantProvenance: undefined,
    }));
  });

  it("runs and caches one final Recognition comparison, then reuses it for the shared document bundle", async () => {
    const state = {
      journey: { id: 11, status: "reflection", currentStep: "mirror_ready", turnCount: 8, activeSessionId: "session-11" },
      messages: Array.from({ length: 8 }, (_, index) => ({ role: "user", content: `Answer ${index + 1}` })),
      revisions: [],
    };
    let recognitionModule: Record<string, unknown> | null = null;
    dbMocks.getMiraV3JourneyState.mockResolvedValue(state);
    dbMocks.getLatestMiraV3ModuleOutput.mockImplementation(async (_userId, _journeyId, moduleType) => {
      if (moduleType === "birth_data") {
        return {
          status: "complete",
          normalizedResult: { output: { available: true, recognitionLayer: {
            confidence: "tentative",
            contextSummary: "Measured expression may coexist with a wish for stronger visibility.",
            adaptiveQuestionLens: "Test whether restraint protects precision or hides a conviction already present in the conversation.",
          }, statusMessage: "Optional birth context saved." } },
        };
      }
      if (moduleType === "image_reference_analysis") return { status: "complete", normalizedResult: { output: { evidence: [] } } };
      if (moduleType === "recognition_gate") return recognitionModule;
      return null;
    });
    dbMocks.saveMiraV3ModuleOutput.mockImplementation(async params => {
      recognitionModule = {
        status: params.status,
        normalizedResult: { input: params.input, output: params.output, provenance: params.provenance },
      };
      return recognitionModule;
    });

    await caller().generateMirrorDraft({ journeyId: 11 });
    await caller().generateMirrorDraft({ journeyId: 11 });

    expect(recognitionMocks.generateRecognitionResult).toHaveBeenCalledTimes(1);
    expect(recognitionMocks.generateRecognitionResult).toHaveBeenCalledWith(expect.objectContaining({
      recognitionLayer: expect.objectContaining({ confidence: "tentative", contextSummary: expect.any(String) }),
      imageEvidence: [],
    }));
    expect(dbMocks.saveMiraV3ModuleOutput).toHaveBeenCalledTimes(1);
    const saved = dbMocks.saveMiraV3ModuleOutput.mock.calls[0][0];
    expect(saved).toMatchObject({ moduleType: "recognition_gate", status: "complete" });
    expect(saved.input).toEqual(expect.objectContaining({
      fingerprint: expect.any(String), conversationTurnCount: 8, privateRecognitionLayerAvailable: true, imageEvidenceCount: 0,
    }));
    expect(saved.input).not.toHaveProperty("recognitionLayer");
    expect(saved.provenance).toMatchObject({ privateContextStored: false, rawVendorResponseStored: false });
    expect(bundleMocks.generateReflectionBundle).toHaveBeenCalledTimes(2);
    expect(bundleMocks.generateReflectionBundle).toHaveBeenLastCalledWith(state.messages, [], recognitionResult);
  });
});
