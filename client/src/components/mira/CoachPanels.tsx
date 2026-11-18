import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CoachMessage } from "@shared/miraCoach";
import type { AddCoachSourceInput } from "@shared/miraSources";

export const coachButton = "rounded-full bg-[#d2b98b] text-[#171613] hover:bg-[#e0c99e]";
export const coachOutline = "rounded-full border-white/25 bg-transparent text-[#f1eadc] hover:bg-white/10 hover:text-white";
export const coachField = "border-white/25 bg-[#171613] text-[#f1eadc] placeholder:text-[#aaa295]";
export type MemoryItem = { id: string; text: string; kind: "explicit" | "interpreted"; status: "pending_confirmation" | "confirmed" | "rejected" };
export type SourceItem = { id: string; title: string; text: string; referenceUrl: string | null; status: "active" | "withdrawn" };

export function CoachError({ message, retry }: { message?: string; retry?: () => void }) {
  if (!message) return null;
  return <div role="alert" className="my-4 rounded border border-[#c99788]/40 bg-[#3a2520] p-4 text-sm text-[#ffe1d6]">
    <p>{message}</p>{retry ? <button type="button" className="mt-2 underline underline-offset-4" onClick={retry}>Try again</button> : null}
  </div>;
}

export function ConversationPanel({ messages, busy, error, retry, onSend, locked, correctionRequest = 0 }: {
  messages: CoachMessage[]; busy: boolean; error?: string; retry?: () => void;
  onSend: (message: string) => Promise<boolean>; locked?: boolean; correctionRequest?: number;
}) {
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!correctionRequest) return;
    setDraft(previous => previous || "I’d like to change this: ");
    messageField.current?.focus();
  }, [correctionRequest]);
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, busy]);
  async function submit(event: FormEvent) {
    event.preventDefault(); const message = draft.trim();
    if (!message || busy || locked) return;
    if (await onSend(message)) setDraft("");
  }
  return <section aria-label="Brand conversation" className="min-w-0">
    <h2 className="sr-only">Chat with MIRA</h2>
    <div ref={log} role="log" aria-live="polite" aria-label="Conversation messages" aria-busy={busy} className="max-h-[60vh] min-h-48 space-y-5 overflow-y-auto pr-2">
      {messages.length ? messages.map((message, i) => <article key={i} className={`rounded-sm border p-5 ${message.role === "client" ? "ml-6 border-white/15 bg-[#23211d]" : "mr-6 border-[#d2b98b]/30 bg-[#171613]"}`}>
        <p className="mb-3 text-xs tracking-widest text-[#d2b98b]">{message.role === "client" ? "YOU" : "MIRA"}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
      </article>) : <p className="border-y border-white/10 py-8 text-sm leading-7 text-[#c9c3b7]">Hi, I’m MIRA. What would you like help with today?</p>}
    </div>
    <CoachError message={error} retry={retry} />
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label htmlFor="coach-message" className="text-sm">Your message</label>
      <Textarea ref={messageField} id="coach-message" value={draft} onChange={e => setDraft(e.target.value)} maxLength={8000} disabled={busy || locked} className={`${coachField} min-h-20`} placeholder="Tell MIRA what you’re working on…" required />
      <div className="flex items-center justify-between gap-4"><p role="status" className="text-xs text-[#c9c3b7]">{busy ? "MIRA is thinking…" : "You can review what MIRA remembers in Details."}</p>
        <Button className={coachButton} disabled={busy || locked || !draft.trim()} type="submit">{busy ? "Thinking…" : "Send message"}</Button></div>
    </form>
  </section>;
}

// Shared by the live chat and offline preview; native disclosure works by keyboard.
export function ChatDetails({ pendingCount, children }: { pendingCount: number; children: ReactNode }) {
  return <details className="mt-8 min-w-0 border-t border-white/15 pt-5">
    <summary className="cursor-pointer text-sm text-[#d2b98b]">
      Details{pendingCount > 0 ? ` · ${pendingCount} to review` : " · Memory and references"}
    </summary>
    <div className="mt-6 space-y-8">{children}</div>
  </details>;
}

