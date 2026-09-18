import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import MiraClientCall from "./MiraClientCall";
import { YourShootSection } from "@/components/mira/YourShootSection";
import { MoodboardGallery } from "@/components/mira/MoodboardGallery";
import { ReadyToShootSection } from "@/components/mira/ReadyToShootSection";
import { deriveClientFacingShootTitle } from "@/components/mira/shootPresentation";
import { VisualReferenceUpload } from "@/components/mira/VisualReferenceUpload";
import { ClientShootRoomWelcome } from "@/components/mira/ClientShootRoomWelcome";
import { ShootPreparationProgress } from "@/components/mira/ShootPreparationProgress";

// The persistent /prepare/:token Shoot Room. Composes independent modules
// (shoot details, visual references, creative vision, preparation) in a clear
// sequence. Each module fetches its own data by token for decoupling.
// Consent and Call MIRA remain together in the preparation step.
export default function MiraShootRoom() {
  // Reached either via the original private /prepare/:token link, or via a
  // server-signed /prepare/access/:signedAccessToken link (e.g. from an
  // outbox reminder email). Both resolve through the same server-side
  // invitation-room lookup, so the room itself doesn't need to know which
  // kind of credential it was handed - it's just "the token" from here on.
  const { token, signedAccessToken } = useParams<{ token?: string; signedAccessToken?: string }>();
  const credential = token ?? signedAccessToken ?? "";
  const invitation = trpc.miraCore.openInvitation.useQuery({ token: credential }, { retry: false });
  const [accepted, setAccepted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversationMode, setConversationMode] = useState<"voice" | "text">("voice");
  const [callActive, setCallActive] = useState(false);
  const miraPreparationRef = useRef<HTMLElement>(null);
  const focusMiraPreparation = typeof window !== "undefined" && window.location.hash === "#mira-preparation";
  const roomStatus = trpc.miraCore.getShootRoomStatus.useQuery({ token: credential }, { enabled: accepted, retry: false });
  const acknowledge = trpc.miraCore.acknowledgeInvitation.useMutation({ onSuccess: () => setAccepted(true) });
  
  useEffect(() => {
    if (invitation.data?.accepted) setAccepted(true);
  }, [invitation.data?.accepted]);

  useEffect(() => {
    if (!accepted || !focusMiraPreparation) return;
    const frame = window.requestAnimationFrame(() => {
      miraPreparationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      miraPreparationRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accepted, focusMiraPreparation]);

  if (invitation.isLoading) {
    return (
      <RoomShell>
        <Loader2 className="size-5 animate-spin text-[#d2b98b]" />
      </RoomShell>
    );
  }

  if (invitation.isError || !invitation.data || invitation.data.status !== "active") {
    return (
      <RoomShell>
        <p className="mira-dark-kicker">Private preparation</p>
        <h1 className="mira-dark-display mt-4 text-4xl text-[#f1eadc]">This Shoot Room is now closed.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#c9c3b7]">Please contact your photographer if you need anything from the session.</p>
      </RoomShell>
    );
  }

  if (!accepted) {
    return <RoomShell>
      <header className="mb-8 text-center"><p className="mira-dark-kicker">MIRA · Private Shoot Room</p><h1 className="mira-dark-display mt-3 text-4xl text-[#f1eadc]">You're invited to prepare for {deriveClientFacingShootTitle(invitation.data.shoot)}.</h1></header>
      <section className="mira-dark-panel">
        <p className="text-sm leading-7 text-[#c9c3b7]">{invitation.data.photographer.businessName || invitation.data.photographer.displayName} has invited you to prepare for this shoot with MIRA.</p>
        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-2"><div><dt className="mira-dark-kicker">Purpose</dt><dd className="mt-1 text-[#f1eadc]">{invitation.data.shoot.intendedUse || "A considered remote photography session"}</dd></div><div><dt className="mira-dark-kicker">When</dt><dd className="mt-1 text-[#f1eadc]">{invitation.data.shoot.scheduledAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: invitation.data.shoot.timezone }).format(new Date(invitation.data.shoot.scheduledAt)) : "Your photographer is still arranging the time"}</dd></div></dl>
        <div className="mt-7 border-t border-white/10 pt-5"><p className="mira-dark-kicker">Before you begin</p><p className="mt-2 text-sm leading-6 text-[#c9c3b7]">MIRA will use what you share to help prepare this shoot. Your answers and references stay connected to this invitation and are visible to your photographer. You can use text instead of a call.</p></div>
        <Button disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ token: credential })} className="mt-7 rounded-full bg-[#d2b98b] text-[#171613]">Accept and enter the room <ArrowRight className="ml-2 size-4" /></Button>
        {acknowledge.isError ? <p role="alert" className="mt-4 text-sm text-red-200">We couldn't open your room. Please try again.</p> : null}
      </section>
    </RoomShell>;
  }

  return (
    <RoomShell>
      <header className="mb-8">
        <p className="mira-dark-kicker">{invitation.data.photographer.businessName || invitation.data.photographer.displayName} · Your private Shoot Room</p>
        <h1 className="mira-dark-display mt-4 text-4xl sm:text-5xl">Let's prepare for your shoot.</h1>
        <p className="mt-4 text-sm leading-7 text-[#c9c3b7]">Follow the three steps below. You can return through the same invitation link.</p>
      </header>
      {roomStatus.data ? <ShootPreparationProgress status={roomStatus.data} /> : <div className="mira-dark-panel mb-8" role="status">
        <p className="text-sm text-[#c9c3b7]">{roomStatus.isError ? "We couldn't load your saved progress." : "Loading your saved progress…"}</p>
        {roomStatus.isError ? <Button variant="ghost" onClick={() => void roomStatus.refetch()} className="mt-3 text-[#d2b98b]">Retry progress</Button> : null}
      </div>}

      <section id="shoot-details" tabIndex={-1} className="mb-8 scroll-mt-6" aria-label="Step 1: Confirm your shoot">
        <YourShootSection data={invitation.data} token={credential} />
        <a href="#mira-preparation" className="mt-4 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-[#d2b98b]">Continue to step 2 <ArrowRight className="size-4" /></a>
      </section>

      <section id="mira-preparation" ref={miraPreparationRef} tabIndex={-1} aria-label="Step 2: Prepare with MIRA" className="mira-dark-panel mb-8 scroll-mt-6">
        <p className="mira-dark-kicker">02 — Prepare with MIRA</p>
        <div className="mb-8 mt-6 border-b border-white/10 pb-8">
          <VisualReferenceUpload token={credential} />
          <a href="#mira-conversation" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-[#d2b98b]">Continue to the conversation — images are optional <ArrowRight className="size-4 shrink-0" /></a>
        </div>
        <div id="mira-conversation" className="scroll-mt-6">
        <ClientShootRoomWelcome
          photographer={invitation.data.photographer}
          consent={consent}
          onConsentChange={setConsent}
          onCallMira={() => {
            if (!consent) return;
            setConversationMode("voice");
            setIsConnecting(true);
            setCallActive(true);
          }}
          onTextMira={() => {
            if (!consent) return;
            setConversationMode("text");
            setIsConnecting(true);
            setCallActive(true);
          }}
          isLoading={isConnecting}
          error={callError}
        />
        </div>
        {roomStatus.data?.creativeDirectionConfirmed ? <p className="mt-6 text-sm text-[#d2b98b]">Your creative direction is confirmed and saved. You can return to MIRA with preparation questions.</p> : null}
        <a href="#shoot-plan" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-[#d2b98b]">View step 3: your moodboard & plan <ArrowRight className="size-4" /></a>
      </section>

      <section id="shoot-plan" tabIndex={-1} className="mira-dark-panel mb-8 scroll-mt-6" aria-label="Step 3: Your moodboard and plan">
        <p className="mira-dark-kicker">03 — Your moodboard & plan</p>
        <p className="mt-2 text-sm leading-6 text-[#b7a98f]">Review your images and preparation guidance here once your conversation summary is confirmed.</p>
        <div className="mt-6">
          <MoodboardGallery token={credential} />
        </div>
        {/* Reuses the same Call/Text MIRA entry points already defined above -
            no new conversation surface, just a clear way back into it once
            there is a moodboard to talk about. */}
        <Button
          variant="ghost"
          disabled={!consent}
          onClick={() => {
            if (!consent) return;
            setConversationMode("voice");
            setIsConnecting(true);
            setCallActive(true);
          }}
          className="mt-6 text-[#d2b98b]"
        >
          Talk to MIRA about your moodboard
        </Button>
        <ReadyToShootSection token={credential} />
      </section>

      {/* Call MIRA active session overlay - rendered when user initiates call */}
      {callActive && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm">
          <MiraClientCall
            token={credential}
            consent={consent}
            initialMode={conversationMode}
            onSessionStart={() => {
              setCallError(null);
            }}
            onSessionError={(error) => {
              setCallError(error);
              setIsConnecting(false);
            }}
            onSessionEnd={() => {
              setCallActive(false);
              setIsConnecting(false);
              void roomStatus.refetch();
              void invitation.refetch();
            }}
          />
        </div>
      )}
    </RoomShell>
  );
}

function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mira-dark-surface min-h-screen px-5 py-12 text-[#f1eadc]">
      <div className="mx-auto max-w-3xl">{children}</div>
    </main>
  );
}
