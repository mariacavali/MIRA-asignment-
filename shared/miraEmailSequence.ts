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

function statusFor(params: { id: MiraClientEmailMilestoneId; at: Date; shootAt: Date; processed: Set<string>; completed: boolean; valid: boolean; cancelled: boolean; closeToShoot: boolean; accepted: boolean }) {
  if (params.processed.has(params.id)) return { status: "sent" as const, suppressionReason: null };
  if (params.completed) return { status: "suppressed" as const, suppressionReason: "preparation_completed" };
  if (!params.valid) return { status: "suppressed" as const, suppressionReason: "invitation_invalid" };
  if (params.cancelled) return { status: "cancelled" as const, suppressionReason: "shoot_cancelled" };
  if ((params.id === "preparation_guidance" || params.id === "call_mira_reminder") && !params.accepted) return { status: "suppressed" as const, suppressionReason: "awaiting_acceptance" };
  if (params.at.getTime() > params.shootAt.getTime()) return { status: "suppressed" as const, suppressionReason: "after_shoot" };
  if (params.id === "shoot_day_reminder" && params.closeToShoot) return { status: "suppressed" as const, suppressionReason: "compressed_schedule" };
  return { status: "scheduled" as const, suppressionReason: null };
}

export function buildMiraEmailSequence(input: MiraClientEmailSequenceInput): MiraClientEmailMilestone[] {
  const shootAt = new Date(input.scheduledAt);
  const acceptedAt = input.acceptedAt ? new Date(input.acceptedAt) : null;
  const invitationSentAt = new Date(input.invitationSentAt);
  const closeToShoot = shootAt.getTime() - invitationSentAt.getTime() < 24 * 3_600_000;
  const processed = new Set(input.processedMilestones ?? []);
  const completed = Boolean(input.preparationCompletedAt);
  const valid = input.invitationValid !== false;
  const schedule = [
    { id: "shoot_room_invitation" as const, at: invitationSentAt },
    { id: "preparation_guidance" as const, at: acceptedAt ?? invitationSentAt },
    { id: "call_mira_reminder" as const, at: acceptedAt ? new Date(acceptedAt.getTime() + 48 * 3_600_000) : invitationSentAt },
    { id: "shoot_day_reminder" as const, at: new Date(shootAt.getTime() - 24 * 3_600_000) },
  ];
  return schedule.map(item => {
    const definition = MIRA_EMAIL_MILESTONES.find(milestone => milestone.id === item.id)!;
    const state = statusFor({ id: item.id, at: item.at, shootAt, processed, completed, valid, cancelled: Boolean(input.shootCancelled), closeToShoot, accepted: Boolean(acceptedAt) });
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
