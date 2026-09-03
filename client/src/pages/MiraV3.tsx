import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, LockKeyhole, Pause, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const MEDITATION_STEPS = [
  "Let your shoulders soften. Nothing needs to be solved yet.",
  "Take one slower breath. Notice what has been asking for your attention.",
  "Leave the polished answer outside. Bring only what feels true.",
];

export default function MiraV3() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [meditationStep, setMeditationStep] = useState(-1);
  const journeys = trpc.miraV3.listJourneys.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const createJourney = trpc.miraV3.createJourney.useMutation({
    onSuccess: result => navigate(`/mira-v3/journey/${result.journeyId}`),
  });

  if (loading) {
    return <MiraShell><Loader2 className="size-5 animate-spin text-stone-400" /></MiraShell>;
  }

  if (!user) {
    return (
      <MiraShell>
        <section className="mira-panel max-w-2xl text-center">
          <LockKeyhole className="mx-auto mb-7 size-5 text-amber-700" />
          <p className="mira-kicker">A private conversation</p>
          <h1 className="mira-display mt-5 text-5xl sm:text-7xl">A quieter place to hear what is already true.</h1>
          <p className="mx-auto mt-7 max-w-lg text-base leading-7 text-stone-600">
            Mira stays with what you say, notices what keeps returning, and reflects the identity and direction already taking shape beneath your words.
          </p>
          <Button onClick={startLogin} className="mt-10 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
            Enter the private experience <ArrowRight className="ml-2 size-4" />
          </Button>
        </section>
      </MiraShell>
    );
  }

  const activeJourneys = journeys.data ?? [];
  const inMeditation = meditationStep >= 0;
  const atFinalMeditationStep = meditationStep === MEDITATION_STEPS.length - 1;

  return (
    <MiraShell>
      <section className="mira-panel max-w-3xl">
        {!inMeditation ? (
          <>
            <p className="mira-kicker">Mira · A private conversation</p>
            <h1 className="mira-display mt-8 max-w-2xl text-5xl sm:text-7xl">Begin where the performance ends.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-stone-600">
              You do not need to arrive with the right words. Begin honestly, and let Mira understand you a little at a time.
            </p>
            <Button onClick={() => setMeditationStep(0)} className="mt-10 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
              Begin with a pause <Pause className="ml-2 size-4" />
            </Button>

            {activeJourneys.length > 0 && (
              <div className="mt-14 border-t border-stone-200 pt-8">
                <p className="mira-kicker">Return to an earlier conversation</p>
                <div className="mt-5 grid gap-3">
                  {activeJourneys.slice(0, 3).map(journey => (
                    <button
                      key={journey.id}
                      type="button"
                      onClick={() => navigate(`/mira-v3/journey/${journey.id}`)}
                      className="group flex items-center justify-between rounded-2xl bg-stone-100/80 px-5 py-4 text-left transition duration-200 hover:bg-stone-200/70"
                    >
                      <span>
                        <span className="block text-sm font-medium text-stone-800">Conversation {journey.id}</span>
                        <span className="mt-1 block text-xs text-stone-500">Mira will meet you where you left off</span>
                      </span>
                      <ArrowRight className="size-4 text-stone-400 transition-transform duration-200 group-hover:translate-x-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-6 text-center sm:py-12">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-amber-700/25 bg-amber-50" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-amber-800/70" />
            </div>
            <p className="mira-display mx-auto mt-10 max-w-xl text-3xl leading-snug sm:text-5xl">
              {MEDITATION_STEPS[meditationStep]}
            </p>
            <p className="mt-6 text-sm tracking-wide text-stone-500">Stay here for one full breath.</p>
            <div className="mt-12 flex flex-wrap justify-center gap-3">
              <Button variant="ghost" onClick={() => setMeditationStep(-1)} className="rounded-full text-stone-500">
                <RotateCcw className="mr-2 size-4" /> Start again
              </Button>
              <Button
                onClick={() => atFinalMeditationStep ? createJourney.mutate() : setMeditationStep(step => step + 1)}
                disabled={createJourney.isPending}
                className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800"
              >
                {createJourney.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {atFinalMeditationStep ? "I’m ready" : "Stay with this"}
                {!createJourney.isPending && <ArrowRight className="ml-2 size-4" />}
              </Button>
            </div>
            {createJourney.error && <p className="mt-5 text-sm text-red-700">Mira could not open the conversation just now. Please try again.</p>}
          </div>
        )}
      </section>
    </MiraShell>
  );
}

export function MiraShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mira-surface min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <header className="mx-auto mb-10 flex max-w-5xl items-center justify-between px-2">
        <button type="button" onClick={() => window.location.assign("/")} className="mira-display text-2xl text-stone-900">Mira</button>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-stone-500"><LockKeyhole className="size-3" /> Private</div>
      </header>
      <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl items-center justify-center">{children}</div>
    </main>
  );
}
