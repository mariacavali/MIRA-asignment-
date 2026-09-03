import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../drizzle/schema", () => ({
  miraPendingCheckouts: { clientReferenceId: "clientReferenceId", status: "status", expiresAt: "expiresAt", id: "id" },
  miraStripeBillingIdentities: { stripeCustomerId: "stripeCustomerId", stripeSubscriptionId: "stripeSubscriptionId", id: "id", paymentState: "paymentState", stripePriceId: "stripePriceId" },
  miraProcessedStripeEvents: { id: "id", stripeEventId: "stripeEventId" },
  users: { id: "id", openId: "openId" },
}));
vi.mock("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: (...values: unknown[]) => values, gt: (...values: unknown[]) => values, or: (...values: unknown[]) => values }));

import { DrizzlePaymentRepository } from "./drizzlePaymentRepository";

const pendingRow = {
  id: 11,
  clientReferenceId: "mira_pc_synthetic",
  name: "Synthetic Buyer",
  email: "synthetic@example.test",
  createdAt: new Date("2026-09-03T10:00:00.000Z"),
  expiresAt: new Date("2026-09-04T10:00:00.000Z"),
  status: "pending" as const,
};

function database(affectedRows = 1) {
  const tx = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [pendingRow]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows }]) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: 55 }]) })),
  };
  return { transaction: vi.fn(async callback => callback(tx)), tx };
}

function createDatabase(existingUser: { id: number; openId: string } | null = null) {
  const tx = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => existingUser ? [existingUser] : []) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 0 }]) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: existingUser?.id ?? 77 }]) })),
  };
  return { transaction: vi.fn(async callback => callback(tx)), tx };
}

beforeEach(() => mocks.getDb.mockReset());

describe("Drizzle payment repository", () => {
  it("creates a pending checkout and a new unpaid account atomically for a unique email", async () => {
    const db = createDatabase();
    mocks.getDb.mockResolvedValue(db);
    const result = await new DrizzlePaymentRepository().createPendingCheckout({ name: "New Buyer", email: "new@example.test", clientReferenceId: "mira_pc_unique", expectedPriceId: "price_synthetic", expectedCurrency: "eur" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.tx.insert).toHaveBeenCalledTimes(2);
    expect(result?.referenceId).toBe("mira_pc_unique");
  });

  it("rejects an existing email without selecting or activating that account", async () => {
    const db = createDatabase({ id: 88, openId: "existing-open-id" });
    mocks.getDb.mockResolvedValue(db);
    const result = await new DrizzlePaymentRepository().createPendingCheckout({ name: "Buyer", email: "existing@example.test", clientReferenceId: "mira_pc_duplicate", expectedPriceId: "price_synthetic", expectedCurrency: "eur" });
    expect(result).toBeNull();
    expect(db.tx.insert).not.toHaveBeenCalled();
  });

  it("binds an authenticated pending checkout to the supplied internal user ID", async () => {
    const db = createDatabase({ id: 55, openId: "authenticated-open-id" });
    mocks.getDb.mockResolvedValue(db);
    const result = await new DrizzlePaymentRepository().createPendingCheckout({ name: "Ignored Name", email: "ignored@example.test", clientReferenceId: "mira_pc_bound", expectedPriceId: "price_synthetic", expectedCurrency: "eur", photographerUserId: 55 });
    expect(result).toEqual({ referenceId: "mira_pc_bound", openId: "authenticated-open-id" });
    expect(db.tx.insert).toHaveBeenCalledTimes(1);
  });

  it("consumes pending checkout and activates billing in one transaction", async () => {
    const db = database();
    mocks.getDb.mockResolvedValue(db);
    const result = await new DrizzlePaymentRepository().consumePending("mira_pc_synthetic", { customerId: "cus_synthetic", subscriptionId: "sub_synthetic", priceId: "price_synthetic", currency: "eur" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.tx.update).toHaveBeenCalledTimes(1);
    expect(db.tx.insert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ state: "active", customerId: "cus_synthetic", subscriptionId: "sub_synthetic" });
  });

  it("does not insert a user or billing identity when the conditional consume loses a race", async () => {
    const db = database(0);
    mocks.getDb.mockResolvedValue(db);
    const result = await new DrizzlePaymentRepository().consumePending("mira_pc_synthetic", { customerId: "cus_synthetic", subscriptionId: "sub_synthetic", priceId: "price_synthetic", currency: "eur" });
    expect(result).toBeNull();
    expect(db.tx.insert).not.toHaveBeenCalled();
  });

  it("fails closed when the database is unavailable", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(new DrizzlePaymentRepository().getPending("mira_pc_synthetic")).rejects.toThrow("Payment database is unavailable");
  });
});
