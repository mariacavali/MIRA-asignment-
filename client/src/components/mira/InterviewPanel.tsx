import { useState } from "react";
import { INTERVIEW_AREA_LABELS, type InterviewArea, type InterviewCoverage } from "@shared/miraInterview";
import { Button } from "@/components/ui/button";
import { coachButton, coachField, coachOutline, type MemoryItem } from "./CoachPanels";

const statusLabels = { missing: "Not answered yet", answered: "Confirmed answer", unknown: "Not sure yet", declined: "Skipped", needs_review: "Needs another look" };
type Review = (area: InterviewArea, status: "answered" | "unknown" | "declined" | "needs_review", memoryId: string | null) => Promise<boolean>;
type ProposalReview = (proposalId: string, action: "accept" | "dismiss") => Promise<boolean>;
function AreaReview({ item, proposals, memories, busy, onReview, onProposalReview }: { item: InterviewCoverage["areas"][number]; proposals: NonNullable<InterviewCoverage["proposals"]>; memories: MemoryItem[]; busy: boolean; onReview: Review; onProposalReview?: ProposalReview }) {
  const [selected, setSelected] = useState(item.memoryId ?? "");
  const confirmed = memories.filter(memory => memory.status === "confirmed");
  return <article className="border-t border-white/15 py-4">
    <h3 className="text-sm text-[#f1eadc]">{INTERVIEW_AREA_LABELS[item.area]}</h3>
    <p className="mt-1 text-xs text-[#d2b98b]">{statusLabels[item.status]}</p>
    {item.answer ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#c9c3b7]">{item.answer}</p> : null}
    {proposals.map(proposal => <div key={proposal.id} className="mt-4 rounded border border-[#d2b98b]/40 p-3">
      <p className="text-xs text-[#d2b98b]">MIRA suggests this answer belongs here</p>
      <blockquote className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#f1eadc]">{proposal.answer}</blockquote>
      {proposal.memoryStatus === "pending_confirmation" ? <p className="mt-2 text-xs leading-5 text-[#c9c3b7]">Confirm this answer in Brand memory first, then review its place here.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" className={coachButton} disabled={busy || !onProposalReview || proposal.memoryStatus !== "confirmed"} onClick={() => void onProposalReview?.(proposal.id, "accept")}>Yes, use it here</Button>
        <Button type="button" size="sm" variant="outline" className={coachOutline} disabled={busy || !onProposalReview} onClick={() => void onProposalReview?.(proposal.id, "dismiss")}>Dismiss suggestion</Button>
      </div>
    </div>)}
    <label className="mt-3 block text-xs text-[#c9c3b7]">Choose a saved answer
      <select className={`${coachField} mt-2 block w-full rounded border p-2`} value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>
        <option value="">Choose from your confirmed memory</option>
        {item.memoryId && !confirmed.some(memory => memory.id === item.memoryId) ? <option value={item.memoryId}>Current confirmed answer</option> : null}
        {confirmed.map(memory => <option key={memory.id} value={memory.id}>{memory.text.slice(0, 120)}</option>)}
      </select>
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" className={coachButton} disabled={busy || !selected} onClick={() => void onReview(item.area, "answered", selected)}>Use this answer</Button>
      <Button type="button" size="sm" variant="outline" className={coachOutline} disabled={busy} onClick={() => void onReview(item.area, "unknown", null)}>Not sure yet</Button>
      <Button type="button" size="sm" variant="outline" className={coachOutline} disabled={busy} onClick={() => void onReview(item.area, "declined", null)}>Skip</Button>
      {item.status !== "missing" ? <Button type="button" size="sm" variant="outline" className={coachOutline} disabled={busy} onClick={() => void onReview(item.area, "needs_review", null)}>Revisit</Button> : null}
    </div>
  </article>;
}
export function InterviewPanel({ coverage, memories, busy, onReview, onConfirm, onProposalReview }: { coverage: InterviewCoverage; memories: MemoryItem[]; busy: boolean; onReview: Review; onConfirm: () => Promise<boolean>; onProposalReview?: ProposalReview }) {
  const ready = coverage.areas.every(item => item.status !== "missing" && item.status !== "needs_review");
  return <section aria-label="Discovery review">
    <h2 className="mira-dark-display text-3xl">Your discovery</h2>
    <p className="mt-3 text-sm leading-6 text-[#c9c3b7]">Review where your answers belong. MIRA may suggest a match; you decide whether it fits. Confirm new answers in Brand memory first. You can also choose an answer yourself, leave an area uncertain, skip it or revisit it.</p>
    <progress className="mt-5 h-2 w-full accent-[#d2b98b]" max={100} value={coverage.progressPercent} aria-label="Confirmed discovery progress" />
    <p className="mt-2 text-xs text-[#c9c3b7]">{coverage.answered} of {coverage.areas.length} areas have confirmed answers · {coverage.progressPercent}%</p>
    <p className="mt-2 text-xs leading-5 text-[#c9c3b7]">Uncertain and skipped areas remain unresolved. Progress also includes reviewing these answers together.</p>
    <div className="mt-5">{coverage.areas.map(item => <AreaReview key={`${coverage.fingerprint}:${item.area}`} item={item} proposals={(coverage.proposals ?? []).filter(proposal => proposal.area === item.area)} memories={memories} busy={busy} onReview={onReview} onProposalReview={onProposalReview} />)}</div>
    <Button type="button" className={`${coachButton} mt-4 h-auto max-w-full whitespace-normal py-2 text-center`} disabled={busy || !ready || coverage.reviewed} onClick={() => void onConfirm()}>{coverage.reviewed ? "Answers reviewed" : "I’ve reviewed these answers and unresolved areas"}</Button>
    <p className="mt-3 text-xs leading-5 text-[#c9c3b7]">Your brand direction has its own review. Changing an answer will reopen this check.</p>
  </section>;
}
