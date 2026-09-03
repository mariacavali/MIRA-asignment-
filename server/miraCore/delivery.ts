import { ENV } from "../_core/env";
import { buildPublicUrl } from "../_core/publicUrl";
import { requireEmailConfiguration } from "../email";
import { isValidEmailAddress } from "../email/provider";
import { clientShootRoomInvitationEmail, preparationCompletedEmail } from "../email/templates";
import {
  getCompletionNotificationContext,
  getOwnedShoot,
  getPhotographerProfile,
  markInvitationSent,
  markPhotographerNotified,
} from "./db";

function publicUrl(path: string, requestOrigin?: string) {
  const value = ENV.publicAppBaseUrl || requestOrigin || "";
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
  const preparationUrl = publicUrl(`/prepare/${params.token}`, params.requestOrigin);
  const content = clientShootRoomInvitationEmail({
    clientFirstName: shoot.clientName?.trim().split(/\s+/)[0] ?? null,
    photographerName,
    shootTitle: shoot.title,
    scheduledAt: shoot.scheduledAt,
    timeZone: shoot.timezone,
    location: shoot.location,
    accessUntil: params.expiresAt,
    preparationUrl,
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
  return { preparationUrl, provider: delivery.provider, deliveryStatus: "sent" as const, replyToWarning: replyTo ? null : "Photographer Reply-To is missing or invalid; invitation was sent without it." };
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
  const shootUrl = publicUrl(`/mira/shoots/${context.shoot.id}`, params.requestOrigin);
  const content = preparationCompletedEmail({
    clientName: context.shoot.clientName,
    shootTitle: context.shoot.title,
    shootUrl,
  });
  await provider.send({ to: context.photographerEmail, from, ...content });
  await markPhotographerNotified(context.invitation.id);
  return true;
}
