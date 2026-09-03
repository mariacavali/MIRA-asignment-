import { ENV } from "../_core/env";
import { buildPublicUrl } from "../_core/publicUrl";
import type { EmailContext, EmailContextResolver, EmailOutboxJob } from "../email/outbox";
import { createInvitationAccessToken } from "./invitationAccessLink";
import { getInvitationRoomStateById } from "./db";

// The outbox never stores a recipient, token, or URL - every field an
// asynchronous send needs is resolved fresh here, at the moment a job is
// actually claimed, from the invitation's authoritative current state. The
// signed access link is generated here too (never persisted) so a rotated
// token or a rescheduled shoot is always reflected in the link a client
// eventually clicks, and so a superseded/cancelled invitation is caught
// before anything is sent.
export const resolveMiraEmailOutboxContext: EmailContextResolver = async (job: EmailOutboxJob): Promise<EmailContext | null> => {
  if (!ENV.invitationLinkSecret) return null;
  if (!ENV.publicAppBaseUrl) return null;
  const state = await getInvitationRoomStateById(job.invitationId);
  if (!state) return null;
  const { invitation, shoot, photographer } = state;
  let preparationUrl: string;
  try {
    const signedAccessToken = createInvitationAccessToken({
      invitationId: invitation.id,
      tokenHash: invitation.tokenHash,
      secret: ENV.invitationLinkSecret,
    });
    preparationUrl = buildPublicUrl(ENV.publicAppBaseUrl, `/prepare/access/${signedAccessToken}`);
  } catch {
    return null;
  }
  const shootEndsAt = shoot.scheduledAt && shoot.durationMinutes
    ? new Date(shoot.scheduledAt.getTime() + shoot.durationMinutes * 60_000)
    : null;
  return {
    clientFirstName: shoot.clientName?.trim().split(/\s+/)[0] ?? null,
    photographerName: photographer?.businessName || photographer?.displayName || "Your photographer",
    shootTitle: shoot.title,
    scheduledAt: shoot.scheduledAt,
    shootEndsAt,
    timeZone: shoot.timezone,
    location: shoot.location,
    accessUntil: invitation.expiresAt,
    preparationUrl,
    clientEmail: shoot.clientEmail,
    preparationCompleted: Boolean(invitation.completedAt),
    invitationValid: invitation.status === "active",
    shootCancelled: shoot.status === "archived",
  };
};
