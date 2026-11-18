import type { BrandConfiguration } from "../../shared/miraBrandDirection";
import { interviewPlanSchema, type InterviewCoverage, type InterviewPlan } from "../../shared/miraInterview";

// The server supplies scope, evidence state and a real clock when available.
// The model owns conversational judgement: there is no nominated next question.
export function planInterview(coverage: InterviewCoverage, _configuration: BrandConfiguration, remainingMs: number | null = null): InterviewPlan {
  if (remainingMs !== null && (!Number.isSafeInteger(remainingMs) || remainingMs < 0)) throw new Error("Invalid server interview time");
  const pendingAreas = Array.from(new Set((coverage.proposals ?? []).map(item => item.area)));
  const unexplored = coverage.areas.some(item => ["missing", "needs_review"].includes(item.status) && !pendingAreas.includes(item.area));
  const phase = remainingMs === 0 ? "closing" : remainingMs !== null && remainingMs <= 5 * 60_000 ? "reflection" : unexplored ? "discovery" : coverage.reviewed ? "reviewed" : "reflection";
  return interviewPlanSchema.parse({ version: "interview-planner-v1", mode: "adaptive", fingerprint: coverage.fingerprint, phase,
    nextArea: null, question: null, alternative: null,
    coverage: coverage.areas.map(({ area, status }) => ({ area, status })), pendingAreas,
    answered: coverage.answered, required: coverage.areas.length, unresolved: coverage.unresolved, progressPercent: coverage.progressPercent, remainingMs });
}

export function interviewPlanInstructions(plan: InterviewPlan) {
  return `SERVER-OWNED INTERVIEW PLAN\n${JSON.stringify(plan)}
ADAPTIVE CONVERSATION: You choose the next useful question from the actual answer/thread, purpose, uncertainty and expert guidance. Coverage is background, never an ordered questionnaire. Library questions are examples, not mandatory wording. Follow a useful thread, clarify an important ambiguity, answer a practical question or change topic. One answer can cover several areas; recognise them without asking again. Never ask the client to author questions or classify answers.
Pending areas hold provisional meaning: use working notes as unapproved context, not settled facts. Do not repeat because reflection is unapproved. Clarify only when useful; replace pending suggestions when meaning changes. Respect skips/unknowns; do not pressure or interpret a skip.
For interviewProposals, use a supplied confirmed memoryId without provenance OR a zero-based memoryProposalIndex from this reply; the other is null. One source per area; several areas per answer allowed. For explicit correction/revisit of answered/unknown/declined meaning, use new memory plus correctionQuote copied exactly from the current client message; otherwise null. Ordinary elaboration is not correction. Never copy expertise/references into facts.
Record explicit uncertainty, a request to skip or disputed meaning in interviewStates (area, unknown/declined/needs_review, exact current-message quote). These are working conversation constraints, never confirmed facts or psychological inferences. Do not report both a state and a new answer for the same area in one reply. Empty arrays when none. Keep the conversation flowing; the client reviews one reflection, not separate memory/category tasks. Suggestions never approve memory, direction or progress. Reflection summarises supported meaning, distinguishes interpretation/intentions, leaves gaps open and asks one neutral check. Reviewed meaning does not approve direction. With a real remainingMs of five minutes or less, briefly warn that time is nearly up and reflect rather than starting new topics; within the last minute, finish the current thought and give a concise closing. Closing adds no discovery. Null time is unknown, never minutes/billing/call-cap enforcement.`;
}
