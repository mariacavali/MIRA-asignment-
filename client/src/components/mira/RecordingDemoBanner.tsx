import { trpc } from "@/lib/trpc";
import { useState } from "react";

// Persistent banner shown on every page while MIRA_RECORDING_DEMO is enabled
// (server/miraCore/recordingDemo.ts). Renders nothing when the recording
// demo status query reports disabled - normal application behavior is
// completely unaffected. Mounted once in App.tsx so no individual page needs
// to import or duplicate it.
export function RecordingDemoBanner() {
  const status = trpc.recordingDemo.status.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const reset = trpc.recordingDemo.resetDemo.useMutation({
    onSuccess: () => {
      setResetMessage("Demo reset. The seeded shoot is back to its starting state.");
      void utils.invalidate();
    },
    onError: () => setResetMessage("Reset failed. Try again."),
    onSettled: () => setResetting(false),
  });

  if (!status.data?.enabled) return null;

  return (
    <div className="sticky top-0 z-[999] flex flex-wrap items-center justify-center gap-3 bg-[#d2b98b] px-4 py-2 text-center text-xs font-medium uppercase tracking-[0.14em] text-[#171613]">
      <span>LOCAL RECORDING DEMO · Simulated integrations use synthetic data.</span>
      <button
        type="button"
        disabled={resetting}
        onClick={() => { setResetting(true); setResetMessage(null); reset.mutate(); }}
        className="rounded-full border border-[#171613]/40 px-3 py-0.5 text-[10px] tracking-[0.1em] hover:bg-[#171613]/10 disabled:opacity-60"
      >
        {resetting ? "Resetting…" : "Reset demo"}
      </button>
      {resetMessage ? <span className="normal-case tracking-normal text-[11px]">{resetMessage}</span> : null}
    </div>
  );
}
