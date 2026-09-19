import { ENV } from "../_core/env";
import { buildPublicUrl } from "../_core/publicUrl";
import { requireEmailConfiguration } from "../email";
import { isValidEmailAddress } from "../email/provider";
import type { EmailOutboxRepository } from "../email/outbox";
import { clientShootRoomInvitationEmail, preparationCompletedEmail, readyToShootEmail } from "../email/templates";
import { createInvitationAccessToken } from "./invitationAccessLink";
import { readClientPreferences } from "../../shared/miraClientPreferences";
import {
  getCompletionNotificationContext,
  getInvitationRoomStateById,
  getLatestInvitationIdForOwnedShoot,
  getLatestShootMemory,
  getOwnedShoot,
  getPhotographerProfile,
  markInvitationSent,
  markPhotographerNotified,
} from "./db";

function publicUrl(path: string) {
  const value = process.env.MIRA_PUBLIC_APP_BASE_URL ?? ENV.publicAppBaseUrl;
  if (!value) throw new Error("MIRA_PUBLIC_APP_BASE_URL is not configured");
  return buildPublicUrl(value, path);
}

export async function deliverClientInvitation(params: {
  photographerUserId: number;
  photographerEmail: string | null;
  invitationId: string;
  token: string;
  shootId: number;
  expiresAt: Date;
  requestOrigin?: string;
}) {
  const shoot = await getOwnedShoot(params.photographerUserId, params.shootId);
  if (!shoot) throw new Error("Shoot not found");
  if (!shoot.clientEmail) throw new Error("Add a client email before sending the invitation");
  if (!isValidEmailAddress(shoot.clientEmail)) throw new Error("The client email address is invalid");
  const profile = await getPhotographerProfile(params.photographerUserId);
  const photographerName = profile?.businessName || profile?.displayName || "Your photographer";
  const preparationUrl = publicUrl(`/prepare/${params.token}`);
  const talkToMiraUrl = `${preparationUrl}#mira-preparation`;
  const content = clientShootRoomInvitationEmail({
    clientFirstName: shoot.clientName?.trim().split(/\s+/)[0] ?? null,
    photographerName,
    shootTitle: shoot.title,
    scheduledAt: shoot.scheduledAt,
    timeZone: shoot.timezone,
    location: shoot.location,
    accessUntil: params.expiresAt,
    preparationUrl,
    talkToMiraUrl,
    sentAt: new Date(),
  });
  const { provider, from } = requireEmailConfiguration();
  const replyTo = isValidEmailAddress(params.photographerEmail) ? params.photographerEmail : null;
  if (!replyTo) console.warn("MIRA photographer Reply-To is missing or invalid; sending invitation without Reply-To");
  const delivery = await provider.send({
    to: shoot.clientEmail,
    from,
    replyTo,
    ...content,
  });
  await markInvitationSent({
    invitationId: params.invitationId,
    photographerUserId: params.photographerUserId,
    provider: delivery.provider,
    messageId: delivery.messageId,
  });
  return { preparationUrl, provider: delivery.provider, providerMessageId: delivery.messageId, deliveryStatus: "sent" as const, replyToWarning: replyTo ? null : "Photographer Reply-To is missing or invalid; invitation was sent without it." };
}

// Sent once, directly, when a photographer marks a shoot Ready to Shoot
// (markShootReadyToShoot has no idempotency gate of its own - a repeated
// click still succeeds each time). The outbox's unique (invitationId,
// milestoneId) row is used purely as a send ledger here, not a schedule: this
// event is photographer-triggered right now, not date-driven, so it
// deliberately bypasses buildMiraEmailSequence(). Reuses the same signed
// Shoot Room access link the other reminder emails use, so the client keeps
// returning to the same private room throughout.
export async function notifyClientShootIsReadyToShoot(params: {
  photographerUserId: number;
  shootId: number;
  repository: EmailOutboxRepository;
}) {
  if (!ENV.invitationLinkSecret) return false;
  const invitationId = await getLatestInvitationIdForOwnedShoot({ photographerUserId: params.photographerUserId, shootId: params.shootId });
  if (!invitationId) return false;
  const state = await getInvitationRoomStateById(invitationId);
  if (!state || !state.shoot.clientEmail || !isValidEmailAddress(state.shoot.clientEmail)) return false;
  if (readClientPreferences(await getLatestShootMemory(params.shootId)).emailReminders === false) return false;
  const job = await params.repository.schedule({
    shootId: params.shootId,
    invitationId: state.invitation.id,
    milestoneId: "ready_to_shoot",
    scheduledAt: new Date(),
    idempotencyKey: `mira:shoot:${params.shootId}:milestone:ready_to_shoot`,
  });
  if (job.status === "sent" || job.status === "delivered") return false;
  const signedAccessToken = createInvitationAccessToken({
    invitationId: state.invitation.id,
    tokenHash: state.invitation.tokenHash,
    secret: ENV.invitationLinkSecret,
  });
  const preparationUrl = publicUrl(`/prepare/access/${signedAccessToken}`);
  const photographerName = state.photographer?.businessName || state.photographer?.displayName || "Your photographer";
  const content = readyToShootEmail({
    clientFirstName: state.shoot.clientName?.trim().split(/\s+/)[0] ?? null,
    photographerName,
    shootTitle: state.shoot.title,
    scheduledAt: state.shoot.scheduledAt,
    timeZone: state.shoot.timezone,
    preparationUrl,
  });
  const { provider, from } = requireEmailConfiguration();
  const delivery = await provider.send({ to: state.shoot.clientEmail, from, ...content });
  await params.repository.markSent(job.id, new Date(), delivery.messageId);
  return true;
}

export async function notifyPhotographerOfCompletion(params: {
  shootId: number;
  requestOrigin?: string;
}) {
  const context = await getCompletionNotificationContext(params.shootId);
  if (!context || context.invitation.photographerNotifiedAt || !context.photographerEmail) return false;
  if (!isValidEmailAddress(context.photographerEmail)) {
    console.warn("MIRA photographer notification recipient is invalid; notification was not sent");
    return false;
  }
  const { provider, from } = requireEmailConfiguration();
  const shootUrl = publicUrl(`/mira/shoots/${context.shoot.id}`);
  const content = preparationCompletedEmail({
    clientName: context.shoot.clientName,
    shootTitle: context.shoot.title,
    shootUrl,
  });
  await provider.send({ to: context.photographerEmail, from, ...content });
  await markPhotographerNotified(context.invitation.id);
  return true;
}
