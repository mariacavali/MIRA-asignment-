import { ENV } from "../_core/env";
import { getTransactionalEmailProvider } from "../email";
import { DrizzleEmailOutboxRepository, MiraEmailOutboxWorker } from "../email/outbox";
import { resolveMiraEmailOutboxContext } from "./emailOutboxContext";

// Assembling this worker only wires dependencies together - it never claims
// or sends a job by itself. Actual processing only happens when the secured
// /api/internal/mira/email-outbox/process endpoint is called, so starting
// the server (which calls this once, eagerly, like the Stripe webhook
// handler) never sends anything on its own.
//
// Returns null - leaving the endpoint safely unavailable - unless every
// piece of required production configuration (the link-signing secret, the
// public base URL, and a configured transactional email provider) is
// present. This is the single place that gates real Resend delivery.
export function buildProductionMiraEmailOutboxWorker(): MiraEmailOutboxWorker | null {
  if (!ENV.invitationLinkSecret || !ENV.publicAppBaseUrl || !ENV.invitationFrom) return null;
  const provider = getTransactionalEmailProvider();
  if (!provider) return null;
  return new MiraEmailOutboxWorker(
    new DrizzleEmailOutboxRepository(),
    resolveMiraEmailOutboxContext,
    provider,
    ENV.invitationFrom,
  );
}
