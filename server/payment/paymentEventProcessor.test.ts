import { describe, expect, it } from "vitest";
import { InMemoryPaymentEventRepository, paymentStateGrantsAccess, processPaymentEvent, type NormalizedPaymentEvent } from "./paymentEventProcessor";

const baseEvent: NormalizedPaymentEvent = {
  eventId: "evt-checkout-1",
  type: "checkout.session.completed",
  paymentMode: "subscription",
  currency: "eur",
  priceId: "price-mira",
  paid: true,
  subscriptionStatus: "active",
  clientReferenceId: "mira_pc_reference",
  customerId: "cus-test",
  subscriptionId: "sub-test",
};

function repositoryWithPending(expiresAt = new Date("2026-09-04T10:00:00.000Z")) {
  const repository = new InMemoryPaymentEventRepository();
  repository.seedPending({ referenceId: "mira_pc_reference", createdAt: new Date("2026-09-03T09:00:00.000Z"), expiresAt, status: "pending" });
  return repository;
}

function process(event: NormalizedPaymentEvent, repository = repositoryWithPending(), now = new Date("2026-09-03T10:00:00.000Z")) {
  return processPaymentEvent(event, repository, { currency: "eur", priceId: "price-mira", now: () => now });
}

describe("provider-neutral payment event processor", () => {
  it("activates a valid completed subscription from the opaque reference", async () => {
    const repository = repositoryWithPending();
    const result = await process(baseEvent, repository);
    expect(result).toEqual({ accepted: true, action: "activated", state: "active" });
    expect(repository.getIdentityByCustomer("cus-test")?.state).toBe("active");
  });

  it.each([
    ["unknown reference", { clientReferenceId: "mira_pc_unknown" }, "unknown_reference"],
    ["expired reference", {}, "expired_reference"],
    ["consumed reference", {}, "consumed_reference"],
    ["wrong price", { priceId: "price-other" }, "wrong_price"],
    ["wrong currency", { currency: "usd" }, "wrong_currency"],
    ["unpaid checkout", { paid: false }, "unpaid"],
    ["incomplete subscription", { subscriptionStatus: "incomplete" }, "subscription_not_active"],
  ] as const)("rejects %s", async (_label, overrides, reason) => {
    const repository = repositoryWithPending();
    if (_label === "expired reference") repository.seedPending({ referenceId: "mira_pc_reference", createdAt: new Date("2026-09-01T09:00:00.000Z"), expiresAt: new Date("2026-09-03T09:00:00.000Z"), status: "pending" });
    if (_label === "consumed reference") {
      repository.seedPending({ referenceId: "mira_pc_reference", createdAt: new Date("2026-09-03T09:00:00.000Z"), expiresAt: new Date("2026-09-04T10:00:00.000Z"), status: "consumed" });
    }
    const result = await process({ ...baseEvent, ...overrides }, repository);
    expect(result).toEqual({ accepted: false, action: "rejected", reason });
  });

  it("rejects an email collision without consulting email identity", async () => {
    const repository = repositoryWithPending();
    const result = await process({ ...baseEvent, clientReferenceId: "mira_pc_other", customerId: "cus-collision" }, repository);
    expect(result.reason).toBe("unknown_reference");
    expect(repository.getIdentityByCustomer("cus-test")).toBeNull();
  });

  it("makes duplicate webhook delivery idempotent", async () => {
    const repository = repositoryWithPending();
    expect((await process(baseEvent, repository)).action).toBe("activated");
    expect((await process(baseEvent, repository)).action).toBe("duplicate");
  });

  it.each([
    ["customer.subscription.updated", "active", true, "active"],
    ["invoice.paid", "active", true, "active"],
    ["invoice.payment_failed", "past_due", false, "past_due"],
    ["customer.subscription.deleted", "cancelled", false, "cancelled"],
  ] as const)("handles %s as %s", async (type, expected, paid, state) => {
    const repository = repositoryWithPending();
    await process(baseEvent, repository);
    const result = await process({ ...baseEvent, eventId: `evt-${type}`, type, paid, subscriptionStatus: expected }, repository);
    expect(result).toEqual({ accepted: true, action: "updated", state });
  });

  it("rejects unsupported payment mode", async () => {
    expect((await process({ ...baseEvent, paymentMode: "payment" })).reason).toBe("wrong_payment_mode");
  });

  it.each(["pending", "past_due", "cancelled", "expired"] as const)("denies access for %s payment state", state => {
    expect(paymentStateGrantsAccess(state)).toBe(false);
  });

  it("grants access only for active payment state", () => {
    expect(paymentStateGrantsAccess("active")).toBe(true);
    expect(paymentStateGrantsAccess(null)).toBe(false);
  });

  it("keeps scheduled cancellation active and clears it on reactivation", async () => {
    const repository = repositoryWithPending();
    await process(baseEvent, repository);
    const periodEnd = new Date("2027-01-01T00:00:00.000Z");
    await process({ ...baseEvent, eventId: "evt-cancel-at-period-end", type: "customer.subscription.updated", subscriptionStatus: "active", cancelAtPeriodEnd: true, cancelAt: periodEnd, currentPeriodEnd: periodEnd }, repository);
    expect(repository.getIdentityByCustomer("cus-test")).toMatchObject({ state: "active", cancelAtPeriodEnd: true, cancelAt: periodEnd, currentPeriodEnd: periodEnd });
    await process({ ...baseEvent, eventId: "evt-reactivated", type: "customer.subscription.updated", subscriptionStatus: "active", cancelAtPeriodEnd: false, cancelAt: null, currentPeriodEnd: periodEnd }, repository);
    expect(repository.getIdentityByCustomer("cus-test")).toMatchObject({ state: "active", cancelAtPeriodEnd: false, cancelAt: null });
  });

  it("revokes access only after verified subscription deletion", async () => {
    const repository = repositoryWithPending();
    await process(baseEvent, repository);
    await process({ ...baseEvent, eventId: "evt-deleted", type: "customer.subscription.deleted", subscriptionStatus: "cancelled" }, repository);
    expect(repository.getIdentityByCustomer("cus-test")?.state).toBe("cancelled");
    expect(paymentStateGrantsAccess(repository.getIdentityByCustomer("cus-test")?.state)).toBe(false);
  });
});
