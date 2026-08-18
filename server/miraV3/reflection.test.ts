import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "../_core/llm";
import {
  assessMultiSignalProbeOpportunity,
  generateAdaptiveQuestion,
  getReflectionFocus,
  isExplicitIncomprehensionResponse,
  shouldGenerateAdaptiveQuestion,
  shouldLoadMultiSignalContext,
} from "./reflection";

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

const mockedInvokeLLM = vi.mocked(invokeLLM);

describe("Mira V3 adaptive reflection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns a distinct focus to each adaptive turn", () => {
    const focuses = Array.from({ length: 7 }, (_, index) => getReflectionFocus(index + 1).focus);
    expect(new Set(focuses).size).toBe(7);
  });

  it("recognizes only bounded question-clarity requests as incomprehension", () => {
    expect(isExplicitIncomprehensionResponse("I don't understand the question.")).toBe(true);
    expect(isExplicitIncomprehensionResponse("What do you mean?")).toBe(true);
    expect(isExplicitIncomprehensionResponse("Could you please rephrase this prompt?")).toBe(true);
    expect(isExplicitIncomprehensionResponse("I don't understand why my clients expect me to sound louder than I am.")).toBe(false);
  });

  it("calls the model only for turns one through seven", () => {
    expect(Array.from({ length: 7 }, (_, index) => shouldGenerateAdaptiveQuestion(index + 1))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(shouldGenerateAdaptiveQuestion(8)).toBe(false);
    expect(shouldGenerateAdaptiveQuestion(9)).toBe(false);
  });

  it("allows the private Recognition Layer at exactly one boundary between the two conversations", () => {
    expect(Array.from({ length: 8 }, (_, index) => shouldLoadMultiSignalContext(index + 1))).toEqual([
      false, false, false, true, false, false, false, false,
    ]);
  });

  it("deterministically requires conversation plus at least one optional evidence class", () => {
    expect(assessMultiSignalProbeOpportunity({ completedUserTurns: 4 })).toMatchObject({
      eligible: false,
      evidenceClasses: 1,
    });
    expect(assessMultiSignalProbeOpportunity({
      completedUserTurns: 4,
      signalContext: {
        birthRecognitionLayer: { confidence: "tentative", contextSummary: "Structure may support clarity.", adaptiveQuestionLens: "Test structure against the user's repeated language." },
        imageSignals: [],
      },
    })).toMatchObject({
      eligible: true,
      evidenceClasses: 2,
      hasBirthEvidence: true,
      hasImageEvidence: false,
    });
    expect(assessMultiSignalProbeOpportunity({
      completedUserTurns: 5,
      signalContext: {
        birthRecognitionLayer: { confidence: "tentative", contextSummary: "Structure may support clarity.", adaptiveQuestionLens: "Test structure against the user's repeated language." },
        imageSignals: [{ sourceId: "image-1", quote: "restrained composition" }],
      },
    }).eligible).toBe(false);
  });

  it("uses the selected low-cost OpenAI model and structured question output", async () => {
    mockedInvokeLLM.mockResolvedValue({
      id: "test",
      created: 1,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify({ question: "What truth are you protecting by keeping your direction broad?" }) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 14, total_tokens: 54 },
    });

    const result = await generateAdaptiveQuestion({
      completedUserTurns: 2,
      messages: [{ role: "assistant", content: "What matters now?" }],
      newAnswer: "I keep my work broad because choosing feels exposing.",
    });

    expect(result.question).toContain("?");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    expect(mockedInvokeLLM.mock.calls[0]?.[0]).toMatchObject({ model: "gpt-5-mini" });
    expect(result.provenance.fallback).toBe(false);
  });

  it("keeps Conversation One exploratory and makes Conversation Two explicitly cross-pattern perceptive", async () => {
    mockedInvokeLLM.mockResolvedValue({
      id: "test",
      created: 1,
      model: "gpt-5-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: JSON.stringify({ question: "You keep returning to quiet precision and the wish to be more visible. Where do those two truths support each other rather than compete?" }) },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 70, completion_tokens: 24, total_tokens: 94 },
    });

    await generateAdaptiveQuestion({
      completedUserTurns: 2,
      messages: [{ role: "user", content: "I work best without performance." }],
      newAnswer: "I want people to feel clear rather than impressed.",
    });
    const conversationOnePrompt = String(mockedInvokeLLM.mock.calls[0]?.[0].messages[1]?.content);
    expect(conversationOnePrompt).toContain("This is Conversation One");
    expect(conversationOnePrompt).toContain("without drawing conclusions yet");

    mockedInvokeLLM.mockClear();
    await generateAdaptiveQuestion({
      completedUserTurns: 5,
      messages: [
        { role: "user", content: "I work best without performance." },
        { role: "user", content: "I want people to feel clear rather than impressed." },
      ],
      newAnswer: "I also know I need to become more visible.",
    });
    const conversationTwoPrompt = String(mockedInvokeLLM.mock.calls[0]?.[0].messages[1]?.content);
    expect(conversationTwoPrompt).toContain("This is Conversation Two");
    expect(conversationTwoPrompt).toContain("two or more recurring threads");
  });

  it("uses hidden optional evidence inside the same adaptive call without exposing its source", async () => {
    mockedInvokeLLM.mockResolvedValue({
      id: "test",
      created: 1,
      model: "gpt-5-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: JSON.stringify({ question: "I’m noticing something interesting… where does your preference for quiet precision conflict with the visibility your next direction seems to require?" }) },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 80, completion_tokens: 24, total_tokens: 104 },
    });

    const result = await generateAdaptiveQuestion({
      completedUserTurns: 4,
      messages: [{ role: "user", content: "I want to lead more visibly, but I prefer restrained communication." }],
      newAnswer: "My references are bold, even though I keep making my own work quiet.",
      signalContext: {
        birthRecognitionLayer: { confidence: "tentative", contextSummary: "A measured expression may coexist with a wish for visibility.", adaptiveQuestionLens: "Test restraint against visibility only where the conversation repeats it." },
        imageSignals: [{ sourceId: "image-1", quote: "high contrast, direct composition" }],
      },
    });

    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    expect(result.provenance.mode).toBe("multi_signal_probe_opportunity");
    expect(result.question).toContain("I’m noticing something interesting");
    expect(result.question).not.toMatch(/numerology|horoscope|Dakidarts|score|birth[- ]?date/i);
  });

  it("falls back to a deterministic question when the model is unavailable", async () => {
    mockedInvokeLLM.mockRejectedValue(new Error("offline"));
    const result = await generateAdaptiveQuestion({
      completedUserTurns: 1,
      messages: [],
      newAnswer: "I feel clearest when I help someone see their next move.",
    });
    expect(result.question).toContain("?");
    expect(result.question).toMatch(/I’m with|worth staying with|thread|noticing|becoming|keeps asking/i);
    expect(result.provenance.fallback).toBe(true);
  });
});
