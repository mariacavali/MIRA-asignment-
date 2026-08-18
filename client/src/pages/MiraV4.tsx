import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";
import { MiraShell } from "./MiraV3";

const STEP_COPY: Record<string, string> = {
  quick_context: "Set the first creative coordinates",
  birth_details: "Add the private details that ground the context",
  recognition_ready: "Your Creative Director is ready",
  recognition: "Continue the creative premise",
  creative_brief: "Calibrate the visual direction",
  creative_discovery: "Continue Creative Discovery",
  inspiration: "Add one optional private inspiration",
  pre_generation_mirror: "Review the direction before Creative DNA",
};

export default function MiraV4() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const journeys = trpc.miraV4.listJourneys.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const createJourney = trpc.miraV4.createJourney.useMutation({
    onSuccess: result => navigate(`/mira-v4/journey/${result.journeyId}`),
  });

  if (loading) {
    return <MiraShell><Loader2 className="size-5 animate-spin text-stone-400" /></MiraShell>;
  }

  if (!user) {
    return (
      <MiraShell>
        <section className="mira-panel max-w-3xl overflow-hidden text-center">
          <div className="mx-auto mb-8 h-px w-24 bg-gradient-to-r from-transparent via-amber-700/60 to-transparent" />
          <LockKeyhole className="mx-auto mb-7 size-5 text-amber-700" />
          <p className="mira-kicker">Mira · Creative Direction</p>
          <h1 className="mira-display mt-6 text-5xl leading-[0.98] sm:text-7xl">Enter the world your brand has been waiting for.</h1>
          <p className="mx-auto mt-8 max-w-xl text-base leading-7 text-stone-600">
            Mira begins with what you are building, translates it into Creative DNA and a Campaign Plan, then carries that direction toward a Moodboard and Brand World that feel unmistakably yours.
          </p>
          <Button onClick={startLogin} className="mt-10 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
            Enter my Brand World <ArrowRight className="ml-2 size-4" />
          </Button>
        </section>
      </MiraShell>
    );
  }

  const activeJourneys = journeys.data ?? [];

  return (
    <MiraShell>
      <section className="mira-panel max-w-4xl overflow-hidden">
        <div className="grid gap-12 md:grid-cols-[1.35fr_0.65fr] md:items-end">
          <div>
            <p className="mira-kicker">Mira · Creative Direction</p>
            <h1 className="mira-display mt-7 max-w-2xl text-5xl leading-[0.98] sm:text-7xl">Your brand is more than a message. It is a world.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-stone-600">
              Begin with a few honest coordinates. Mira will work with you as a Creative Director to shape the creative truth, emotional atmosphere, and visual language beneath your work.
            </p>
            <Button
              onClick={() => createJourney.mutate()}
              disabled={createJourney.isPending}
              className="mt-10 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800"
            >
              {createJourney.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Begin my Brand World
              {!createJourney.isPending && <ArrowRight className="ml-2 size-4" />}
            </Button>
            {createJourney.error && <p className="mt-5 text-sm text-red-700">Mira could not open this space just now. Please try once more.</p>}
          </div>

          <aside className="rounded-[2rem] bg-stone-900 p-7 text-stone-50">
            <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200/70">The beginning</p>
            <p className="mira-display mt-5 text-3xl leading-tight">Context first. Creative direction next. A visual world built from evidence.</p>
          </aside>
        </div>

        {activeJourneys.length > 0 && (
          <div className="mt-14 border-t border-stone-200 pt-8">
            <p className="mira-kicker">Return to your Brand World</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {activeJourneys.slice(0, 4).map(journey => (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => navigate(`/mira-v4/journey/${journey.id}`)}
                  className="group flex items-center justify-between rounded-2xl bg-stone-100/80 px-5 py-4 text-left transition duration-200 hover:bg-stone-200/70"
                >
                  <span>
                    <span className="block text-sm font-medium text-stone-800">Brand World {journey.id}</span>
                    <span className="mt-1 block text-xs text-stone-500">{STEP_COPY[journey.currentStep] ?? "Mira will meet you where you left off"}</span>
                  </span>
                  <ArrowRight className="size-4 text-stone-400 transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </MiraShell>
  );
}
