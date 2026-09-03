import Stripe from "stripe";
import { ENV } from "../_core/env";
import { buildPublicUrl } from "../_core/publicUrl";
import { paymentStateGrantsAccess, type PaymentIdentity } from "./paymentEventProcessor";

export type PortalBillingRepository = {
  getBillingIdentityForUser(openId: string): Promise<PaymentIdentity | null>;
};

export type PortalStripeClient = {
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url?: string | null }>;
    };
  };
};

export function buildPortalReturnUrl(publicBaseUrl: string) {
  try {
    return buildPublicUrl(publicBaseUrl, "/mira/dashboard");
  } catch {
    throw new Error("Portal return URL is not configured safely");
  }
}

export function validatePortalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function createPortalSessionForUser(params: { userOpenId: string; repository: PortalBillingRepository; stripe?: PortalStripeClient; stripeSecretKey?: string; publicBaseUrl?: string; paymentMode?: string }) {
  if ((params.paymentMode ?? ENV.paymentMode) !== "stripe") throw new Error("Stripe payment mode is disabled");
  const publicBaseUrl = params.publicBaseUrl ?? ENV.publicAppBaseUrl;
  if (!publicBaseUrl) throw new Error("Portal configuration is unavailable");
  const identity = await params.repository.getBillingIdentityForUser(params.userOpenId);
  if (!identity || !paymentStateGrantsAccess(identity.state) || !identity.customerId) throw new Error("Subscription management is unavailable");
  const stripe = params.stripe ?? (params.stripeSecretKey ?? ENV.stripeSecretKey ? new Stripe(params.stripeSecretKey ?? ENV.stripeSecretKey) : null);
  if (!stripe) throw new Error("Portal configuration is unavailable");
  const result = await stripe.billingPortal.sessions.create({ customer: identity.customerId, return_url: buildPortalReturnUrl(publicBaseUrl) });
  const portalUrl = validatePortalUrl(result.url);
  if (!portalUrl) throw new Error("Subscription management is unavailable");
  return portalUrl;
}
