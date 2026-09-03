export const MIRA_EMAIL_MILESTONES = [
  { id: "shoot_room_invitation", name: "Private Shoot Room invitation" },
  { id: "preparation_guidance", name: "Preparation guidance" },
  { id: "call_mira_reminder", name: "Call MIRA reminder" },
  { id: "shoot_day_reminder", name: "Shoot-day reminder" },
] as const;

export type MiraClientEmailMilestoneId = typeof MIRA_EMAIL_MILESTONES[number]["id"];
export type MiraEmailStatus = "scheduled" | "sent" | "suppressed" | "cancelled";

export type MiraClientEmailEvent = {
  eventId: string;
  shootId: number;
  type: "invitation_sent" | "invitation_accepted" | "preparation_completed" | "shoot_cancelled";
  occurredAt: Date;
  invitationValid: boolean;
};

export type MiraClientEmailSequenceInput = {
  shootId: number;
  scheduledAt: Date;
  timeZone: string;
  clientEmail: string | null;
  invitationSentAt: Date;
  acceptedAt?: Date | null;
  preparationCompletedAt?: Date | null;
  invitationValid?: boolean;
  shootCancelled?: boolean;
  processedMilestones?: MiraClientEmailMilestoneId[];
};

export type MiraClientEmailMilestone = {
  id: MiraClientEmailMilestoneId;
  name: string;
  scheduledAt: Date;
  timeZone: string;
  clientEmail: string | null;
  status: MiraEmailStatus;
  suppressionReason: string | null;
  idempotencyKey: string;
};

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

function subtractCalendarDays(value: Date, days: number, timeZone: string) {
  try {
    const source = zonedParts(value, timeZone);
    const targetClock = Date.UTC(source.year, source.month - 1, source.day - days, source.hour, source.minute, source.second);
    let candidate = targetClock;
    for (let pass = 0; pass < 2; pass += 1) {
      const shown = zonedParts(new Date(candidate), timeZone);
      const shownClock = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
      candidate -= shownClock - targetClock;
    }
    return new Date(candidate);
  } catch {
    return new Date(value.getTime() - days * 24 * 3_600_000);
  }
}

function statusFor(params: { id: MiraClientEmailMilestoneId; at: Date; shootAt: Date; processed: Set<string>; completed: boolean; valid: boolean; cancelled: boolean }) {
  if (params.processed.has(params.id)) return { status: "sent" as const, suppressionReason: null };
  if (params.completed) return { status: "suppressed" as const, suppressionReason: "preparation_completed" };
  if (!params.valid) return { status: "suppressed" as const, suppressionReason: "invitation_invalid" };
  if (params.cancelled) return { status: "cancelled" as const, suppressionReason: "shoot_cancelled" };
  if (params.at.getTime() >= params.shootAt.getTime()) return { status: "suppressed" as const, suppressionReason: "after_shoot" };
  return { status: "scheduled" as const, suppressionReason: null };
}

export function buildMiraEmailSequence(input: MiraClientEmailSequenceInput): MiraClientEmailMilestone[] {
  const shootAt = new Date(input.scheduledAt);
  const invitationSentAt = new Date(input.invitationSentAt);
  const millisecondsUntilShoot = shootAt.getTime() - invitationSentAt.getTime();
  const daysUntilShoot = millisecondsUntilShoot / (24 * 3_600_000);
  const processed = new Set(input.processedMilestones ?? []);
  const completed = Boolean(input.preparationCompletedAt);
  const valid = input.invitationValid !== false;
  const beforeShoot = (days: number) => subtractCalendarDays(shootAt, days, input.timeZone);
  const schedule: Array<{ id: MiraClientEmailMilestoneId; at: Date }> = millisecondsUntilShoot <= 0
    ? [{ id: "shoot_room_invitation", at: invitationSentAt }]
    : daysUntilShoot > 7
      ? [
          { id: "shoot_room_invitation", at: invitationSentAt },
          { id: "preparation_guidance", at: beforeShoot(7) },
          { id: "call_mira_reminder", at: beforeShoot(3) },
          { id: "shoot_day_reminder", at: beforeShoot(1) },
        ]
      : daysUntilShoot >= 4
        ? [
            { id: "shoot_room_invitation", at: invitationSentAt },
            { id: "call_mira_reminder", at: beforeShoot(3) },
            { id: "shoot_day_reminder", at: beforeShoot(1) },
          ]
        : daysUntilShoot >= 2
          ? [
              { id: "shoot_room_invitation", at: invitationSentAt },
              { id: "shoot_day_reminder", at: beforeShoot(1) },
            ]
          : [{ id: "shoot_room_invitation", at: invitationSentAt }];
  return schedule.map(item => {
    const definition = MIRA_EMAIL_MILESTONES.find(milestone => milestone.id === item.id)!;
    const state = statusFor({ id: item.id, at: item.at, shootAt, processed, completed, valid, cancelled: Boolean(input.shootCancelled) });
    return {
      id: item.id,
      name: definition.name,
      scheduledAt: item.at.getTime() > shootAt.getTime() ? shootAt : item.at,
      timeZone: input.timeZone,
      clientEmail: input.clientEmail,
      status: state.status,
      suppressionReason: state.suppressionReason,
      idempotencyKey: `mira:shoot:${input.shootId}:milestone:${item.id}`,
    };
  });
}
