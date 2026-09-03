import { Button } from "@/components/ui/button";
import { ArrowRight, Camera, CheckCircle2, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PhotographerShell } from "./MiraPhotographerOnboarding";

export default function MiraPhotographerHome() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const access = trpc.miraCore.getPhotographerAccess.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const profile = trpc.miraCore.getPhotographerProfile.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const reset = trpc.miraCore.resetLocalPhotographerJourney.useMutation({ onSuccess: () => { void access.refetch(); void profile.refetch(); } });

  if (loading || access.isLoading || profile.isLoading) return <PhotographerShell><span className="text-sm text-[#bdb6a9]">Loading your studio...</span></PhotographerShell>;
  if (!user) return null;

  const paid = access.data?.paymentStatus !== "unpaid";
  const onboarded = profile.data?.onboardingStatus === "complete";
  return <PhotographerShell>
    <section className="w-full max-w-5xl">
      <p className="mira-dark-kicker">For remote photographers</p>
      <h1 className="mira-dark-display mt-6 max-w-3xl text-5xl leading-tight sm:text-7xl">Give every shoot a thoughtful beginning.</h1>
      <p className="mt-7 max-w-2xl text-base leading-7 text-[#c9c3b7]">MIRA prepares clients before the camera comes on, gathering creative and practical information conversationally, shaping the moodboard and shoot plan, and staying with them until shoot day.</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <Feature icon={<Camera />} title="Less repetition" text="Let MIRA handle the preparation conversations while you keep creative control." />
        <Feature icon={<CheckCircle2 />} title="Clearer shoots" text="Arrive with shared direction, practical readiness and fewer loose ends." />
        <Feature icon={<LockKeyhole />} title="One private room" text="Give each client a calm space that belongs to their shoot." />
      </div>
      <section className="mt-16 border-y border-white/10 py-10"><p className="mira-dark-kicker">How MIRA works</p><div className="mt-7 grid gap-8 sm:grid-cols-3"><Step number="01" title="Create the shoot" text="Add the purpose, timing and practical details once." /><Step number="02" title="Invite your client" text="MIRA gives them one private preparation room." /><Step number="03" title="Arrive ready to photograph" text="Review what matters before your session begins." /></div></section>
      <div className="mx-auto mt-14 max-w-2xl border border-[#d2b98b]/40 bg-[#d2b98b] p-8 text-[#171613] sm:p-10"><p className="text-[10px] uppercase tracking-[0.2em] text-[#5d503b]">One photographer plan</p><h2 className="mira-dark-display mt-5 text-4xl">MIRA Studio</h2><p className="mt-4 text-sm leading-6 text-[#4b4234]">A private preparation room for every client, creative and practical preparation before shoot day, and a workflow where you keep review and creative control.</p><p className="mt-7 border-t border-[#8d7956]/35 pt-5 text-sm font-medium">Founding access</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild className="rounded-full bg-[#171613] text-[#f1eadc]"><a href="/mira/checkout">Buy MIRA <ArrowRight className="ml-2 size-4" /></a></Button>{paid && onboarded ? <Button onClick={() => navigate("/mira/dashboard")} variant="outline" className="rounded-full border-[#8d7956]/50 bg-transparent text-[#4b4234]">Photographer login</Button> : null}</div></div>
      {import.meta.env.DEV ? <div className="fixed bottom-4 right-4 z-20 border border-white/15 bg-[#171716]/95 px-3 py-2 text-[10px] text-[#9e978b] shadow-xl"><span>Development tools</span><button type="button" onClick={() => reset.mutate()} className="ml-3 text-[#d2b98b] underline underline-offset-2">Start fresh test journey</button></div> : null}
    </section>
  </PhotographerShell>;
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="border-t border-white/15 pt-5"><span className="text-[#d2b98b]">{icon}</span><h2 className="mira-dark-display mt-5 text-2xl">{title}</h2><p className="mt-3 text-sm leading-6 text-[#a9a296]">{text}</p></article>; }
function Step({ number, title, text }: { number: string; title: string; text: string }) { return <article><p className="text-xs tracking-[0.18em] text-[#d2b98b]">{number}</p><h2 className="mira-dark-display mt-4 text-2xl">{title}</h2><p className="mt-3 text-sm leading-6 text-[#a9a296]">{text}</p></article>; }
