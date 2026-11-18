import { describe, expect, it } from "vitest";
import { completedCoachTurnSchema } from "../../shared/miraCoach";
import { emptyKnowledgeGuidance, knowledgeTrace } from "../../shared/miraKnowledgeRetrieval";
import { conversationHistory } from "./conversationHistory";
import { interviewOpening, MIRA_BRAND_INTERVIEW_OPENING, MIRA_PERSONAL_INTERVIEW_OPENING } from "./interviewMethod";

describe("service-specific interview entry and history", () => {
  it.each([
    ["personal", MIRA_PERSONAL_INTERVIEW_OPENING],
    ["personal_brand", MIRA_BRAND_INTERVIEW_OPENING],
  ] as const)("opens a fresh %s conversation with the approved question", (segment, question) => {
    expect(conversationHistory([], segment)).toEqual({
      entryOpening: { version: "mira-opening-v1", segment, question },
      messages: [{ role: "assistant", content: question }],
    });
  });

  it.each([null, "small_business"] as const)("does not impose a personal story on %s", segment => {
    expect(conversationHistory([], segment)).toEqual({ messages: [] });
  });

  it("restores the actual opening before the client's first answer without restarting discovery", () => {
    const opening = interviewOpening("personal")!;
    const history = conversationHistory([
      { message: "Walking with my sister.", result: JSON.stringify({ interviewOpening: opening, response: "What made that moment feel like you?", memoryProposals: [] }) },
      { message: "I could be playful.", result: { response: "When would you like to use these photographs?", memoryProposals: [] } },
    ], "personal_brand");
    expect(history).toEqual({ messages: [
      { role: "assistant", content: opening.question },
      { role: "client", content: "Walking with my sister." },
      { role: "assistant", content: "What made that moment feel like you?" },
      { role: "client", content: "I could be playful." },
      { role: "assistant", content: "When would you like to use these photographs?" },
    ] });
  });

  it("leaves legacy and truncated histories intact rather than inserting a new opener", () => {
    const turn = { message: "Continue from my approved direction.", result: { response: "What would you like to change?", memoryProposals: [] } };
    const history = conversationHistory(Array.from({ length: 50 }, () => turn), "personal_brand");
    expect(history.entryOpening).toBeUndefined();
    expect(history.messages).toHaveLength(100);
    expect(history.messages[0]).toEqual({ role: "client", content: turn.message });
    expect(JSON.stringify(history)).not.toContain(MIRA_BRAND_INTERVIEW_OPENING);
  });

  it("keeps a full 50-exchange window plus its original opening within the graph bound", () => {
    const turn = { message: "An answer", result: { response: "A follow-up", memoryProposals: [] } };
    const turns = [
      { ...turn, result: { ...turn.result, interviewOpening: interviewOpening("personal_brand") } },
      ...Array.from({ length: 49 }, () => turn),
    ];
    expect(conversationHistory(turns, "personal_brand").messages).toHaveLength(101);
  });

  it("keeps older completed results readable and validates persisted opening metadata", () => {
    const result = { response: "Earlier reply", memoryProposals: [] };
    expect(completedCoachTurnSchema.parse(result)).toEqual(result);
    const historical = { ...result, knowledgeTrace: { ...knowledgeTrace(emptyKnowledgeGuidance("disabled")), policyVersion: "brand-coach-v3-interview" } };
    expect(conversationHistory([{ message: "Earlier answer", result: historical }], "personal_brand").messages).toEqual([
      { role: "client", content: "Earlier answer" }, { role: "assistant", content: result.response },
    ]);
    expect(() => completedCoachTurnSchema.parse({ ...result, interviewOpening: { ...interviewOpening("personal")!, segment: "small_business" } })).toThrow();
  });
});
