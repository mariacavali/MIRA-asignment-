import { completedCoachTurnSchema, type CoachInterviewOpening, type CoachMessage } from "../../shared/miraCoach";
import type { BrandConfiguration } from "../../shared/miraBrandDirection";
import { interviewOpening } from "./interviewMethod";

// Completed turns arrive oldest first, within the existing 50-exchange window.
// Before an answer, the opener is a server-provided prompt; reading it creates no turn.
// The first successful answer freezes the displayed wording in that turn's result JSON.
export function conversationHistory(turns: { message: string; result: unknown }[], segment: BrandConfiguration["segment"] | null): {
  messages: CoachMessage[]; entryOpening?: CoachInterviewOpening;
} {
  if (!turns.length) {
    const entryOpening = interviewOpening(segment);
    return entryOpening ? { entryOpening, messages: [{ role: "assistant", content: entryOpening.question }] } : { messages: [] };
  }
  return { messages: turns.flatMap(turn => {
    const result = completedCoachTurnSchema.parse(typeof turn.result === "string" ? JSON.parse(turn.result) : turn.result);
    const opening: CoachMessage[] = result.interviewOpening ? [{ role: "assistant", content: result.interviewOpening.question }] : [];
    return [...opening, { role: "client" as const, content: turn.message }, { role: "assistant" as const, content: result.response }];
  }) };
}
