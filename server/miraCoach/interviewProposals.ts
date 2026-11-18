import type { BrandEvidence, CoachDraft } from "../../shared/miraCoach";
import type { InterviewPlan } from "../../shared/miraInterview";

// Treat semantic matches as suggestions only. The model cannot create evidence IDs,
// reopen a skipped area, or count an unreviewed suggestion as an answer.
export function validateInterviewMappings(draft: CoachDraft, plan: InterviewPlan | null, evidence: BrandEvidence[], message = "") {
  for (const observation of draft.interviewStates ?? []) {
    if (!plan?.coverage.some(item => item.area === observation.area) || !message.includes(observation.quote)
      || draft.interviewProposals?.some(item => item.area === observation.area)) throw new Error("Invalid discovery conversation state");
  }
  for (const item of draft.interviewProposals ?? []) {
    const area = plan?.coverage.find(entry => entry.area === item.area);
    if (!area) throw new Error("Invalid discovery proposal area");
    if (!["missing", "needs_review"].includes(area.status) && (!item.correctionQuote || !message.includes(item.correctionQuote) || item.memoryProposalIndex === null)) throw new Error("Invalid discovery proposal area");
    if (item.correctionQuote && !message.includes(item.correctionQuote)) throw new Error("Invalid discovery correction quote");
    if (item.memoryId !== null) {
      if (!evidence.some(memory => memory.id === item.memoryId && memory.confirmed && !memory.provenance)) throw new Error("Invalid discovery proposal source");
    } else if (item.memoryProposalIndex === null || !draft.memoryProposals[item.memoryProposalIndex]) {
      throw new Error("Invalid discovery proposal index");
    }
  }
}
