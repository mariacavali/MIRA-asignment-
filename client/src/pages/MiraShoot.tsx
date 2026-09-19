import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MoodboardShotCard } from "@/components/mira/MoodboardShotCard";
import { ReferenceBatchUpload } from "@/components/mira/ReferenceBatchUpload";
import { ReferenceThumbnail } from "@/components/mira/VisualReferenceUpload";
import { EmailSequencePreview } from "@/components/mira/EmailSequencePreview";
import { getShootPreparationProgress } from "@shared/shootPreparationProgress";
import { trpc } from "@/lib/trpc";
import {
  formatShootDate,
  readShootDirection,
  shootWorkspaceProgress,
  type ShootStep,
} from "@/lib/shootWorkspace";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { PhotographerShell } from "./MiraPhotographerOnboarding";

const goldButton =
  "min-h-11 rounded-full bg-[#d2b98b] px-6 text-[#171613] hover:bg-[#e0c99e]";
const quietButton =
  "min-h-11 rounded-full border border-white/20 bg-transparent text-[#ded5c5] hover:bg-white/5";
const steps = [
  "Invite your client",
  "Prepare together",
  "Approve and shoot",
] as const;

export default function MiraShoot() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ shootId: string }>();
  const shootId = Number(params.shootId);
  const [, navigate] = useLocation();
  const enabled = Boolean(user) && Number.isInteger(shootId);
  const [selectedStep, setSelectedStep] = useState<ShootStep | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imageStates, setImageStates] = useState<Record<string, boolean>>({});
  const [contact, setContact] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    invitationMessage: "",
  });
  const actionLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const state = trpc.miraCore.getShoot.useQuery(
    { shootId },
    { enabled, retry: false }
  );
  const creativeDna = trpc.miraCore.getShootCreativeDna.useQuery(
    { shootId },
    { enabled, retry: false }
  );
  const moodboard = trpc.miraCore.getShootMoodboard.useQuery(
    { shootId },
    { enabled, retry: false }
  );
  const inspection = trpc.miraCore.getShootQaInspection.useQuery(
    { shootId },
    { enabled, retry: false }
  );
  const qaEvents = trpc.miraCore.listRealtimeQaEvents.useQuery(
    { shootId },
    { enabled: enabled && showNotes, retry: false }
  );
  const deleteQaEvents = trpc.miraCore.deleteRealtimeQaEvents.useMutation({
    onSuccess: () => qaEvents.refetch(),
  });
  const updateContact = trpc.miraCore.updateShootContact.useMutation({
    onSuccess: () => state.refetch(),
  });
  const markReady = trpc.miraCore.markShootReadyToShoot.useMutation({
    onSuccess: () => state.refetch(),
  });
  const uploadReference =
    trpc.miraCore.uploadShootVisualReference.useMutation();
  const analyzeReference =
    trpc.miraCore.analyzeShootVisualReference.useMutation({
      onSuccess: () => inspection.refetch(),
    });
  const invitation = trpc.miraCore.createInvitation.useMutation();
  const sendInvitation = trpc.miraCore.sendInvitation.useMutation();

  useEffect(() => {
    if (!state.data) return;
    const shoot = state.data.shoot;
    setContact({
      clientName: shoot.clientName || "",
      clientEmail: shoot.clientEmail || "",
      clientPhone: shoot.clientPhone || "",
      invitationMessage: shoot.invitationMessage || "",
    });
    setSelectedStep(null);
    setMessage(null);
    setLink(null);
  }, [state.data?.shoot.id]);
  useEffect(() => {
    const previous = state.data?.invitations[0];
    const path =
      previous && "preparationUrl" in previous ? previous.preparationUrl : null;
    setLink(
      typeof path === "string"
        ? new URL(path, window.location.origin).href
        : null
    );
    setShareMessage(null);
  }, [state.data?.invitations]);
  useEffect(() => {
    if (selectedStep !== null) heading.current?.focus();
  }, [selectedStep]);

  if (loading || state.isLoading)
    return (
      <PhotographerShell workspace>
        <p role="status" className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Loading your shoot…
        </p>
      </PhotographerShell>
    );
  if (!state.data)
    return (
      <PhotographerShell workspace>
        <div>
          <p role="alert">We couldn't open this shoot.</p>
          <a
            href="/mira/dashboard"
            className="mt-4 block text-[#d2b98b] underline"
          >
            Back to my shoots
          </a>
        </div>
      </PhotographerShell>
    );
  const { shoot, invitations } = state.data;
  const latestInvitation = invitations[0];
  const sent = Boolean(
    latestInvitation &&
      [
        "queued",
        "sent",
        "delivered",
        "opened",
        "preparation_in_progress",
        "completed",
      ].includes(latestInvitation.deliveryStatus)
  );
  const record = creativeDna.data?.[0];
  const direction =
    record?.status === "complete"
      ? readShootDirection(record.creativeDnaJson)
      : null;
  const images = moodboard.data?.images ?? [];
  const imageFailure = images.some(
    image => imageStates[`${image.id}:${image.url}`] === false
  );
  const imagesLoaded =
    images.length > 0 &&
    images.every(image => imageStates[`${image.id}:${image.url}`] === true);
  const renderFailed = ["failed", "not_configured"].includes(
    moodboard.data?.renderStatus ?? ""
  );
  const setupProgress = shootWorkspaceProgress({
    clientName: shoot.clientName,
    clientEmail: shoot.clientEmail,
    deliveryStatus: latestInvitation?.deliveryStatus,
    ready: shoot.status === "ready_to_shoot",
  });
  const referenceRows = (inspection.data?.visualReferences ?? []) as Array<{
    id: string;
    originalName: string;
    uploaderRole: string;
    clientDescription?: string | null;
    storageKey?: string;
    dataUrl?: string;
    analysisJson?: unknown;
  }>;
  const scheduleResponse = state.data.roomStatus.scheduleResponse
    ? [
        state.data.roomStatus.scheduleResponse.response,
        state.data.roomStatus.scheduleResponse.note ?? "",
      ]
    : null;
  const sharedProgress = getShootPreparationProgress(state.data.roomStatus);
  const next: ShootStep = !setupProgress.completed[1] ? 1 : !direction ? 2 : 3;
  const progress = {
    completed: sharedProgress.steps.map(step => step.complete),
    done: sharedProgress.completed,
    percent: sharedProgress.percent,
    next,
  };
  const currentStep = selectedStep ?? next;
  const changed =
    contact.clientName.trim() !== (shoot.clientName || "") ||
    contact.clientEmail.trim() !== (shoot.clientEmail || "") ||
    contact.clientPhone.trim() !== (shoot.clientPhone || "") ||
    contact.invitationMessage.trim() !== (shoot.invitationMessage || "");
  const busy =
    updateContact.isPending || sendInvitation.isPending || invitation.isPending;
  const reviewError =
    creativeDna.isError || moodboard.isError || inspection.isError;
  const canMarkReady =
    setupProgress.completed[0] &&
    setupProgress.completed[1] &&
    scheduleResponse?.[0] === "confirmed" &&
    Boolean(direction) &&
    imagesLoaded &&
    !renderFailed &&
    !reviewError &&
    shoot.roomState === "preparation_active";
  const nextMessage =
    imageFailure || renderFailed
      ? "The moodboard needs attention. Your saved preparation is still here."
      : reviewError
        ? "We couldn't load all preparation details. Refresh to check again."
        : shoot.status === "ready_to_shoot"
          ? "You have marked this shoot ready."
          : progress.next === 1
            ? "Next: check the details and send your client their private invitation."
            : progress.next === 2
              ? "Your client confirms the shoot, then MIRA helps them prepare. Their plan will appear here."
              : !direction
                ? "Waiting for your client to finish and confirm their preparation."
                : "Next: review the direction and images, then mark the shoot ready.";

  async function saveDetails() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMessage(null);
    try {
      await updateContact.mutateAsync({
        shootId,
        clientName: contact.clientName.trim() || null,
        clientEmail: contact.clientEmail.trim() || null,
        clientPhone: contact.clientPhone.trim() || null,
        invitationMessage: contact.invitationMessage.trim() || null,
      });
      setMessage("Client details saved.");
      setSelectedStep(1);
    } catch {
      setMessage(
        "We couldn't save the details. Check the email address and try again."
      );
    } finally {
      actionLock.current = false;
    }
  }
  async function send() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMessage(null);
    try {
      const result = await sendInvitation.mutateAsync({
        shootId,
        expiresInDays: 7,
        force: sent,
      });
      setLink(result.preparationUrl);
      setMessage(
        result.deliveryError ??
          "Invitation sent. Your client can now open their Shoot Room."
      );
      await state.refetch();
      if (!result.deliveryError) setSelectedStep(2);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The invitation couldn't be sent. Please try again."
      );
    } finally {
      actionLock.current = false;
    }
  }
  async function makeLink() {
    if (actionLock.current) return;
    actionLock.current = true;
    try {
      const result = await invitation.mutateAsync({
        shootId,
        expiresInDays: 7,
      });
      setLink(`${window.location.origin}/prepare/${result.token}`);
      setMessage("Private link created. No email was sent.");
      await state.refetch();
    } catch {
      setMessage("We couldn't create the link. Please try again.");
    } finally {
      actionLock.current = false;
    }
  }
  function refresh() {
    void state.refetch();
    void creativeDna.refetch();
    void moodboard.refetch();
    void inspection.refetch();
  }

  return (
    <PhotographerShell workspace>
      <div className="w-full max-w-5xl">
        <button
          onClick={() => navigate("/mira/dashboard")}
          className="flex min-h-11 items-center gap-2 text-sm text-[#b7a98f]"
        >
          <ArrowLeft className="size-4" />
          My shoots
        </button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mira-dark-display break-words text-4xl sm:text-5xl">
              {shoot.title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">
              {shoot.clientName || "Client details needed"} ·{" "}
              {formatShootDate(shoot.scheduledAt, shoot.timezone)} ·{" "}
              {shoot.timezone}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={
              state.isFetching ||
              moodboard.isFetching ||
              creativeDna.isFetching ||
              inspection.isFetching
            }
            className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-[#c5bfb3]"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </div>
        <section
          className="mt-6 rounded-lg border border-white/15 p-4 sm:p-5"
          aria-label="Shoot progress"
        >
          <div className="flex justify-between gap-3 text-sm">
            <p>{progress.done} of 3 steps complete</p>
            <p className="text-[#d2b98b]">{progress.percent}%</p>
          </div>
          <progress
            max={100}
            value={progress.percent}
            aria-label="Shoot workflow progress"
            className="mt-3 h-2 w-full accent-[#d2b98b]"
          />
          <nav
            className="mt-4 grid gap-2 sm:grid-cols-3"
            aria-label="Shoot steps"
          >
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-current={currentStep === index + 1 ? "step" : undefined}
                aria-controls="shoot-step-panel"
                onClick={() => {
                  setSelectedStep((index + 1) as ShootStep);
                  setMessage(null);
                }}
                className={`flex min-h-14 items-center gap-3 rounded-lg border p-3 text-left text-sm ${currentStep === index + 1 ? "border-[#d2b98b] bg-[#d2b98b]/10 text-[#f1eadc]" : "border-white/10 text-[#b7a98f]"}`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current">
                  {progress.completed[index] ? (
                    <Check className="size-4" aria-label="Complete" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>
                  {label}
                  <span className="mt-1 block text-xs">
                    {progress.completed[index]
                      ? "Complete"
                      : index === 0 && setupProgress.completed[1]
                        ? scheduleResponse?.[0] === "change_requested"
                          ? "Change requested"
                          : "Sent · waiting for confirmation"
                        : index + 1 === progress.next
                          ? "Next step"
                          : "To do"}
                  </span>
                </span>
              </button>
            ))}
          </nav>
          <p className="mt-4 text-sm leading-6 text-[#ded5c5]">{nextMessage}</p>
        </section>
        {(link || latestInvitation) && (
          <section
            className="mt-5 rounded-xl border border-stone-200 bg-white p-5"
            aria-labelledby="client-link-title"
          >
            <h2 id="client-link-title" className="text-lg font-medium">
              Your client’s private link
            </h2>
            {link ? (
              <>
                <p className="mt-2 text-base">
                  Email missed? Copy this link and send it through WhatsApp or
                  any message.
                </p>
                <Input
                  ref={linkField}
                  aria-label="Private client invitation link"
                  readOnly
                  value={link}
                  onFocus={event => event.currentTarget.select()}
                  className="mt-4 min-h-12 w-full"
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className={goldButton}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setShareMessage(
                          "Link copied. Paste it into your message."
                        );
                      } catch {
                        linkField.current?.focus();
                        linkField.current?.select();
                        setShareMessage(
                          "The link is selected. Press ⌘C on Mac or Ctrl+C to copy it."
                        );
                      }
                    }}
                  >
                    <Copy className="mr-2 size-4" />
                    Copy link
                  </Button>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center ${quietButton} px-5`}
                  >
                    Open client room <ArrowRight className="ml-2 size-4" />
                  </a>
                </div>
                <p className="mt-3 text-sm text-stone-600">
                  Share only with this client. It opens the same Shoot Room.
                </p>
                {shareMessage && (
                  <p role="status" className="mt-3 text-base">
                    {shareMessage}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2">
                {latestInvitation?.status === "active"
                  ? "This link could not be restored. Try Refresh above."
                  : "This invitation is no longer active."}
              </p>
            )}
          </section>
        )}
        {message && (
          <p
            role="status"
            className="mt-4 rounded border border-[#d2b98b]/30 p-4 text-sm leading-6 text-[#ded5c5]"
          >
            {message}
          </p>
        )}
        <section
          id="shoot-step-panel"
          aria-labelledby="shoot-step-heading"
          className="mira-dark-panel mt-5 p-5 sm:p-8"
        >
          <p className="mira-dark-kicker">Step {currentStep} of 3</p>
          <h2
            id="shoot-step-heading"
            ref={heading}
            tabIndex={-1}
            className="mira-dark-display mt-3 text-3xl outline-none"
          >
            {steps[currentStep - 1]}
          </h2>
          {currentStep === 1 && (
            <>
              <p className="mt-3 text-sm text-[#c5bfb3]">
                Check the shoot details, then send the invitation. MIRA will
                guide them through confirming the shoot, preparing together and
                reviewing their plan.
              </p>
              <dl className="mt-5 grid gap-4 border-y border-white/10 py-5 sm:grid-cols-2">
                <Detail
                  label="Shoot date"
                  value={formatShootDate(shoot.scheduledAt, shoot.timezone)}
                />
                <Detail
                  label="Location"
                  value={shoot.location || "To be agreed"}
                />
              </dl>
              <details
                className="mt-5"
                open={!setupProgress.completed[0] || undefined}
              >
                <summary className="cursor-pointer py-2">
                  Client details · {shoot.clientName || "Add your client"}
                </summary>
                <form
                  className="mt-5 grid gap-4"
                  onSubmit={event => {
                    event.preventDefault();
                    void saveDetails();
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ContactField label="Client name">
                      <Input
                        required
                        maxLength={160}
                        value={contact.clientName}
                        onChange={event =>
                          setContact({
                            ...contact,
                            clientName: event.target.value,
                          })
                        }
                      />
                    </ContactField>
                    <ContactField label="Client email">
                      <Input
                        required
                        type="email"
                        maxLength={320}
                        value={contact.clientEmail}
                        onChange={event =>
                          setContact({
                            ...contact,
                            clientEmail: event.target.value,
                          })
                        }
                      />
                    </ContactField>
                  </div>
                  <details className="border-t border-white/10 pt-3">
                    <summary className="cursor-pointer py-2 text-sm text-[#d2b98b]">
                      Add a message or phone number · optional
                    </summary>
                    <div className="mt-3 grid gap-4">
                      <ContactField label="Personal invitation message">
                        <Textarea
                          maxLength={800}
                          value={contact.invitationMessage}
                          onChange={event =>
                            setContact({
                              ...contact,
                              invitationMessage: event.target.value,
                            })
                          }
                        />
                      </ContactField>
                      <ContactField label="Client phone">
                        <Input
                          type="tel"
                          maxLength={32}
                          value={contact.clientPhone}
                          onChange={event =>
                            setContact({
                              ...contact,
                              clientPhone: event.target.value,
                            })
                          }
                        />
                      </ContactField>
                    </div>
                  </details>
                  <Button
                    disabled={busy}
                    type="submit"
                    className={`w-fit ${goldButton}`}
                  >
                    {updateContact.isPending ? "Saving…" : "Save and continue"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </form>
              </details>
            </>
          )}
          {currentStep === 1 && (
            <>
              <p className="mt-4 text-sm leading-6 text-[#c5bfb3]">
                {setupProgress.completed[1]
                  ? "Your client has been invited. MIRA will guide them through their preparation."
                  : "Send one email with a private link. MIRA guides your client from there."}
              </p>
              <p className="mt-5 break-words text-[#ded5c5]">
                {shoot.clientName || "Client not set"}
                <span className="mt-1 block text-sm text-[#b7a98f]">
                  {shoot.clientEmail || "Add their email above"}
                </span>
              </p>
              {latestInvitation && (
                <p className="mt-3 text-sm text-[#b7a98f]">
                  {invitationStatus(latestInvitation.deliveryStatus)}
                </p>
              )}
              {changed && (
                <p className="mt-3 text-sm text-[#d2b98b]">
                  Save the changes under Client details before sending.
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                {!setupProgress.completed[1] && (
                  <Button
                    onClick={() => void send()}
                    disabled={busy || changed || !setupProgress.completed[0]}
                    className={goldButton}
                  >
                    {sendInvitation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 size-4" />
                    )}
                    {sent ? "Resend invitation" : "Send invitation"}
                  </Button>
                )}
                {setupProgress.completed[1] && (
                  <Button
                    onClick={() => setSelectedStep(3)}
                    className={goldButton}
                  >
                    Review preparation
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                )}
              </div>
              <details className="mt-6 border-t border-white/10 pt-3">
                <summary className="cursor-pointer py-2 text-sm text-[#d2b98b]">
                  More invitation options
                </summary>
                <div className="mt-3 flex flex-wrap gap-3">
                  {!latestInvitation && !link && (
                    <Button
                      variant="outline"
                      disabled={busy || changed}
                      onClick={() => void makeLink()}
                      className={quietButton}
                    >
                      Create a link to share myself
                    </Button>
                  )}
                  {setupProgress.completed[1] && (
                    <Button
                      variant="outline"
                      onClick={() => void send()}
                      disabled={busy || changed}
                      className={quietButton}
                    >
                      Resend invitation
                    </Button>
                  )}
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer py-2 text-sm text-[#b7a98f]">
                    Preview reminder timing
                  </summary>
                  <p className="mt-2 text-xs text-[#9e978b]">
                    Preview only. This does not confirm email delivery.
                  </p>
                  <EmailSequencePreview
                    scheduledAt={shoot.scheduledAt}
                    timezone={shoot.timezone}
                    clientEmail={shoot.clientEmail}
                  />
                </details>
              </details>
            </>
          )}
          {currentStep === 2 && (
            <>
              <p className="mt-5 text-lg leading-8">
                Your client’s next step is to confirm the shoot and choose when
                to prepare. MIRA will ask about their goals, help them feel
                comfortable and prepare a moodboard from their confirmed
                direction.
              </p>
              <p className="mt-5 rounded-lg border border-stone-200 p-4">
                {scheduleResponse?.[0] === "confirmed"
                  ? "Shoot details confirmed by your client."
                  : scheduleResponse?.[0] === "change_requested"
                    ? `Your client requested a change: ${scheduleResponse[1] || "Please contact them to agree the details."}`
                    : "Waiting for your client to confirm the shoot."}
              </p>
              {shoot.photographerNotes && (
                <details className="mt-5">
                  <summary className="cursor-pointer py-2">
                    What MIRA knows from you
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap">
                    {shoot.photographerNotes}
                  </p>
                </details>
              )}
              <p className="mt-5">
                Next: review their moodboard and preparation here, then approve
                the shoot.
              </p>
              <Button
                className={`${goldButton} mt-6`}
                onClick={() => setSelectedStep(3)}
              >
                View preparation <ArrowRight className="ml-2 size-4" />
              </Button>
              <button
                className="mt-4 block min-h-11 underline"
                onClick={() => setSelectedStep(1)}
              >
                Invitation details
              </button>
            </>
          )}
          {currentStep === 3 && (
            <>
              {scheduleResponse && (
                <p className="mt-4 rounded border border-white/15 p-3 text-sm text-[#ded5c5]">
                  {scheduleResponse[0] === "confirmed"
                    ? "Client confirmed the date, time and location."
                    : `Client requested a schedule change${scheduleResponse[1] ? `: ${scheduleResponse[1]}` : "."}`}
                </p>
              )}
              {creativeDna.isLoading ? (
                <p className="mt-4 text-sm text-[#b7a98f]">
                  Loading the shoot direction…
                </p>
              ) : direction ? (
                <div className="mt-5">
                  <p className="text-base leading-7 text-[#ded5c5]">
                    {direction.creativeDirection.creativeSummary}
                  </p>
                  <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Detail
                      label="Feeling"
                      value={direction.creativeEssence.emotionalSignature}
                    />
                    <Detail
                      label="Light"
                      value={direction.visualWorld.light.quality}
                    />
                    <Detail
                      label="Clothes"
                      value={
                        direction.implementationHints.wardrobePriority.join(
                          " · "
                        ) || "To agree with the client"
                      }
                    />
                    <Detail
                      label="Location"
                      value={
                        direction.implementationHints.locationPriority.join(
                          " · "
                        ) ||
                        shoot.location ||
                        "To agree with the client"
                      }
                    />
                  </dl>
                  <div
                    className="mt-5 flex flex-wrap gap-3"
                    aria-label="Suggested colours"
                  >
                    {direction.visualWorld.colourWorld.colours.map(colour => (
                      <span
                        key={`${colour.hex}:${colour.name}`}
                        className="flex items-center gap-2 text-xs text-[#c5bfb3]"
                      >
                        <span
                          className="size-5 rounded-full border border-white/20"
                          style={{ backgroundColor: colour.hex }}
                        />
                        {colour.name}
                      </span>
                    ))}
                  </div>
                  {!!direction.creativeDirection.creativeRules.avoid.length && (
                    <details className="mt-4">
                      <summary className="cursor-pointer py-2 text-sm text-[#d2b98b]">
                        Client boundaries and things to avoid
                      </summary>
                      <p className="mt-2 text-sm leading-6 text-[#c5bfb3]">
                        {direction.creativeDirection.creativeRules.avoid.join(
                          " · "
                        )}
                      </p>
                    </details>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[#c5bfb3]">
                  The client's confirmed direction will appear here when they
                  finish their conversation with MIRA.
                </p>
              )}
              {reviewError && (
                <p role="alert" className="mt-4 text-sm text-red-200">
                  Some preparation details couldn't load. Use Refresh above to
                  try again.
                </p>
              )}
              <h3 className="mira-dark-display mt-7 text-2xl">
                Moodboard and shot guidance
              </h3>
              {images.length ? (
                <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
                  {images.map((image, index) => (
                    <MoodboardShotCard
                      key={`${image.id}:${image.url}`}
                      image={image}
                      number={index + 1}
                      photographer
                      onImageStatus={loaded =>
                        setImageStates(current =>
                          current[`${image.id}:${image.url}`] === loaded
                            ? current
                            : {
                                ...current,
                                [`${image.id}:${image.url}`]: loaded,
                              }
                        )
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">
                  {renderFailed
                    ? "The images couldn't be prepared. Your confirmed direction is saved; the image service needs checking."
                    : direction
                      ? "Your moodboard is being prepared. Use Refresh to check again."
                      : "Your moodboard will appear after the client confirms their direction."}
                </p>
              )}
              {imageFailure && (
                <p role="alert" className="mt-4 text-sm text-red-200">
                  Some saved images couldn't load. Try the image buttons above.
                  If they still fail, image access needs checking.
                </p>
              )}
              <div className="mt-6 border-t border-white/10 pt-5">
                {shoot.status === "ready_to_shoot" ? (
                  <p className="flex items-center gap-2 text-[#d2b98b]">
                    <Check className="size-4" />
                    You marked this shoot ready.
                  </p>
                ) : (
                  <>
                    <Button
                      disabled={!canMarkReady || markReady.isPending}
                      onClick={() => markReady.mutate({ shootId })}
                      className={goldButton}
                    >
                      <Check className="mr-2 size-4" />
                      {markReady.isPending ? "Saving…" : "Mark ready to shoot"}
                    </Button>
                    <p className="mt-3 text-xs leading-5 text-[#b7a98f]">
                      {canMarkReady
                        ? "Confirm when you have reviewed the preparation and agreed any changes with the client."
                        : "This becomes available after the client confirms their direction and the moodboard images load."}
                    </p>
                  </>
                )}
                {markReady.isError && (
                  <p role="alert" className="mt-3 text-sm text-red-200">
                    We couldn't save the ready status. Please try again.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
        <details className="mt-5 rounded-lg border border-white/15 p-5">
          <summary className="cursor-pointer py-2 text-sm text-[#d2b98b]">
            Reference images · {referenceRows.length} saved · optional
          </summary>
          <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">
            Select several photos together and choose a category for each.
            Photos added after confirmation won't change the existing moodboard.
          </p>
          {inspection.isError ? (
            <p role="alert" className="mt-3 text-sm text-red-200">
              Couldn't load the saved references. Refresh before adding more.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {referenceRows.map(reference => (
                  <article
                    key={reference.id}
                    className="rounded-lg border border-white/15 p-3"
                  >
                    <ReferenceThumbnail
                      url={
                        reference.dataUrl ??
                        (reference.storageKey
                          ? `/manus-storage/${reference.storageKey}`
                          : null)
                      }
                      alt={
                        reference.clientDescription || reference.originalName
                      }
                    />
                    <p className="mt-2 break-words text-xs text-[#ded5c5]">
                      {reference.originalName}
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer py-2 text-xs text-[#b7a98f]">
                        Image details
                      </summary>
                      <p className="text-xs leading-5 text-[#c5bfb3]">
                        {reference.clientDescription || "No note added."}
                      </p>
                      {reference.analysisJson ? (
                        <p className="mt-2 text-xs text-[#b7a98f]">
                          MIRA's image notes are saved.
                        </p>
                      ) : (
                        <Button
                          variant="ghost"
                          disabled={analyzeReference.isPending}
                          onClick={() =>
                            analyzeReference.mutate({
                              shootId,
                              assetId: reference.id,
                            })
                          }
                          className="mt-2 text-xs text-[#d2b98b]"
                        >
                          Ask MIRA to describe image
                        </Button>
                      )}
                    </details>
                  </article>
                ))}
              </div>
              {!inspection.isLoading && (
                <ReferenceBatchUpload
                  photographer
                  available={Math.max(0, 6 - referenceRows.length)}
                  onUpload={reference =>
                    uploadReference.mutateAsync({ shootId, reference })
                  }
                  onComplete={async () => {
                    const result = await inspection.refetch();
                    if (result.error) throw result.error;
                  }}
                />
              )}
              {analyzeReference.isError && (
                <p role="alert" className="mt-3 text-sm text-red-200">
                  MIRA couldn't describe the image. The reference is still
                  saved.
                </p>
              )}
            </>
          )}
        </details>
        <details
          onToggle={event => setShowNotes(event.currentTarget.open)}
          className="mt-3 rounded-lg border border-white/15 p-5"
        >
          <summary className="cursor-pointer py-2 text-sm text-[#b7a98f]">
            Conversation notes · optional
          </summary>
          {showNotes && (
            <div className="mt-3 space-y-3">
              {qaEvents.isLoading ? (
                <p className="text-sm text-[#b7a98f]">Loading notes…</p>
              ) : qaEvents.isError ? (
                <p role="alert" className="text-sm text-red-200">
                  Couldn't load the notes.
                </p>
              ) : qaEvents.data?.length ? (
                <>
                  {qaEvents.data.map(event => (
                    <article
                      key={event.id}
                      className="border-t border-white/10 pt-3"
                    >
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#ded5c5]">
                        {event.content}
                      </p>
                      <p className="mt-2 text-xs text-[#9e978b]">
                        Expires {formatShootDate(event.expiresAt)}
                      </p>
                    </article>
                  ))}
                  <details>
                    <summary className="cursor-pointer py-2 text-xs text-[#b7a98f]">
                      Remove retained conversation notes
                    </summary>
                    <Button
                      variant="outline"
                      disabled={deleteQaEvents.isPending}
                      onClick={() => deleteQaEvents.mutate({ shootId })}
                      className={`mt-2 ${quietButton}`}
                    >
                      Delete notes
                    </Button>
                  </details>
                </>
              ) : (
                <p className="text-sm text-[#b7a98f]">
                  No retained conversation notes.
                </p>
              )}
              {deleteQaEvents.isError && (
                <p role="alert" className="text-sm text-red-200">
                  The notes couldn't be removed.
                </p>
              )}
            </div>
          )}
        </details>
      </div>
    </PhotographerShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[#b7a98f]">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-[#ded5c5]">{value}</dd>
    </div>
  );
}
function ContactField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-[#b7a98f]">
      {label}
      {children}
    </label>
  );
}
function invitationStatus(status: string) {
  return (
    (
      {
        created: "Private link created. Email not sent yet.",
        queued: "Invitation is queued; delivery is not confirmed yet.",
        sent: "Invitation sent.",
        delivered: "Invitation delivered.",
        opened: "Your client opened the invitation.",
        preparation_in_progress: "Your client is preparing with MIRA.",
        completed: "Your client has finished their preparation.",
        failed:
          "The invitation couldn't be delivered. Check the email and try again.",
      } as Record<string, string>
    )[status] ?? "Invitation status needs checking."
  );
}
