import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { createPortal } from "react-dom";
import MiraClientCall from "./MiraClientCall";
import { MoodboardGallery } from "@/components/mira/MoodboardGallery";
import { ReadyToShootSection } from "@/components/mira/ReadyToShootSection";
import { deriveClientFacingShootTitle } from "@/components/mira/shootPresentation";
import { VisualReferenceUpload } from "@/components/mira/VisualReferenceUpload";
import { ClientShootRoomWelcome } from "@/components/mira/ClientShootRoomWelcome";
import { ShootPreparationProgress } from "@/components/mira/ShootPreparationProgress";
import { ClientBrandBrief } from "@/components/mira/ClientBrandBrief";
import {
  buildGoogleCalendarUrl,
  downloadIcs,
} from "@/components/mira/calendar";
import {
  getShootCountdown,
  type ClientPreferencesInput,
} from "@shared/miraClientPreferences";
import {
  nextClientJourneyView,
  type ClientJourneyView,
} from "@/lib/clientJourney";
import { formatShootDate } from "@/lib/shootWorkspace";

const primary = "mira-primary min-h-12 rounded-full px-7 text-base";
const secondary = "mira-secondary min-h-12 rounded-full px-6 text-base";

export default function MiraShootRoom() {
  const { token, signedAccessToken } = useParams<{
    token?: string;
    signedAccessToken?: string;
  }>();
  const credential = token ?? signedAccessToken ?? "";
  const invitation = trpc.miraCore.openInvitation.useQuery(
    { token: credential },
    { retry: false }
  );
  const [acceptedHere, setAcceptedHere] = useState(false);
  const accepted = acceptedHere || Boolean(invitation.data?.accepted);
  const roomStatus = trpc.miraCore.getShootRoomStatus.useQuery(
    { token: credential },
    { enabled: accepted, retry: false, refetchInterval: 15000 }
  );
  const preferences = trpc.miraCore.getClientPreparationPreferences.useQuery(
    { token: credential },
    { enabled: accepted, retry: false }
  );
  const savePreferences =
    trpc.miraCore.saveClientPreparationPreferences.useMutation();
  const acknowledge = trpc.miraCore.acknowledgeInvitation.useMutation();
  const respond = trpc.miraCore.respondToShootSchedule.useMutation();
  const [viewOverride, setView] = useState<ClientJourneyView | null>(null);
  const [changeNote, setChangeNote] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversationMode, setConversationMode] = useState<"voice" | "text">(
    "voice"
  );
  const [callActive, setCallActive] = useState(false);
  const [briefPending, setBriefPending] = useState(false);
  const actionLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const view =
    viewOverride ??
    nextClientJourneyView(
      accepted,
      roomStatus.data,
      preferences.data?.preferences
    );
  const busy =
    acknowledge.isPending || respond.isPending || savePreferences.isPending;
  useEffect(() => {
    heading.current?.focus();
    setError(null);
  }, [view]);

  async function save(
    input: ClientPreferencesInput,
    next: ClientJourneyView | null
  ) {
    if (actionLock.current) return;
    actionLock.current = true;
    setError(null);
    try {
      await savePreferences.mutateAsync({ token: credential, input });
      await preferences.refetch();
      setView(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't save that. Please try again."
      );
    } finally {
      actionLock.current = false;
    }
  }
  async function confirm(response: "confirmed" | "change_requested") {
    if (actionLock.current) return;
    actionLock.current = true;
    setError(null);
    try {
      if (!accepted) {
        await acknowledge.mutateAsync({ token: credential });
        setAcceptedHere(true);
      }
      await respond.mutateAsync({
        token: credential,
        input: {
          response,
          note:
            response === "change_requested" ? changeNote?.trim() || null : null,
        },
      });
      await Promise.all([roomStatus.refetch(), preferences.refetch()]);
      setView("calendar");
    } catch {
      setError("We couldn't save your response. Please try again.");
    } finally {
      actionLock.current = false;
    }
  }
  function startConversation(mode: "voice" | "text") {
    if (!consent || briefPending) return;
    setConversationMode(mode);
    setIsConnecting(true);
    setCallActive(true);
  }
  if (invitation.isLoading)
    return (
      <RoomShell>
        <Loader2
          className="size-6 animate-spin"
          aria-label="Opening your shoot"
        />
      </RoomShell>
    );
  if (
    invitation.isError ||
    !invitation.data ||
    invitation.data.status !== "active"
  )
    return (
      <RoomShell>
        <h1 className="mira-dark-display text-4xl">
          We can’t open this Shoot Room.
        </h1>
        <p className="mt-5 text-lg">
          The link may have expired. Ask your photographer for help.
        </p>
        {invitation.isError && (
          <Button
            className={secondary}
            onClick={() => void invitation.refetch()}
          >
            Try again
          </Button>
        )}
      </RoomShell>
    );
  const { shoot, photographer } = invitation.data;
  const name = photographer.businessName || photographer.displayName;
  const scheduledAt = roomStatus.data?.scheduledAt ?? shoot.scheduledAt;
  const timezone = roomStatus.data?.timezone ?? shoot.timezone;
  const countdown = getShootCountdown(scheduledAt, timezone);
  const contactEmail = email ?? preferences.data?.contactEmail ?? "";
  const waitingForData = accepted && (!roomStatus.data || !preferences.data);
  const calendarDetails = scheduledAt
    ? {
        photographerName: name,
        scheduledAt,
        timezone,
        durationMinutes:
          roomStatus.data?.durationMinutes ?? shoot.durationMinutes,
        location: roomStatus.data?.location ?? shoot.location,
        roomUrl: window.location.href.split("#")[0],
      }
    : null;
  const calendarUrl = calendarDetails
    ? buildGoogleCalendarUrl(calendarDetails)
    : null;
  const scheduleChanged =
    roomStatus.data?.scheduleResponse?.response === "change_requested";
  const activeStep = ["confirm", "calendar", "email"].includes(view)
    ? 0
    : view === "review"
      ? 2
      : 1;
  const savedReminder = preferences.data?.preferences.reminderAt;
  const reminderPending = ["pending", "processing"].includes(
    preferences.data?.reminderStatus ?? ""
  );

  return (
    <RoomShell>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-5">
        <span className="mira-dark-display text-3xl">MIRA</span>
        <span className="text-base text-stone-600">
          Your shoot with {name}
          {countdown ? ` · ${countdown}` : ""}
        </span>
      </header>
      {waitingForData ? (
        <section className="mira-dark-panel" role="status">
          <p>Loading your saved choices…</p>
          {(roomStatus.isError || preferences.isError) && (
            <>
              <p className="mt-3">We couldn't load your saved progress.</p>
              <Button
                className={`${secondary} mt-4`}
                onClick={() =>
                  void Promise.all([
                    roomStatus.refetch(),
                    preferences.refetch(),
                  ])
                }
              >
                Try again
              </Button>
            </>
          )}
        </section>
      ) : (
        <section className="mira-dark-panel" aria-labelledby="client-question">
          <p className="text-base text-stone-600">
            Step {activeStep + 1} of 3 ·{" "}
            {activeStep === 0
              ? "About 1 minute"
              : activeStep === 1
                ? "Allow about 10 minutes to prepare"
                : "Your photographer reviews the plan"}
          </p>
          {view === "confirm" && (
            <>
              <h1
                id="client-question"
                ref={heading}
                tabIndex={-1}
                className="mira-dark-display mt-5 text-4xl sm:text-5xl"
              >
                {shoot.clientName ? `Hi ${shoot.clientName}. ` : "Hello. "}
                {name} invited you to a shoot.
              </h1>
              <div className="my-6 rounded-xl bg-stone-50 p-5 text-lg leading-8">
                <p className="font-medium">
                  {deriveClientFacingShootTitle(shoot)}
                </p>
                <p>
                  {formatShootDate(scheduledAt, timezone)} · {timezone}
                </p>
                <p>
                  {shoot.location || "Location to agree with your photographer"}
                </p>
                {shoot.intendedUse && <p>For {shoot.intendedUse}</p>}
              </div>
              <p className="text-xl">Do these details work for you?</p>
              <p className="mt-3 text-base leading-7 text-stone-600">
                I’m MIRA. I’ll help you prepare, then {name} will review the
                plan. Your answers and images stay in this private room and are
                shared with your photographer.
              </p>
              {changeNote === null ? (
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button
                    disabled={busy}
                    className={primary}
                    onClick={() => void confirm("confirmed")}
                  >
                    Yes, confirm my shoot <ArrowRight className="ml-2 size-4" />
                  </Button>
                  <Button
                    disabled={busy}
                    className={secondary}
                    onClick={() => setChangeNote("")}
                  >
                    I need a change
                  </Button>
                </div>
              ) : (
                <form
                  className="mt-6"
                  onSubmit={event => {
                    event.preventDefault();
                    void confirm("change_requested");
                  }}
                >
                  <label className="block text-base">
                    What needs to change?
                    <textarea
                      required
                      maxLength={280}
                      value={changeNote}
                      onChange={event => setChangeNote(event.target.value)}
                      className="mt-3 block min-h-28 w-full rounded-lg border border-stone-300 p-4"
                    />
                  </label>
                  <div className="mt-4 flex gap-3">
                    <Button
                      disabled={busy || !changeNote.trim()}
                      className={primary}
                    >
                      Save my request
                    </Button>
                    <Button
                      type="button"
                      className={secondary}
                      onClick={() => setChangeNote(null)}
                    >
                      Back
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
          {view === "calendar" && (
            <>
              <h1
                id="client-question"
                ref={heading}
                tabIndex={-1}
                className="mira-dark-display mt-5 text-4xl"
              >
                {scheduleChanged
                  ? "Your change request is saved."
                  : "Shall we add it to your calendar?"}
              </h1>
              <p className="mt-5 text-lg leading-8">
                {scheduleChanged
                  ? "Your photographer can see your request. Agree the new details with them before adding the shoot to your calendar."
                  : `${formatShootDate(scheduledAt, timezone)} · ${timezone}`}
              </p>
              {!scheduleChanged && calendarUrl && calendarDetails && (
                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      void save({ calendarChoice: "opened" }, "email")
                    }
                    className={`${primary} inline-flex items-center`}
                  >
                    Google Calendar
                  </a>
                  <Button
                    disabled={busy}
                    className={secondary}
                    onClick={() => {
                      downloadIcs(calendarDetails);
                      void save({ calendarChoice: "opened" }, "email");
                    }}
                  >
                    Apple / Outlook Calendar
                  </Button>
                </div>
              )}
              {!scheduleChanged && calendarUrl && (
                <p className="mt-3 text-base text-stone-600">
                  Finish saving the event in your calendar. Next, choose your
                  email preferences.
                </p>
              )}
              <Button
                disabled={busy}
                className={`${secondary} mt-5`}
                onClick={() => void save({ calendarChoice: "skip" }, "email")}
              >
                {scheduleChanged || !calendarUrl ? "Continue" : "Not now"}
              </Button>
            </>
          )}
          {view === "email" && (
            <>
              <h1
                id="client-question"
                ref={heading}
                tabIndex={-1}
                className="mira-dark-display mt-5 text-4xl"
              >
                Would you like shoot updates by email?
              </h1>
              <p className="mt-5 text-lg leading-8">
                We can remind you about this shoot and let you know when your
                photographer approves the plan. Your choice won’t affect access
                to this room.
              </p>
              <form
                className="mt-6"
                onSubmit={event => {
                  event.preventDefault();
                  void save(
                    { contactEmail: contactEmail.trim(), emailReminders: true },
                    "when"
                  );
                }}
              >
                <label className="block text-base">
                  Your email
                  <input
                    type="email"
                    required
                    maxLength={320}
                    value={contactEmail}
                    onChange={event => setEmail(event.target.value)}
                    className="mt-3 block min-h-12 w-full rounded-lg border border-stone-300 px-4"
                    autoComplete="email"
                  />
                </label>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button disabled={busy} className={primary}>
                    Yes, keep me updated
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    className={secondary}
                    onClick={() => void save({ emailReminders: false }, "when")}
                  >
                    No thanks
                  </Button>
                </div>
              </form>
            </>
          )}
          {(view === "when" || view === "later") && (
            <>
              <h1
                id="client-question"
                ref={heading}
                tabIndex={-1}
                className="mira-dark-display mt-5 text-4xl"
              >
                {view === "later"
                  ? "Come back when you’re ready."
                  : "Shall we prepare now?"}
              </h1>
              <p className="mt-5 text-lg leading-8">
                {countdown ? `Your shoot is ${countdown.toLowerCase()}. ` : ""}
                We’ll talk about the photographs you want, how you want to feel
                and what to wear. Then we’ll prepare your moodboard for {name}{" "}
                to review.
              </p>
              {savedReminder && reminderPending && (
                <p className="mt-5 rounded-lg bg-stone-50 p-4" role="status">
                  {preferences.data?.reminderKind === "preparation"
                    ? "Preparation"
                    : "Shoot"}{" "}
                  reminder scheduled for{" "}
                  {formatShootDate(savedReminder, timezone)} · {timezone}.
                </p>
              )}
              {view === "later" && !reminderPending && (
                <p className="mt-4 text-stone-600">
                  Return through the same invitation link.{" "}
                  {preferences.data?.reminderStatus === "sent" ||
                  preferences.data?.reminderStatus === "delivered"
                    ? "Your reminder has already been sent."
                    : "No preparation reminder is scheduled."}
                </p>
              )}
              <Button
                disabled={busy}
                className={`${primary} mt-7`}
                onClick={() =>
                  void save(
                    { prepareChoice: "now" },
                    roomStatus.data?.creativeDirectionConfirmed
                      ? "review"
                      : "prepare"
                  )
                }
              >
                Let’s prepare <ArrowRight className="ml-2 size-4" />
              </Button>
              {view === "when" && (
                <div className="mt-4 grid justify-items-start gap-3">
                  {preferences.data?.preferences.emailReminders &&
                    preferences.data.reminderOptions.map(option => (
                      <Button
                        key={option.choice}
                        disabled={busy}
                        className={`${secondary} h-auto whitespace-normal py-3 text-left`}
                        onClick={() =>
                          void save(
                            {
                              prepareChoice: "later",
                              reminderChoice: option.choice,
                            },
                            "later"
                          )
                        }
                      >
                        Remind me {option.label.toLowerCase()}
                      </Button>
                    ))}
                  <Button
                    disabled={busy}
                    className={secondary}
                    onClick={() =>
                      void save({ prepareChoice: "later" }, "later")
                    }
                  >
                    I’ll return myself
                  </Button>
                </div>
              )}
              <button
                className="mt-6 block min-h-11 underline underline-offset-4"
                onClick={() => setView("email")}
              >
                Email preferences
              </button>
            </>
          )}
          {view === "prepare" && (
            <>
              <h1
                id="client-question"
                ref={heading}
                tabIndex={-1}
                className="mira-dark-display mt-5 text-4xl"
              >
                Let’s plan your shoot.
              </h1>
              <p className="mt-4 text-lg leading-8">
                You don’t need perfect answers or experience in front of a
                camera. I’ll guide you one question at a time.
              </p>
              <details className="my-6 rounded-lg border border-stone-200 p-5">
                <summary className="cursor-pointer text-lg">
                  Add photos or brand details · optional · about 2 minutes
                </summary>
                <p className="my-4 text-base text-stone-600">
                  Your location, clothes, a photo of you or images you like can
                  help shape the plan.
                </p>
                <ClientBrandBrief
                  key={credential}
                  token={credential}
                  confirmed={
                    roomStatus.data?.creativeDirectionConfirmed ?? false
                  }
                  onPendingChange={setBriefPending}
                />
                <VisualReferenceUpload token={credential} />
              </details>
              {briefPending && (
                <p role="status" className="mb-4">
                  Save or discard your photo and brand choices before starting.
                </p>
              )}
              <ClientShootRoomWelcome
                photographer={photographer}
                consent={consent}
                onConsentChange={setConsent}
                onCallMira={() => startConversation("voice")}
                onTextMira={() => startConversation("text")}
                isLoading={isConnecting || briefPending}
                error={callError}
              />
              <p className="mt-6 text-base text-stone-600">
                Next: confirm your conversation summary. MIRA will prepare your
                moodboard and {name} will review it.
              </p>
              {roomStatus.data?.creativeDirectionConfirmed && (
                <Button
                  className={`${primary} mt-5`}
                  onClick={() => setView("review")}
                >
                  See my shoot plan
                </Button>
              )}
            </>
          )}
          {view === "review" && (
            <>
              <h1
                id="client-question"
                ref={heading}
                tabIndex={-1}
                className="mira-dark-display mt-5 text-4xl"
              >
                {roomStatus.data?.readyToShoot
                  ? "You’re ready for your shoot."
                  : "Your plan, ready for the next step."}
              </h1>
              <p className="mt-5 text-lg leading-8">
                {roomStatus.data?.readyToShoot
                  ? `${name} has approved your preparation. They’ll guide you during the shoot.`
                  : `Your saved preparation is shared with ${name}. They’ll review your moodboard and confirm when you’re ready.`}
              </p>
              <div className="mt-7">
                <MoodboardGallery token={credential} />
                <ReadyToShootSection token={credential} />
              </div>
              <button
                className="mt-6 min-h-11 underline underline-offset-4"
                onClick={() => setView("prepare")}
              >
                Ask MIRA a preparation question
              </button>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-red-300 p-4 text-red-800"
            >
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="mt-4 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </p>
          )}
        </section>
      )}
      {roomStatus.data && (
        <div className="mt-8">
          <ShootPreparationProgress
            status={roomStatus.data}
            activeStep={activeStep}
            onStepChange={index => {
              if (briefPending) {
                setError(
                  "Save or discard your changes before leaving this step."
                );
                return;
              }
              if (index > 0 && !roomStatus.data?.scheduleResponse) {
                setView("confirm");
                return;
              }
              if (index > 0 && !preferences.data?.preferences.calendarChoice) {
                setView("calendar");
                return;
              }
              if (
                index > 0 &&
                preferences.data?.preferences.emailReminders === null
              ) {
                setView("email");
                return;
              }
              setView(
                index === 0
                  ? "confirm"
                  : index === 1
                    ? preferences.data?.preferences.prepareChoice === "now"
                      ? "prepare"
                      : "when"
                    : "review"
              );
            }}
          />
        </div>
      )}
      <p className="mt-6 text-center text-base text-stone-600">
        One shoot. One private link. Your progress stays here.
      </p>
      {accepted && !["email", "when", "later"].includes(view) && (
        <button
          className="mx-auto mt-3 block min-h-11 underline underline-offset-4"
          disabled={briefPending}
          onClick={() => setView("email")}
        >
          Email preferences
        </button>
      )}
      {callActive &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm">
            <MiraClientCall
              token={credential}
              consent={consent}
              initialMode={conversationMode}
              onSessionStart={() => setCallError(null)}
              onSessionError={cause => {
                setCallError(cause);
                setIsConnecting(false);
              }}
              onSessionEnd={() => {
                setCallActive(false);
                setIsConnecting(false);
                void roomStatus.refetch().then(result => {
                  if (result.data?.creativeDirectionConfirmed)
                    setView("review");
                });
                void invitation.refetch();
              }}
            />
          </div>,
          document.body
        )}
    </RoomShell>
  );
}
function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mira-light-surface min-h-screen px-5 py-7 sm:py-12">
      <div className="mira-light-content mx-auto max-w-3xl">{children}</div>
    </main>
  );
}
