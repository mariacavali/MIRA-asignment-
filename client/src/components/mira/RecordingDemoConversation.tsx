import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { RECORDING_DEMO_SCRIPTED_CONVERSATION } from "@shared/recordingDemoScript";
import { ArrowRight, MessageSquare } from "lucide-react";
import { useState } from "react";

// MIRA_RECORDING_DEMO only. Replaces the real "Call MIRA" voice connection
// (OpenAI Realtime, server/miraCore/realtime.ts) with a fixed, offline,
// clearly-labeled scripted transcript, then persists the fictional
// preparation answers via recordingDemo.completeConversation - never touches
// a microphone or any external AI service.
export function RecordingDemoConversation({ token, consent, onComplete }: { token: string; consent: boolean; onComplete: () => void }) {
  const [started, setStarted] = useState(false);
  const utils = trpc.useUtils();
  const complete = trpc.recordingDemo.completeConversation.useMutation({
    onSuccess: () => {
      void utils.miraCore.getShootRoomStatus.invalidate();
      onComplete();
    },
  });

  return (
    <div className="mt-6 border border-[#d2b98b]/30 bg-black/20 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d2b98b]">
        DEMO MODE · Scripted conversation — no microphone or external AI call
      </p>
      {!started ? (
        <>
          <p className="mt-2 text-sm leading-6 text-[#c9c3b7]">
            The real "Call MIRA" voice connection is currently unavailable. This plays a short, fixed,
            fictional conversation instead, so the rest of the preparation flow can be demonstrated end to end.
          </p>
          <Button disabled={!consent} onClick={() => setStarted(true)} className="mt-4 rounded-full bg-[#d2b98b] text-[#171613] hover:bg-[#e0c99e]">
            <MessageSquare className="mr-2 size-4" /> Start demo conversation
          </Button>
          {!consent ? <p className="mt-2 text-xs text-[#9e978b]">Accept consent above to begin.</p> : null}
        </>
      ) : (
        <>
          <ol className="mt-4 space-y-3">
            {RECORDING_DEMO_SCRIPTED_CONVERSATION.map((turn, index) => (
              <li key={index} className="text-sm leading-6">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b7a98f]">
                  {turn.speaker === "mira" ? "MIRA (scripted)" : "Elena (fictional)"}
                </span>
                <span className="text-[#ded5c5]">{turn.line}</span>
              </li>
            ))}
          </ol>
          <Button
            disabled={complete.isPending}
            onClick={() => complete.mutate({ token })}
            className="mt-5 rounded-full bg-[#d2b98b] text-[#171613] hover:bg-[#e0c99e]"
          >
            Continue <ArrowRight className="ml-2 size-4" />
          </Button>
          {complete.error ? <p role="alert" className="mt-3 text-xs text-red-300">{complete.error.message}</p> : null}
        </>
      )}
    </div>
  );
}
