import { INTERVIEW_AREA_LABELS, type InterviewReflection as Reflection } from "@shared/miraInterview";
import { Button } from "@/components/ui/button";
import { coachButton, coachOutline } from "./CoachPanels";

export function InterviewReflection({ reflection, busy, onConfirm, onCorrect }: {
  reflection: Reflection; busy: boolean; onConfirm: (fingerprint: string) => Promise<boolean>; onCorrect: () => void;
}) {
  if (!reflection.answers.length) return null;
  const answers = reflection.answers.filter((answer, index, all) => all.findIndex(item => item.memoryId === answer.memoryId) === index);
  return <section aria-label="Your reflection" className="mt-8 border-t border-white/15 pt-6">
    <h2 className="mira-dark-display text-3xl">What I understand so far</h2>
    <p className="mt-3 text-sm leading-6 text-[#c9c3b7]">MIRA follows your conversation and brings the meaning together here. Check whether this sounds like you. You can correct anything in the conversation.</p>
    <div className="mt-5 space-y-4">{answers.map(answer => <article key={answer.memoryId} className="border-l-2 border-[#d2b98b]/40 pl-4">
      <p className="text-xs text-[#d2b98b]">{answer.kind === "interpreted" ? "MIRA’s interpretation — please check" : "From what you shared"}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#f1eadc]">{answer.text}</p>
    </article>)}</div>
    {reflection.unresolved.length ? <details className="mt-5 text-xs leading-5 text-[#c9c3b7]"><summary className="cursor-pointer">What is still open</summary><p className="mt-2">{reflection.unresolved.map(item => INTERVIEW_AREA_LABELS[item.area]).join(" · ")}. We can leave these open; you do not need to fill in a form.</p></details> : null}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button type="button" className={coachButton} disabled={busy || reflection.reviewed} onClick={() => void onConfirm(reflection.fingerprint)}>{reflection.reviewed ? "Reflection confirmed" : "This reflects what I meant"}</Button>
      <Button type="button" variant="outline" className={coachOutline} disabled={busy} onClick={onCorrect}>I’d like to change something</Button>
    </div>
    <p className="mt-3 text-xs leading-5 text-[#c9c3b7]">Confirming this reflection saves the meaning shown here. Your brand direction will have its own review.</p>
  </section>;
}
