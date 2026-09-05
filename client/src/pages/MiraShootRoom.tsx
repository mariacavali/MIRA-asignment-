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
import { RecordingDemoConversation } from "@/components/mira/RecordingDemoConversation";

// The persistent /prepare/:token Shoot Room. Composes independent modules
// (shoot details, visual references, creative vision, preparation) in a clear
// sequence. Each module fetches its own data by token for decoupling.
// Consent and Call MIRA flow now happen in the welcome section at the top.
export default function MiraShootRoom() {
  // Reached either via the original private /prepare/:token link, or via a
  // server-signed /prepare/access/:signedAccessToken link (e.g. from an
  // outbox reminder email). Both resolve through the same server-side
  // invitation-room lookup, so the room itself doesn't need to know which
  // kind of credential it was handed - it's just "the token" from here on.
  const { token, signedAccessToken } = useParams<{ token?: string; signedAccessToken?: string }>();
  const credential = token ?? signedAccessToken ?? "";
  const invitation = trpc.miraCore.openInvitation.useQuery({ token: credential }, { retry: false });
  const recordingDemo = trpc.recordingDemo.status.useQuery(undefined, { retry: false });
  const isRecordingDemo = recordingDemo.data?.enabled === true;
  const [accepted, setAccepted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversationMode, setConversationMode] = useState<"voice" | "text">("voice");
  const callStateRef = useRef<"idle" | "calling" | "ended">("idle");
  const miraPreparationRef = useRef<HTMLElement>(null);
  const focusMiraPreparation = typeof window !== "undefined" && window.location.hash === "#mira-preparation";
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
      </section>
    </RoomShell>;
  }

  return (
    <RoomShell>
      {/* Welcome section with Call MIRA button */}
      <section id="mira-preparation" ref={miraPreparationRef} tabIndex={-1} aria-label="MIRA preparation">
        <ClientShootRoomWelcome
          photographer={invitation.data.photographer}
          consent={consent}
          onConsentChange={setConsent}
          onCallMira={() => {
            if (!consent) return;
            setConversationMode("voice");
            setIsConnecting(true);
            callStateRef.current = "calling";
          }}
          onTextMira={() => {
            if (!consent) return;
            setConversationMode("text");
            setIsConnecting(true);
            callStateRef.current = "calling";
          }}
          isLoading={isConnecting}
          error={callError}
        />
        {isRecordingDemo ? <RecordingDemoConversation token={credential} consent={consent} onComplete={() => {}} /> : null}
      </section>

      {/* Section 1: Your Shoot Details */}
      <section className="mira-dark-panel mb-20 lg:mb-32">
        <p className="mira-dark-kicker">Your Shoot</p>
        <p className="mt-2 text-sm text-[#b7a98f]">What are we doing?</p>
        <div className="mt-6">
          <YourShootSection data={invitation.data} token={credential} />
        </div>
      </section>

      {/* Section 2: Optional Visual References */}
      <section className="mira-dark-panel mb-20 lg:mb-32">
        <div className="mt-0">
          <VisualReferenceUpload token={credential} />
        </div>
      </section>

      {/* Section 3: Moodboard / Creative Outputs */}
      <section className="mira-dark-panel mb-20 lg:mb-32">
        <p className="mira-dark-kicker">Moodboard</p>
        <p className="mt-2 text-sm text-[#b7a98f]">Your creative direction.</p>
        {isRecordingDemo ? (
          <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[#d2b98b]">
            Demo-local visual assets — real AI image generation not invoked.
          </p>
        ) : null}
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
            callStateRef.current = "calling";
          }}
          className="mt-6 text-[#d2b98b]"
        >
          Talk to MIRA about your moodboard
        </Button>
      </section>

      {/* Section 4: Ready to Shoot */}
      <ReadyToShootSection token={credential} />

      {/* Call MIRA active session overlay - rendered when user initiates call */}
      {callStateRef.current === "calling" && (
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
              callStateRef.current = "ended";
              setIsConnecting(false);
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
