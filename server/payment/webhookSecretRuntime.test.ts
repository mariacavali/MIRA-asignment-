import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeWebhookHandler } from "./stripeWebhook";

describe("private preview webhook signing secret", () => {
  it("accepts a correctly signed Stripe payload through the existing webhook handler", async () => {
    const secret = process.env.MIRA_STRIPE_WEBHOOK_SECRET;
    expect(secret).toMatch(/^whsec_/);

    const payload = JSON.stringify({
      id: "evt_test_mira_secret",
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_test" } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: secret!,
    });
    const stripe = new Stripe("sk_test_local_validation");
    let statusCode = 200;
    let responseBody: unknown;
    const handler = createStripeWebhookHandler({
      paymentMode: "stripe",
      webhookSecret: secret,
      stripe,
    });

    await handler(
      {
        body: Buffer.from(payload),
        header: (name: string) => name.toLowerCase() === "stripe-signature" ? signature : undefined,
      } as any,
      {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: unknown) {
          responseBody = body;
          return this;
        },
      } as any,
      () => undefined,
    );

    expect(statusCode).toBe(200);
    expect(responseBody).toEqual({ received: true, processed: false });
  });
});
