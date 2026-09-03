import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { markInvitationDeliveredByMessageId, markInvitationBouncedByMessageId } from "../miraCore/db";
import type { EmailOutboxRepository } from "./outbox";

// Resend signs webhook payloads the same way Svix does: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" using the base64 portion of the
// "whsec_..." signing secret, compared against one of the "v1,<sig>" entries
// in the svix-signature header. No client library is required for this.
const REPLAY_TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhookSignature(
  payload: Buffer,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret) return false;
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > REPLAY_TOLERANCE_SECONDS) return false;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  const signedContent = `${headers.id}.${headers.timestamp}.${payload.toString("utf8")}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  return headers.signature.split(" ").some(entry => {
    const candidate = entry.includes(",") ? entry.split(",")[1] : entry;
    if (!candidate) return false;
    const candidateBuffer = Buffer.from(candidate);
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}

const DELIVERED_EVENT = "email.delivered";
// Resend does not use the word "bounced" for every non-delivery signal, so
// every event type that means "this message did not honestly reach the
// client" is mapped to the same persisted "failed" status.
const FAILURE_EVENTS = new Set(["email.bounced", "email.complained", "email.delivery_delayed"]);

export type ResendWebhookHandlerOptions = { secret?: string; outboxRepository?: EmailOutboxRepository };

// Never sends anything and never accepts a caller-selected recipient or
// status - it only ever updates the honest delivery status of a message
// Resend has already sent, matched strictly by the provider message id it
// stored at send time.
export function createResendWebhookHandler(options: ResendWebhookHandlerOptions = {}): RequestHandler {
  return async (req, res) => {
    const secret = options.secret ?? process.env.RESEND_WEBHOOK_SECRET ?? "";
    if (!secret) return res.status(503).json({ error: "Resend webhook verification is not configured" });
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Resend webhook body must be raw JSON" });
    const verified = verifyResendWebhookSignature(req.body, {
      id: req.header("svix-id"),
      timestamp: req.header("svix-timestamp"),
      signature: req.header("svix-signature"),
    }, secret);
    if (!verified) return res.status(401).json({ error: "Invalid Resend webhook signature" });
    let event: { type?: unknown; data?: { email_id?: unknown } };
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid Resend webhook payload" });
    }
    const messageId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
    const type = typeof event.type === "string" ? event.type : null;
    if (!messageId || !type) return res.status(200).json({ received: true, processed: false });
    try {
      if (type === DELIVERED_EVENT) {
        await markInvitationDeliveredByMessageId(messageId);
        if (options.outboxRepository) await options.outboxRepository.markDeliveredByMessageId(messageId);
        return res.status(200).json({ received: true, processed: true });
      }
      if (FAILURE_EVENTS.has(type)) {
        await markInvitationBouncedByMessageId(messageId);
        return res.status(200).json({ received: true, processed: true });
      }
      return res.status(200).json({ received: true, processed: false });
    } catch {
      return res.status(503).json({ error: "Delivery status persistence is unavailable" });
    }
  };
}
