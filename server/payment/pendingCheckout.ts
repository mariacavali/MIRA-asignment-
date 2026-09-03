import { ENV } from "../_core/env";
import { createLocalPendingCheckout, generatePendingCheckoutReference } from "../localFileStore";
import { DrizzlePaymentRepository } from "./drizzlePaymentRepository";

export function buildStripePaymentLinkUrl(paymentLinkUrl: string, referenceId: string) {
  if (!paymentLinkUrl) throw new Error("Stripe Payment Link is not configured");
  const url = new URL(paymentLinkUrl);
  url.searchParams.set("client_reference_id", referenceId);
  return url.toString();
}

export async function createPendingCheckout(input: { name: string; email: string }, photographerUserId?: number) {
  if (ENV.paymentMode !== "stripe") throw new Error("Stripe payment mode is not enabled");
  if (!ENV.stripePaymentLinkUrl) throw new Error("Stripe Payment Link is not configured");
  if (ENV.miraLocalFileStore) {
    const record = await createLocalPendingCheckout(input);
    return { referenceId: record.referenceId, redirectUrl: buildStripePaymentLinkUrl(ENV.stripePaymentLinkUrl, record.referenceId), sessionOpenId: null };
  }
  if (!ENV.stripePriceId) throw new Error("Stripe price is not configured");
  const referenceId = generatePendingCheckoutReference();
  const created = await new DrizzlePaymentRepository().createPendingCheckout({
    name: input.name,
    email: input.email,
    clientReferenceId: referenceId,
    expectedPriceId: ENV.stripePriceId,
    expectedCurrency: ENV.stripeCurrency,
    photographerUserId,
  });
  if (!created) throw new Error("An account already exists for this email or the photographer account was not found");
  return { referenceId, redirectUrl: buildStripePaymentLinkUrl(ENV.stripePaymentLinkUrl, referenceId), sessionOpenId: photographerUserId ? null : created.openId };
}
