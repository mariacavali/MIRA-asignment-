import { createHash } from "node:crypto";
import type { BrandConfiguration } from "../../shared/miraBrandDirection";
import { interviewCoverageSchema, interviewLedgerSchema, type InterviewArea, type InterviewCoverage, type InterviewLedger } from "../../shared/miraInterview";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const interviewMemoryHash = (text: string) => hash(text);
export const interviewProposalId = (configurationKey: string, area: InterviewArea, memoryId: string, text: string) => hash({ configurationKey, area, memoryId, memoryHash: interviewMemoryHash(text) });
export function newInterviewLedger(configuration: BrandConfiguration): InterviewLedger {
  return { version: "interview-coverage-v1", configurationKey: hash(configuration), decisions: [], reviewedFingerprint: null };
}
export function requiredInterviewAreas(configuration: BrandConfiguration): InterviewArea[] {
  if (configuration.segment !== "personal_brand") return [];
  const areas: InterviewArea[] = ["intended_use", "offer", "audience", "desired_understanding", "meaningful_evidence", "voice", "visual_preferences", "visual_boundaries"];
  if (configuration.brandStage === "established" || configuration.brandStage === "evolving") areas.push("existing_identity");
  return areas;
}
export function interviewCoverage(configuration: BrandConfiguration, raw: unknown, memories: { id: string; text: string; status: string }[]): InterviewCoverage | null {
  const required = requiredInterviewAreas(configuration);
  if (!required.length) return null;
  const ledger = raw ? interviewLedgerSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw) : newInterviewLedger(configuration);
  const sameConfiguration = ledger.configurationKey === hash(configuration);
  const pending = sameConfiguration ? (ledger.proposals ?? []).filter(proposal => proposal.status === "pending" && memories.some(memory => memory.id === proposal.memoryId
    && ["confirmed", "pending_confirmation"].includes(memory.status) && proposal.memoryHash === interviewMemoryHash(memory.text))) : [];
  const areas = required.map(area => {
    const decision = ledger.decisions.find(item => item.area === area);
    const memory = decision?.memoryId ? memories.find(item => item.id === decision.memoryId && item.status === "confirmed") : undefined;
    const corrected = pending.some(proposal => proposal.area === area && proposal.correctionQuote);
    const observation = sameConfiguration ? ledger.stateObservations?.find(item => item.area === area) : undefined;
    const status = observation?.status ?? (!decision ? "missing" as const : !sameConfiguration || corrected || (decision.status === "answered" && (!memory || (decision.memoryHash && decision.memoryHash !== interviewMemoryHash(memory.text)))) ? "needs_review" as const : decision.status);
    return { area, status, memoryId: status === "answered" ? memory!.id : null, answer: status === "answered" ? memory!.text : null };
  });
  // The source text is hashed too: unexpected edits invalidate the review even with the same ID.
  const fingerprint = hash({ configuration, areas });
  const reviewed = ledger.reviewedFingerprint === fingerprint;
  const answered = areas.filter(item => item.status === "answered").length;
  const unresolved = areas.filter(item => item.status !== "answered").length;
  const proposals = sameConfiguration ? (ledger.proposals ?? []).flatMap(proposal => {
    const area = areas.find(item => item.area === proposal.area);
    const memory = memories.find(item => item.id === proposal.memoryId);
    if (proposal.status !== "pending" || !area || !["missing", "needs_review"].includes(area.status)
      || !memory || !["confirmed", "pending_confirmation"].includes(memory.status) || proposal.memoryHash !== interviewMemoryHash(memory.text)) return [];
    return [{ id: proposal.id, area: proposal.area, memoryId: memory.id, answer: memory.text, memoryStatus: memory.status, sourceRequestId: proposal.sourceRequestId }];
  }) : [];
  return interviewCoverageSchema.parse({ version: "interview-coverage-v1", fingerprint, areas, answered, unresolved, reviewed,
    proposals,
    progressPercent: 10 + Math.floor(80 * answered / required.length) + (reviewed ? 10 : 0) });
}
