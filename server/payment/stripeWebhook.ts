import Stripe from "stripe";
import type { RequestHandler } from "express";
import { ENV } from "../_core/env";
import { processPaymentEvent, type NormalizedPaymentEvent, type PaymentEventRepository } from "./paymentEventProcessor";

const supportedTypes = new Set<NormalizedPaymentEvent["type"]>([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

const subscriptionStatuses = new Set(["active", "past_due", "cancelled", "incomplete", "incomplete_expired", "unpaid"]);

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function firstPriceId(object: Record<string, any>) {
  const metadata = record(object.metadata);
  const metadataPrice = metadata?.mira_price_id ?? metadata?.price_id;
  if (typeof metadataPrice === "string") return metadataPrice;
  const lines = record(object.lines)?.data;
  const firstLine = Array.isArray(lines) ? record(lines[0]) : null;
  const price = record(firstLine?.price);
  if (typeof price?.id === "string") return price.id;
  const items = record(object.items)?.data;
  const firstItem = Array.isArray(items) ? record(items[0]) : null;
  const itemPrice = record(firstItem?.price);
  return typeof itemPrice?.id === "string" ? itemPrice.id : null;
}

function firstCurrency(object: Record<string, any>) {
  if (typeof object.currency === "string") return object.currency;
  const lines = record(object.lines)?.data;
  const firstLine = Array.isArray(lines) ? record(lines[0]) : null;
  const price = record(firstLine?.price);
  if (typeof price?.currency === "string") return price.currency;
  const items = record(object.items)?.data;
  const firstItem = Array.isArray(items) ? record(items[0]) : null;
  const itemPrice = record(firstItem?.price);
  return typeof itemPrice?.currency === "string" ? itemPrice.currency : null;
}

function subscriptionStatus(object: Record<string, any>) {
  const direct = object.subscription_status ?? (object.object === "subscription" ? object.status : undefined);
  const metadata = record(object.metadata);
  const value = typeof direct === "string" ? direct : metadata?.mira_subscription_status;
  return typeof value === "string" && subscriptionStatuses.has(value)
    ? value as NormalizedPaymentEvent["subscriptionStatus"]
    : null;
}

function stripeDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

export function normalizeStripeEvent(event: Stripe.Event): NormalizedPaymentEvent | null {
  if (!supportedTypes.has(event.type as NormalizedPaymentEvent["type"])) return null;
  const object = record(event.data.object);
  if (!object) return null;
  const priceId = firstPriceId(object);
  const currency = firstCurrency(object);
  if (!priceId || !currency) return null;
  const type = event.type as NormalizedPaymentEvent["type"];
  const subscription = typeof object.subscription === "string" ? object.subscription : null;
  const customer = typeof object.customer === "string" ? object.customer : null;
  if (type === "checkout.session.completed") {
    return {
      eventId: event.id,
      type,
      paymentMode: object.mode === "subscription" ? "subscription" : "payment",
      currency,
      priceId,
      paid: object.payment_status === "paid" && object.status === "complete",
      subscriptionStatus: subscriptionStatus(object),
      clientReferenceId: typeof object.client_reference_id === "string" ? object.client_reference_id : null,
      customerId: customer,
      subscriptionId: subscription,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: stripeDate(object.current_period_end),
    };
  }
  return {
    eventId: event.id,
    type,
    paymentMode: "subscription",
    currency,
    priceId,
    paid: type === "invoice.paid" || (type === "customer.subscription.updated" && subscriptionStatus(object) === "active"),
    subscriptionStatus: type === "customer.subscription.deleted" ? "cancelled" : subscriptionStatus(object),
    customerId: customer,
    subscriptionId: subscription ?? (typeof object.id === "string" && object.id.startsWith("sub_") ? object.id : null),
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    cancelAt: stripeDate(object.cancel_at),
    currentPeriodEnd: stripeDate(object.current_period_end),
  };
}

export type StripeWebhookHandlerOptions = {
  repository?: PaymentEventRepository;
  stripe?: { webhooks: Pick<Stripe.Webhooks, "constructEvent"> };
  webhookSecret?: string;
  paymentMode?: string;
  currency?: string;
  priceId?: string;
  now?: () => Date;
};

export function createStripeWebhookHandler(options: StripeWebhookHandlerOptions = {}): RequestHandler {
  return async (req, res) => {
    if ((options.paymentMode ?? ENV.paymentMode) !== "stripe") return res.status(400).json({ error: "Stripe payment mode is disabled" });
    const secret = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!secret) return res.status(503).json({ error: "Stripe webhook verification is not configured" });
    const stripe = options.stripe ?? (ENV.stripeSecretKey ? new Stripe(ENV.stripeSecretKey) : null);
    if (!stripe) return res.status(503).json({ error: "Stripe webhook verification is not configured" });
    const signature = req.header("Stripe-Signature");
    if (!signature) return res.status(400).json({ error: "Stripe signature is required" });
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Stripe webhook body must be raw JSON" });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, secret);
    } catch {
      return res.status(400).json({ error: "Invalid Stripe signature" });
    }
    if (!supportedTypes.has(event.type as NormalizedPaymentEvent["type"])) return res.status(200).json({ received: true, processed: false });
    const normalized = normalizeStripeEvent(event);
    if (!normalized) return res.status(400).json({ error: "Unsupported Stripe event payload" });
    if (!options.repository) return res.status(503).json({ error: "Payment persistence is not configured" });
    try {
      const result = await processPaymentEvent(normalized, options.repository, {
        currency: options.currency ?? process.env.STRIPE_CURRENCY ?? "eur",
        priceId: options.priceId ?? process.env.STRIPE_PRICE_ID ?? "",
        now: options.now,
      });
      if (!result.accepted && result.action !== "duplicate") return res.status(400).json({ error: "Payment event was rejected" });
      return res.status(200).json({ received: true, processed: result.action !== "duplicate", action: result.action, state: result.state ?? null });
    } catch {
      return res.status(503).json({ error: "Payment persistence is unavailable" });
    }
  };
}