export function MemoryPanel({ items, busy, onDecide }: { items: MemoryItem[]; busy: boolean;
  onDecide: (id: string, decision: "confirmed" | "rejected") => void }) {
  return <section aria-label="Brand memory">
    <p className="mira-dark-kicker">You decide what stays</p><h2 className="mira-dark-display mt-3 text-3xl">Brand memory</h2>
    <p className="mt-3 text-sm leading-6 text-[#c9c3b7]">Review MIRA’s suggestions before they guide future advice. Reject anything that doesn’t feel right.</p>
    {!items.length ? <p className="mt-6 text-sm text-[#c9c3b7]">No memory suggestions yet.</p> : null}
    <div className="mt-5 space-y-4">{items.map(item => <article key={item.id} className="border-t border-white/15 pt-4">
      <p className="text-xs text-[#d2b98b]">{item.status === "pending_confirmation" ? "Awaiting your review" : item.status === "confirmed" ? "Confirmed by you" : "Not used"} · {item.kind === "interpreted" ? "MIRA’s interpretation" : "From your conversation"}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{item.text}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.status === "pending_confirmation" ? <><Button type="button" size="sm" className={coachButton} disabled={busy} onClick={() => onDecide(item.id, "confirmed")}>Confirm</Button>
          <Button type="button" size="sm" variant="outline" className={coachOutline} disabled={busy} onClick={() => onDecide(item.id, "rejected")}>Reject</Button></> : null}
        {item.status === "confirmed" ? <Button type="button" size="sm" variant="outline" className={coachOutline} disabled={busy} onClick={() => onDecide(item.id, "rejected")}>Withdraw memory</Button> : null}
      </div>
    </article>)}</div>
  </section>;
}

export function SourcesPanel({ items, busy, onAdd, onWithdraw }: { items: SourceItem[]; busy: boolean;
  onAdd: (source: AddCoachSourceInput["source"]) => Promise<boolean>; onWithdraw: (id: string) => void }) {
  const [title, setTitle] = useState(""); const [text, setText] = useState(""); const [url, setUrl] = useState("");
  const [rights, setRights] = useState<"" | "client_owned" | "permission_granted">(""); const [approved, setApproved] = useState(false);
  const [validation, setValidation] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setValidation("");
    if (busy || !rights || !approved) return;
    if (url.trim()) {
      try { const parsed = new URL(url.trim()); if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(); }
      catch { setValidation("Use an HTTPS reference link without a username or password, or leave it empty."); return; }
    }
    if (await onAdd({ title: title.trim(), text: text.trim(), ...(url.trim() ? { referenceUrl: url.trim() } : {}), rightsBasis: rights, approvedForCoaching: true })) {
      setTitle(""); setText(""); setUrl(""); setRights(""); setApproved(false);
    }
  }
  return <section aria-label="Approved sources">
    <p className="mira-dark-kicker">Your reference material</p><h2 className="mira-dark-display mt-3 text-3xl">Sources</h2>
    <p className="mt-3 text-sm leading-6 text-[#c9c3b7]">Share text you want MIRA to consider. A source informs the conversation; it does not automatically define your brand.</p>
    <div className="mt-5 space-y-4">{items.map(item => <article key={item.id} className="border-t border-white/15 pt-4">
      <h3 className="break-words text-base">{item.title}</h3><p className="mt-1 text-xs text-[#d2b98b]">{item.status === "active" ? "Approved for coaching" : "Withdrawn · excluded from future retrieval"}</p>
      <details className="mt-3 text-sm text-[#c9c3b7]"><summary className="cursor-pointer">Read source</summary><p className="mt-3 whitespace-pre-wrap break-words leading-6">{item.text}</p>{item.referenceUrl ? <p className="mt-3 break-all">Reference: {item.referenceUrl}</p> : null}</details>
      {item.status === "active" ? <Button type="button" variant="outline" size="sm" className={`${coachOutline} mt-3`} disabled={busy} onClick={() => onWithdraw(item.id)}>Withdraw source</Button> : null}
    </article>)}</div>
    <details className="mt-6 border-t border-white/20 pt-5"><summary className="cursor-pointer text-[#d2b98b]">Add a source</summary>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="block text-sm">Source title<Input className={`${coachField} mt-2`} required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">Source text<Textarea className={`${coachField} mt-2 min-h-36`} required maxLength={20000} value={text} onChange={e => setText(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">Reference link (optional)<Input className={`${coachField} mt-2`} type="url" maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} disabled={busy} /><span className="mt-2 block text-xs leading-5 text-[#c9c3b7]">MIRA uses the text above. It won’t open this link.</span></label>
        <label className="block text-sm">Permission to use this text<select required value={rights} onChange={e => setRights(e.target.value as typeof rights)} disabled={busy} className={`${coachField} mt-2 block w-full rounded-md border p-3`}>
          <option value="">Choose one</option><option value="client_owned">I own this material</option><option value="permission_granted">I have permission to use it</option>
        </select></label>
        <label className="flex gap-3 text-sm leading-6"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} disabled={busy} className="mt-1 size-4 shrink-0 accent-[#d2b98b]" />I approve this text for coaching in this conversation.</label>
        <CoachError message={validation} />
        <Button type="submit" className={coachButton} disabled={busy || !approved || !rights || !title.trim() || !text.trim()}>Save approved source</Button>
        <p className="text-xs leading-5 text-[#c9c3b7]">Withdraw a source to stop future retrieval. Previous replies remain in your conversation. To replace a source, withdraw it and add the new text.</p>
      </form>
    </details>
  </section>;
}

