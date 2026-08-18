import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";

const SEGMENTS = [
  { id: "01", label: "DISCOVER", status: "active" as const },
  { id: "02", label: "DEEPER", status: "future" as const },
  { id: "03", label: "CREATE", status: "future" as const },
];

export default function MiraLevel1() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const createJourney = trpc.miraV4.createLevel1Journey.useMutation({
    onSuccess: result => navigate(`/mira-1/journey/${result.journeyId}`),
  });

  if (loading) {
    return <Mira123Shell><Loader2 className="size-5 animate-spin text-amber-100/80" /></Mira123Shell>;
  }

  if (!user) {
    return (
      <Mira123Shell>
        <section className="mira-l123-panel max-w-4xl">
          <p className="mira-l123-kicker">Mira private experience</p>
          <h1 className="mira-display mt-6 max-w-3xl text-5xl leading-[0.98] text-amber-50 sm:text-7xl">
            A first editorial encounter with your brand world.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-stone-300">
            Level 1 is a concise discovery sequence. It captures clear signals, tensions, and boundaries to produce a first Brand Mirror.
          </p>
          <Button onClick={startLogin} className="mira-l123-cta mt-10 rounded-full px-7 text-amber-50">
            Enter Level 1 <ArrowRight className="ml-2 size-4" />
          </Button>
        </section>
      </Mira123Shell>
    );
  }

  return (
    <Mira123Shell>
      <section className="mira-l123-panel max-w-3xl">
        <div className="mira-l123-topnav" aria-label="Mira levels">
          {SEGMENTS.map(segment => (
            <span key={segment.id} className={`mira-l123-topnav-item ${segment.status === "active" ? "is-active" : "is-future"}`}>
              {segment.id} {segment.label}
            </span>
          ))}
        </div>

        <p className="mira-l123-kicker mt-10">Mira private experience</p>
        <h1 className="mira-display mt-6 max-w-3xl text-[clamp(2rem,4vw,3.2rem)] leading-[1.04] text-amber-50">
          Discover the first pattern in how your brand is becoming visible.
        </h1>

        <div className="mt-10 border-t border-amber-100/20 pt-7">
          <p className="max-w-xl text-sm leading-7 text-stone-300">
            Level 1 is a concise editorial discovery. It captures season, signal, tension, and boundaries to return your first Brand Mirror.
          </p>
          <Button
            onClick={() => createJourney.mutate()}
            disabled={createJourney.isPending}
            className="mira-l123-cta mt-8 rounded-full px-7 text-amber-50"
          >
            {createJourney.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Begin Discover
            {!createJourney.isPending ? <ArrowRight className="ml-2 size-4" /> : null}
          </Button>
          {createJourney.error ? <p className="mt-4 text-sm text-red-300">Could not open Level 1 right now. Please retry.</p> : null}
        </div>
      </section>
    </Mira123Shell>
  );
}

export function Mira123Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mira-l123-surface min-h-screen px-5 py-7 sm:px-8 sm:py-10">
      <header className="mx-auto mb-10 flex w-full max-w-6xl items-center justify-between">
        <button type="button" onClick={() => window.location.assign("/")} className="mira-display text-2xl text-amber-50">Mira</button>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-amber-100/70">
          <LockKeyhole className="size-3" /> Private
        </div>
      </header>
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-6xl items-start justify-start">
        {children}
      </div>
    </main>
  );
}
