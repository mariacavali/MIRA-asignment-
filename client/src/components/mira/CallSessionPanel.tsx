import { useEffect, useState } from "react";
import type { CallClockCommand, CallClockStatus } from "@shared/miraCallClock";
import { Button } from "@/components/ui/button";
import { coachButton, coachOutline } from "./CoachPanels";

const time = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function CallSessionPanel({ clock, conversationId, busy, onCommand }: { clock: CallClockStatus; conversationId: string; busy: boolean;
  onCommand: (action: CallClockCommand["action"]) => Promise<void> }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const started = performance.now(); setTick(0); if (clock.state !== "active") return;
    const timer = setInterval(() => setTick(Math.max(0, performance.now() - started)), 250); return () => clearInterval(timer);
  }, [clock]);
  const elapsed = clock.state === "active" ? Math.min(tick, Math.max(0, (clock.leaseUntilMs ?? clock.serverNowMs) - clock.serverNowMs), clock.remainingMs) : 0;
  const remaining = Math.max(0, clock.remainingMs - elapsed), used = clock.allowanceMs - remaining;
  const elsewhere = clock.state === "active" && clock.conversationId !== conversationId;
  const paused = clock.state === "paused", exhausted = clock.state === "exhausted" || remaining === 0;
  return <section aria-label="Conversation time" className="mb-7 rounded border border-white/20 p-4">
    <h2 className="text-sm text-[#f1eadc]">Your conversation time</h2>
    <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm tabular-nums"><span>Used {time(used)}</span><span>Remaining {time(remaining)}</span></div>
    <progress className="mt-3 h-2 w-full accent-[#d2b98b]" aria-label="Time used" value={used} max={clock.allowanceMs} />
    <p role="status" className="mt-3 text-xs leading-5 text-[#c9c3b7]">{elsewhere ? "A timed conversation is active in another conversation. Return there to pause or end it." : exhausted ? "Your allowance is used. Your conversation and reflection are saved." : clock.pauseReason === "connection_lost" ? "The connection was interrupted, so the timer paused. Resume when you’re ready." : paused ? "Paused. Your remaining time stays available." : clock.state === "active" ? "Your timer is running. MIRA will leave time to reflect before you finish." : clock.state === "ended" ? "Conversation ended. You can start again with your remaining time." : "Start when you’re ready. Pausing stops the timer."}</p>
    {remaining <= 5 * 60_000 && remaining > 0 ? <p className="mt-2 text-xs text-[#d2b98b]">{remaining <= 60_000 ? "Less than a minute remains. Bring this conversation to a close." : "Five minutes or less remain. It’s time to reflect on what you’ve shared."}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      {clock.state !== "active" ? <Button type="button" className={coachButton} disabled={busy || exhausted} onClick={() => void onCommand(paused && clock.conversationId === conversationId ? "resume" : "start")}>{paused && clock.conversationId === conversationId ? "Resume" : "Start conversation"}</Button> : <Button type="button" className={coachOutline} variant="outline" disabled={busy || elsewhere} onClick={() => void onCommand("pause")}>Pause</Button>}
      {["active", "paused"].includes(clock.state) ? <Button type="button" className={coachOutline} variant="outline" disabled={busy || clock.conversationId !== conversationId} onClick={() => void onCommand("end")}>End conversation</Button> : null}
    </div>
    <p className="mt-3 text-xs leading-5 text-[#aaa295]">Voice is not connected in this version; you can type during the timed conversation. If the connection drops, the timer pauses within 30 seconds.</p>
  </section>;
}