export function DirectionPanel({ records, busy, onReview, onCorrect, onApprove }: {
  records: import("@shared/miraBrandDirection").DirectionRecord[]; busy: boolean;
  onReview: (directionId: string, decisionId: string, action: "accept" | "change" | "decline" | "unsure", reason: string) => Promise<boolean>;
  onCorrect: (parentId: string, draft: import("@shared/miraBrandDirection").DirectionDraft) => Promise<boolean>;
  onApprove: (directionId: string) => void;
}) {
  const record = records.at(-1);
  if (!record) return <section aria-label="Brand reflection"><h2 className="text-xl">Your direction</h2><p className="mt-3 text-sm">No direction draft is ready for review yet.</p></section>;
  return <DirectionReflection key={`${record.id}:${record.reviews.length}:${record.stale}`} record={record} busy={busy} onReview={onReview} onCorrect={onCorrect} onApprove={onApprove} />;
}
function DirectionReflection({ record, busy, onReview, onCorrect, onApprove }: Omit<Parameters<typeof DirectionPanel>[0], "records"> & { record: import("@shared/miraBrandDirection").DirectionRecord }) {
  const [draft, setDraft] = useState(record.draft);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [validation, setValidation] = useState("");
  const labels: Record<string, string> = { "brand.meaning": "Brand meaning", "voice.profile": "Your voice", "visual.direction": "Visual direction", intendedUse: "Intended uses", colour: "Colour", avoid: "Avoid", examples: "Examples", traits: "Traits", references: "References", boundaries: "Boundaries" };
  const required = record.configuration.segment === "personal" ? ["brand.meaning", "visual.direction"] : ["brand.meaning", "voice.profile", "visual.direction"];
  const canApprove = required.every(d => record.draft.decisions.some(item => item.dimension === d)) && record.draft.decisions.every(d => record.reviews.filter(r => r.decisionId === d.id).at(-1)?.action === "accept");
  return <section aria-label="Brand reflection" className="space-y-5">
    <h2 className="text-xl">Your direction</h2>
    <p className="text-sm">{record.state === "approved" ? "Approved by you" : "Review each part, then approve the complete direction."}</p>
    {record.stale ? <p role="status" className="text-sm">Supporting information changed. This version needs a new evidence review before it can be approved or used.</p> : null}
    {draft.decisions.map((decision, index) => <article key={decision.id} className="space-y-3 border-t border-white/15 pt-4">
      <h3>{labels[decision.dimension]}</h3>
      {Object.entries(decision.value).map(([field, value]) => <label key={field} className="block text-sm">{labels[field] ?? field.charAt(0).toUpperCase() + field.slice(1)}
        {editing ? <Textarea className={`${coachField} mt-2`} value={Array.isArray(value) ? value.join("\n") : value} disabled={busy} maxLength={2000} onChange={e => {
          const next = structuredClone(draft);
          Object.assign(next.decisions[index].value, { [field]: Array.isArray(value) ? e.target.value.split("\n").filter(v => v.trim()) : e.target.value }); setDraft(next);
        }} /> : <p className="mt-1 whitespace-pre-wrap leading-6 text-[#c9c3b7]">{Array.isArray(value) ? value.join(" · ") : value}</p>}
      </label>)}
      <p className="text-sm">Why: {decision.explanation}</p>
      {decision.uncertainty ? <p className="text-sm">Still uncertain: {decision.uncertainty}</p> : null}
      <p className="text-xs text-[#c9c3b7]">Based on {decision.evidence.length} linked source or memory item(s). {record.reviews.filter(r => r.decisionId === decision.id).at(-1)?.action ?? "Awaiting review"}</p>
      <details className="text-xs"><summary className="cursor-pointer">Evidence links</summary><ul className="mt-2 space-y-1">{decision.evidence.map(e => <li key={`${e.kind}:${e.id}`} className="break-all">{e.kind === "memory" ? "Confirmed memory" : "Source"}: {e.id}</li>)}</ul></details>
      {!editing && record.state === "draft" && !record.stale ? <>
        <label className="block text-sm">Your feedback (required for a change)<Textarea className={`${coachField} mt-2`} maxLength={2000} value={reasons[decision.id] ?? ""} disabled={busy} onChange={e => setReasons(r => ({ ...r, [decision.id]: e.target.value }))} /></label>
        <div className="flex flex-wrap gap-2">{([ ["accept", "Fits me"], ["change", "Request a change"], ["decline", "Doesn’t fit"], ["unsure", "Not sure"] ] as const).map(([action, label]) => <Button key={action} type="button" className={coachOutline} disabled={busy || (action === "change" && !reasons[decision.id]?.trim())} onClick={() => void onReview(record.id, decision.id, action, reasons[decision.id] ?? "")}>{label}</Button>)}</div>
      </> : null}
    </article>)}
    {draft.unknowns.length ? <p className="text-sm">Open questions: {draft.unknowns.join(" · ")}</p> : null}
    <CoachError message={validation} />
    {editing ? <><p className="text-xs">Use one item per line for lists. Saving creates a new draft for review; your previous version stays in the history.</p><Button type="button" className={coachButton} disabled={busy} onClick={async () => {
      const { directionDraftSchema } = await import("@shared/miraBrandDirection");
      const checked = directionDraftSchema.safeParse(draft);
      if (!checked.success) { setValidation("Complete every field and keep each list to 1–20 items."); return; }
      await onCorrect(record.id, checked.data);
    }}>Save corrected draft</Button><Button type="button" className={`${coachOutline} ml-3`} disabled={busy} onClick={() => { setDraft(record.draft); setEditing(false); setValidation(""); }}>Cancel</Button></> : <>
      <Button type="button" className={coachOutline} disabled={busy || record.stale} onClick={() => setEditing(true)}>Edit this direction</Button>
      {record.state === "draft" ? <Button type="button" className={`${coachButton} ml-3`} disabled={busy || record.stale || !canApprove} onClick={() => onApprove(record.id)}>Approve complete direction</Button> : null}
    </>}
  </section>;
}
