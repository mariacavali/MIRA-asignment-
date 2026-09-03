import express from "express";
import http from "node:http";
import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { InMemoryPaymentEventRepository } from "./paymentEventProcessor";
import { createStripeWebhookHandler, normalizeStripeEvent } from "./stripeWebhook";

const secret = "whsec_synthetic_test_secret";
const stripe = new Stripe("sk_test_synthetic_key");

function checkoutPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_synthetic_checkout",
    object: "event",
    api_version: "2025-01-27.acacia",
    created: 1_757_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_synthetic",
        object: "checkout.session",
        client_reference_id: "mira_pc_synthetic",
        mode: "subscription",
        payment_status: "paid",
        status: "complete",
        currency: "eur",
        customer: "cus_synthetic",
        subscription: "sub_synthetic",
        metadata: { mira_price_id: "price_synthetic", mira_subscription_status: "active" },
        ...overrides,
      },
    },
  };
}

function signedPayload(payload: unknown) {
  const body = JSON.stringify(payload);
  return { body, signature: stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
}

function request(app: express.Express, body: string, signature?: string, contentType = "application/json") {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const server = http.createServer(app).listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("test server did not start"));
      const req = http.request({ hostname: "127.0.0.1", port: address.port, path: "/api/webhooks/stripe", method: "POST", headers: { "Content-Type": contentType, "Content-Length": Buffer.byteLength(body), ...(signature ? { "Stripe-Signature": signature } : {}) } }, response => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { responseBody += chunk; });
        response.on("end", () => { server.close(); resolve({ status: response.statusCode ?? 0, body: JSON.parse(responseBody) }); });
      });
      req.on("error", error => { server.close(); reject(error); });
      req.end(body);
    });
  });
}

function appFor(repository?: InMemoryPaymentEventRepository, options: Partial<Parameters<typeof createStripeWebhookHandler>[0]> = {}) {
  const app = express();
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), createStripeWebhookHandler({ repository, stripe, webhookSecret: secret, paymentMode: "stripe", currency: "eur", priceId: "price_synthetic", ...options }));
  app.use(express.json());
  return app;
}

describe("signed Stripe webhook boundary", () => {
  it("verifies a synthetic signature against the untouched raw body and processes checkout", async () => {
    const repository = new InMemoryPaymentEventRepository();
    repository.seedPending({ referenceId: "mira_pc_synthetic", createdAt: new Date("2026-09-03T10:00:00.000Z"), expiresAt: new Date("2026-09-04T10:00:00.000Z"), status: "pending" });
    const payload = signedPayload(checkoutPayload());
    const response = await request(appFor(repository, { now: () => new Date("2026-09-03T12:00:00.000Z") }), payload.body, payload.signature);
    expect(response).toEqual({ status: 200, body: { received: true, processed: true, action: "activated", state: "active" } });
  });

  it("rejects missing and invalid signatures without exposing payload data", async () => {
    const body = JSON.stringify(checkoutPayload());
    expect((await request(appFor(), body)).status).toBe(400);
    expect((await request(appFor(), body, "v1=invalid")).status).toBe(400);
  });

  it("rejects malformed signed JSON", async () => {
    const body = "{malformed";
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect((await request(appFor(), body, signature)).status).toBe(400);
  });

  it("fails safely when Stripe mode or verification configuration is unavailable", async () => {
    const payload = signedPayload(checkoutPayload());
    expect((await request(appFor(), payload.body, payload.signature)).status).toBe(503);
    expect((await request(appFor(undefined, { paymentMode: "local" }), payload.body, payload.signature)).status).toBe(400);
    expect((await request(appFor(undefined, { webhookSecret: "" }), payload.body, payload.signature)).status).toBe(503);
  });

  it("acknowledges unsupported verified events without state changes", async () => {
    const event = { ...checkoutPayload(), id: "evt_synthetic_unknown", type: "customer.created", data: { object: { id: "cus_synthetic" } } };
    const payload = signedPayload(event);
    const response = await request(appFor(), payload.body, payload.signature);
    expect(response).toEqual({ status: 200, body: { received: true, processed: false } });
  });

  it("normalizes only safe ownership and billing fields, never email", () => {
    const normalized = normalizeStripeEvent(checkoutPayload() as Stripe.Event);
    expect(normalized).toMatchObject({ type: "checkout.session.completed", clientReferenceId: "mira_pc_synthetic", customerId: "cus_synthetic", subscriptionId: "sub_synthetic", currency: "eur", priceId: "price_synthetic" });
    expect(normalized).not.toHaveProperty("email");
  });

  it("keeps duplicate verified delivery idempotent", async () => {
    const repository = new InMemoryPaymentEventRepository();
    repository.seedPending({ referenceId: "mira_pc_synthetic", createdAt: new Date("2026-09-03T10:00:00.000Z"), expiresAt: new Date("2026-09-04T10:00:00.000Z"), status: "pending" });
    const payload = signedPayload(checkoutPayload());
    const app = appFor(repository, { now: () => new Date("2026-09-03T12:00:00.000Z") });
    expect((await request(app, payload.body, payload.signature)).body.action).toBe("activated");
    expect((await request(app, payload.body, payload.signature)).body.action).toBe("duplicate");
  });
});
