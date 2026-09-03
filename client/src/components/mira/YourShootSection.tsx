import { useState } from "react";
import { SectionHeader } from "@/components/mira/SectionHeader";
import { containsInternalLanguage } from "@/components/mira/shootPresentation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { buildGoogleCalendarUrl, downloadIcs, type ShootCalendarDetails } from "@/components/mira/calendar";

type ShootRoomInfo = {
  status: "active" | "completed" | "expired" | "revoked";
  shoot: {
    title: string;
    shootType: string | null;
    clientName: string | null;
    scheduledAt: string | Date | null;
    timezone: string;
    location: string | null;
    durationMinutes: number | null;
    intendedUse: string | null;
    photographerNotes: string | null;
    roomState: string;
  };
  photographer: {
    displayName: string;
    businessName: string | null;
  };
};

const ROOM_STAGE_LABEL: Record<string, string> = {
  welcome: "Welcome",
  discovery_offered: "Welcome",
  discovery_in_progress: "Discovery in progress",
  summary_pending: "Reviewing your Discovery summary",
  discovery_confirmed: "Creative direction confirmed — preparing your moodboard",
  preparation_active: "Creative direction confirmed",
};

function formatScheduledAt(value: string | Date | null, timezone: string) {
  if (!value) return "Not yet scheduled";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

// Presentational only - reads exactly what's already stored for this shoot.
// Never fabricates a field: every unset value renders an explicit placeholder.
export function YourShootSection({ data, token }: { data: ShootRoomInfo; token: string }) {
  const { shoot, photographer } = data;
  return (
    <section className="mira-dark-panel">
      <SectionHeader index="01" title="Your Shoot" subtitle="What are we doing?" />
      <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <Field label="Photographer" value={photographer.businessName || photographer.displayName} />
        <Field label="Client" value={shoot.clientName ?? "Not yet provided"} />
        <Field label="Date & time" value={formatScheduledAt(shoot.scheduledAt, shoot.timezone)} />
        <Field label="Shoot type" value={shoot.shootType ?? "Not yet specified"} />
        <Field label="Location" value={shoot.location ?? "Not yet decided"} />
        <Field label="Intended use" value={shoot.intendedUse ?? "Not yet specified"} />
        <Field label="Status" value={ROOM_STAGE_LABEL[shoot.roomState] ?? "In progress"} />
      </dl>
      {shoot.photographerNotes && !containsInternalLanguage(shoot.photographerNotes) && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mira-dark-kicker">Note from your photographer</p>
          <p className="mt-2 text-sm leading-6 text-[#c5bfb3]">{shoot.photographerNotes}</p>
        </div>
      )}
      <ScheduleConfirmation token={token} photographer={photographer} />
    </section>
  );
}

// Self-contained: owns its own read (polled, so it reflects a photographer
// rescheduling) and its own mutation, independent of the one-shot
// openInvitation query the rest of this section renders from.
function ScheduleConfirmation({ token, photographer }: { token: string; photographer: ShootRoomInfo["photographer"] }) {
  const [note, setNote] = useState("");
  const [showChangeForm, setShowChangeForm] = useState(false);
  const status = trpc.miraCore.getShootRoomStatus.useQuery({ token }, { refetchInterval: 8000 });
  const respond = trpc.miraCore.respondToShootSchedule.useMutation({
    onSuccess: () => {
      setShowChangeForm(false);
      setNote("");
      void status.refetch();
    },
  });

  const scheduleResponse = status.data?.scheduleResponse ?? null;

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <p className="mira-dark-kicker">Confirm your shoot details</p>
      {scheduleResponse?.response === "confirmed" ? (
        <>
          <p className="mt-2 text-sm text-[#c5bfb3]">You confirmed these details are correct.</p>
          {status.data ? <CalendarActions photographer={photographer} status={status.data} /> : null}
        </>
      ) : scheduleResponse?.response === "change_requested" ? (
        <div className="mt-2 text-sm text-[#c5bfb3]">
          <p>
            You asked your photographer for a change
            {scheduleResponse.note ? `: "${scheduleResponse.note}"` : "."}
          </p>
          <p className="mt-1 text-xs text-[#9e978b]">Your photographer will follow up with you directly.</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-[#c5bfb3]">
            Let your photographer know if the date, time, and location above work for you.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ token, input: { response: "confirmed", note: null } })}
              className="border-white/15 bg-transparent text-[#ded5c5]"
            >
              These details are correct
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={respond.isPending}
              onClick={() => setShowChangeForm(value => !value)}
              className="text-[#d2b98b]"
            >
              Request a change
            </Button>
          </div>
          {showChangeForm && (
            <form
              className="mt-3"
              onSubmit={event => {
                event.preventDefault();
                const trimmed = note.trim();
                if (!trimmed) return;
                respond.mutate({ token, input: { response: "change_requested", note: trimmed } });
              }}
            >
              <Textarea
                aria-label="What would you like to change?"
                maxLength={280}
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="What would you like to change about the date, time, or location?"
                className="border-white/15 bg-white/5 text-[#ded5c5]"
              />
              <Button
                type="submit"
                disabled={respond.isPending || !note.trim()}
                className="mt-3 rounded-full bg-[#d2b98b] text-[#171613]"
              >
                Send request
              </Button>
            </form>
          )}
          {respond.isError && (
            <p role="alert" className="mt-3 text-xs text-red-200">
              We couldn't save your response. Please try again.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CalendarActions({ photographer, status }: { photographer: ShootRoomInfo["photographer"]; status: { scheduledAt: string | Date | null; timezone: string | null; durationMinutes: number | null; location: string | null } }) {
  if (!status.scheduledAt || !status.timezone) return null;
  const details: ShootCalendarDetails = {
    photographerName: photographer?.businessName || photographer?.displayName || "Your photographer",
    scheduledAt: status.scheduledAt,
    timezone: status.timezone,
    durationMinutes: status.durationMinutes,
    location: status.location,
    roomUrl: window.location.href,
  };
  const googleUrl = buildGoogleCalendarUrl(details);
  if (!googleUrl) return null;
  return <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
    <a href={googleUrl} className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#d2b98b]/50 px-4 text-xs font-medium text-[#d2b98b] hover:bg-[#d2b98b]/10">Add to Google Calendar</a>
    <button type="button" onClick={() => downloadIcs(details)} className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/15 px-4 text-xs font-medium text-[#ded5c5] hover:bg-white/5">Download calendar invitation (.ics)</button>
  </div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mira-dark-kicker">{label}</dt>
      <dd className="mt-1 text-[#f1eadc]">{value}</dd>
    </div>
  );
}
