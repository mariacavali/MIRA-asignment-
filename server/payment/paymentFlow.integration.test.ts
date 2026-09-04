import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { buildStripePaymentLinkUrl } from "./pendingCheckout";
import { InMemoryPaymentEventRepository } from "./paymentEventProcessor";
import { createStripeWebhookHandler } from "./stripeWebhook";
import { createPendingCheckoutRecord } from "../localFileStore";
import { paymentReturnDestination, isPaidPaymentState } from "../../shared/paymentReturn";

const stripe = new Stripe("sk_test_synthetic_key");
const webhookSecret = "whsec_synthetic_flow_secret";
const config = { currency: "eur", priceId: "price_synthetic" };

function webhookRequest(repository: InMemoryPaymentEventRepository, payload: Record<string, unknown>, signatureOverride?: string) {
  const body = JSON.stringify(payload);
  const signature = signatureOverride ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret });
  let statusCode = 200;
  let responseBody: Record<string, unknown> = {};
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(value: Record<string, unknown>) { responseBody = value; return response; },
  };
  const request = { body: Buffer.from(body), header: (name: string) => name === "Stripe-Signature" ? signature : undefined };
  const handler = createStripeWebhookHandler({ repository, stripe, webhookSecret, paymentMode: "stripe", ...config, now: () => new Date("2026-09-03T10:15:00.000Z") });
  return handler(request as never, response as never, (() => undefined) as never).then(() => ({ statusCode, responseBody }));
}

function checkoutPayload(referenceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_synthetic_flow",
    object: "event",
    created: 1_757_000_000,
    livemode: false,
    type: "checkout.session.completed",
    data: { object: {
      id: "cs_synthetic_flow",
      object: "checkout.session",
      client_reference_id: referenceId,
      mode: "payment",
      payment_status: "no_payment_required",
      status: "complete",
      currency: "eur",
      customer: "cus_synthetic_flow",
      subscription: null,
      metadata: { mira_price_id: "price_synthetic" },
      ...overrides,
    } },
  };
}

describe("isolated Stripe purchase flow", () => {
  it("simulates account-bound one-time no-cost activation, duplicate delivery, and dashboard return", async () => {
    const repository = new InMemoryPaymentEventRepository();
    const account = { openId: "test-account-bound-before-payment", paymentState: "unpaid" as const, profile: "started" as const };
    const pending = createPendingCheckoutRecord({ name: "Synthetic Buyer", email: "synthetic@example.test" }, new Date("2026-09-03T10:00:00.000Z"), 30 * 60_000);
    repository.seedPending({ ...pending, openId: account.openId, createdAt: new Date(pending.createdAt), expiresAt: new Date(pending.expiresAt) });
    const paymentLink = buildStripePaymentLinkUrl("https://checkout.example.test/pay?source=mira", pending.referenceId);
    const paymentLinkParams = new URL(paymentLink).searchParams;
    expect(paymentLinkParams.get("client_reference_id")).toBe(pending.referenceId);
    expect(paymentLinkParams.get("source")).toBe("mira");
    expect(paymentLink).not.toContain("Synthetic Buyer");
    expect(paymentLink).not.toContain("synthetic@example.test");
    expect(account.paymentState).toBe("unpaid");

    const valid = await webhookRequest(repository, checkoutPayload(pending.referenceId));
    expect(valid).toEqual({ statusCode: 200, responseBody: { received: true, processed: true, action: "activated", state: "active" } });
    expect(repository.getIdentityByCustomer("cus_synthetic_flow")?.openId).toBe(account.openId);
    expect(isPaidPaymentState("active")).toBe(true);
    expect(paymentReturnDestination("active", "started")).toBe("/mira/dashboard");
    expect(paymentReturnDestination("active", "complete")).toBe("/mira/dashboard");

    const duplicate = await webhookRequest(repository, checkoutPayload(pending.referenceId));
    expect(duplicate).toEqual({ statusCode: 200, responseBody: { received: true, processed: false, action: "duplicate", state: null } });
    expect(repository.getPending(pending.referenceId)?.status).toBe("consumed");
  });

  it("keeps invalid signatures, forged query values, and billing mismatches from granting access", async () => {
    const repository = new InMemoryPaymentEventRepository();
    const pending = createPendingCheckoutRecord({ name: "Synthetic Buyer", email: "synthetic@example.test" }, new Date("2026-09-03T10:00:00.000Z"), 30 * 60_000);
    repository.seedPending({ ...pending, openId: "test-account-unpaid", createdAt: new Date(pending.createdAt), expiresAt: new Date(pending.expiresAt) });
    expect((await webhookRequest(repository, checkoutPayload(pending.referenceId), "v1=forged")).statusCode).toBe(400);
    const wrongPrice = await webhookRequest(repository, checkoutPayload(pending.referenceId, { metadata: { mira_price_id: "price_other", mira_subscription_status: "active" } }));
    expect(wrongPrice.statusCode).toBe(400);
    const wrongCurrency = await webhookRequest(repository, checkoutPayload(pending.referenceId, { currency: "usd" }));
    expect(wrongCurrency.statusCode).toBe(400);
    expect(paymentReturnDestination("pending", "complete")).toBeNull();
    expect(paymentReturnDestination(undefined, "complete")).toBeNull();
    expect(repository.getPending(pending.referenceId)?.status).toBe("pending");
  });
});
