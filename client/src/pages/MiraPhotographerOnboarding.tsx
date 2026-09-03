import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { normalizeInstagramUsername, normalizeWebsiteUrl } from "@shared/miraCore";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function MiraPhotographerOnboarding() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [photographyStyle, setPhotographyStyle] = useState("");
  const [areasOfExpertise, setAreasOfExpertise] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const save = trpc.miraCore.savePhotographerProfile.useMutation({ onSuccess: () => navigate("/mira/dashboard") });
  const access = trpc.miraCore.getPhotographerAccess.useQuery(undefined, { enabled: Boolean(user), retry: false });

  if (loading || access.isLoading) return <PhotographerShell><Loader2 className="size-5 animate-spin" /></PhotographerShell>;
  if (!user) return <PhotographerShell><p>Please log in to continue.</p></PhotographerShell>;
  if (access.data?.paymentStatus === "unpaid") return <PhotographerShell><section className="mira-dark-panel text-center"><h1 className="mira-dark-display text-4xl">Activate MIRA Studio before setting up your profile.</h1><Button asChild className="mt-7 rounded-full bg-[#d2b98b] text-[#171613]"><a href="/mira/checkout">Buy MIRA</a></Button></section></PhotographerShell>;

  return <PhotographerShell>
    <section className="mira-dark-panel max-w-2xl">
      <p className="mira-dark-kicker">Studio profile</p>
      <h1 className="mira-dark-display mt-6 text-5xl sm:text-6xl">Tell MIRA about your studio.</h1>
      <p className="mt-6 max-w-xl text-sm leading-7 text-[#c9c3b7]">This information helps MIRA welcome and prepare your clients for their shoots.</p>
      <form className="mt-10 grid gap-6" onSubmit={event => {
        event.preventDefault();
        setValidationMessage(null);
        let normalizedWebsite: string | null;
        let normalizedInstagram: string | null;
        try {
          normalizedWebsite = normalizeWebsiteUrl(websiteUrl);
          normalizedInstagram = normalizeInstagramUsername(instagramUrl);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "Please check the optional profile links.");
          return;
        }
        save.mutate({
          displayName,
          businessName: businessName.trim() || null,
          bio: bio.trim() || null,
          photographyStyle: photographyStyle.trim() || null,
          areasOfExpertise: areasOfExpertise.split(",").map(value => value.trim()).filter(Boolean),
          websiteUrl: normalizedWebsite,
          instagramUrl: normalizedInstagram,
          timezone,
        });
      }}>
        <DarkField label="Photographer name"><Input value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={160} /></DarkField>
        <DarkField label="Business name · optional"><Input value={businessName} onChange={event => setBusinessName(event.target.value)} maxLength={200} /></DarkField>
        <DarkField label="Short bio"><Textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={2000} /></DarkField>
        <DarkField label="Photography style"><Textarea value={photographyStyle} onChange={event => setPhotographyStyle(event.target.value)} maxLength={1200} /></DarkField>
        <DarkField label="Areas of expertise · comma separated"><Input value={areasOfExpertise} onChange={event => setAreasOfExpertise(event.target.value)} /></DarkField>
        <DarkField label="Website · optional"><Input type="text" inputMode="url" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="www.example.com" /></DarkField>
        <DarkField label="Instagram · optional"><Input type="text" value={instagramUrl} onChange={event => setInstagramUrl(event.target.value)} placeholder="@username" /></DarkField>
        <DarkField label="Timezone"><Input value={timezone} onChange={event => setTimezone(event.target.value)} required maxLength={128} /></DarkField>
        <Button disabled={save.isPending} className="mt-2 w-fit rounded-full bg-[#d2b98b] px-7 text-[#171613] hover:bg-[#e0c99e]">
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Complete onboarding <ArrowRight className="ml-2 size-4" />
        </Button>
        {save.error ? <p className="text-sm text-red-300">{save.error.message}</p> : null}
        {validationMessage ? <p role="alert" className="text-sm text-red-300">{validationMessage}</p> : null}
      </form>
    </section>
  </PhotographerShell>;
}

export function PhotographerShell({ children }: { children: React.ReactNode }) {
  return <main className="mira-dark-surface min-h-screen px-5 py-7 text-[#f1eadc] sm:px-10">
    <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/10 pb-6">
      <button onClick={() => window.location.assign("/mira")} className="mira-dark-display text-2xl">MIRA</button>
      <span className="text-right text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Shoot preparation</span>
    </header>
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center justify-center py-12">{children}</div>
  </main>;
}

function DarkField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-[10px] uppercase tracking-[0.2em] text-[#b7a98f]">{label}{children}</label>;
}
