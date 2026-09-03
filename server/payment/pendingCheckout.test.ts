import { describe, expect, it } from "vitest";
import { buildStripePaymentLinkUrl } from "./pendingCheckout";
import { createPendingCheckoutRecord, generatePendingCheckoutReference } from "../localFileStore";

describe("pending checkout identity foundation", () => {
  it("generates unique opaque references with safe Stripe-compatible characters", () => {
    const first = generatePendingCheckoutReference();
    const second = generatePendingCheckoutReference();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{1,200}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{1,200}$/);
  });

  it("creates an expiring pending record without payment or profile state", () => {
    const now = new Date("2026-09-03T10:00:00.000Z");
    const record = createPendingCheckoutRecord({ name: "New Buyer", email: "buyer@example.test" }, now, 30 * 60_000);
    expect(record.status).toBe("pending");
    expect(record.createdAt).toBe(now.toISOString());
    expect(record.expiresAt).toBe("2026-09-03T10:30:00.000Z");
    expect(record).not.toHaveProperty("paymentStatus");
    expect(record).not.toHaveProperty("profile");
    expect(record.referenceId).not.toContain("New Buyer");
    expect(record.referenceId).not.toContain("buyer@example.test");
  });

  it("adds client_reference_id while preserving existing Payment Link parameters", () => {
    const url = buildStripePaymentLinkUrl("https://buy.stripe.example/link?prefilled_email=buyer%40example.test&foo=bar", "mira_pc_abc123");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("prefilled_email")).toBe("buyer@example.test");
    expect(parsed.searchParams.get("foo")).toBe("bar");
    expect(parsed.searchParams.get("client_reference_id")).toBe("mira_pc_abc123");
  });

  it("fails safely when the Stripe Payment Link is missing", () => {
    expect(() => buildStripePaymentLinkUrl("", "mira_pc_abc123")).toThrow("Stripe Payment Link is not configured");
  });
});
