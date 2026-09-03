import { and, eq, gt, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { miraPendingCheckouts, miraProcessedStripeEvents, miraStripeBillingIdentities, users } from "../../drizzle/schema";
import { getDb } from "../db";
import type { PaymentEventRepository, PaymentIdentity, PaymentState, PendingCheckoutIdentity } from "./paymentEventProcessor";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Payment database is unavailable");
  return db;
}

function toPending(row: typeof miraPendingCheckouts.$inferSelect): PendingCheckoutIdentity {
  return { referenceId: row.clientReferenceId, createdAt: row.createdAt, expiresAt: row.expiresAt, status: row.status === "consumed" ? "consumed" : row.status === "expired" ? "expired" : "pending", name: row.name, email: row.email, userId: row.photographerUserId };
}

function toIdentity(row: typeof miraStripeBillingIdentities.$inferSelect, openId: string): PaymentIdentity {
  return { openId, state: row.paymentState, customerId: row.stripeCustomerId, subscriptionId: row.stripeSubscriptionId ?? "", priceId: row.stripePriceId, currency: row.currency, cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd), cancelAt: row.cancelAt, currentPeriodEnd: row.currentPeriodEnd };
}

export class DrizzlePaymentRepository implements PaymentEventRepository {
  async createPendingCheckout(input: { name: string; email: string; clientReferenceId: string; expectedPriceId: string; expectedCurrency: string; photographerUserId?: number }) {
    const db = await requireDb();
    return db.transaction(async tx => {
      let userId = input.photographerUserId;
      let openId: string | null = null;
      if (userId) {
        const rows = await tx.select({ id: users.id, openId: users.openId }).from(users).where(eq(users.id, userId)).limit(1);
        if (!rows[0]) return null;
        openId = rows[0].openId;
      } else {
        const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
        if (existing[0]) return null;
        openId = `mira-stripe-${randomUUID()}`;
        const created = await tx.insert(users).values({ openId, name: input.name, email: input.email, loginMethod: "stripe" });
        userId = Number(created[0].insertId);
      }
      await tx.update(miraPendingCheckouts).set({ status: "expired" }).where(and(
        eq(miraPendingCheckouts.photographerUserId, userId),
        eq(miraPendingCheckouts.status, "pending"),
      ));
      await tx.insert(miraPendingCheckouts).values({
        clientReferenceId: input.clientReferenceId,
        photographerUserId: userId,
        name: input.name,
        email: input.email,
        expectedPriceId: input.expectedPriceId,
        expectedCurrency: input.expectedCurrency,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      return { referenceId: input.clientReferenceId, openId };
    });
  }

  async getPending(referenceId: string) {
    const db = await requireDb();
    const rows = await db.select().from(miraPendingCheckouts).where(eq(miraPendingCheckouts.clientReferenceId, referenceId)).limit(1);
    return rows[0] ? toPending(rows[0]) : null;
  }

  async consumePending(referenceId: string, identity: Omit<PaymentIdentity, "openId" | "state">) {
    const db = await requireDb();
    return db.transaction(async tx => {
      const now = new Date();
      const rows = await tx.select().from(miraPendingCheckouts).where(and(
        eq(miraPendingCheckouts.clientReferenceId, referenceId),
        eq(miraPendingCheckouts.status, "pending"),
        gt(miraPendingCheckouts.expiresAt, now),
      )).limit(1);
      const pending = rows[0];
      if (!pending) return null;
      const user = await tx.select({ openId: users.openId }).from(users).where(eq(users.id, pending.photographerUserId)).limit(1);
      if (!user[0]) return null;
      const changed = await tx.update(miraPendingCheckouts).set({ status: "consumed", consumedAt: now }).where(and(
        eq(miraPendingCheckouts.id, pending.id),
        eq(miraPendingCheckouts.status, "pending"),
        gt(miraPendingCheckouts.expiresAt, now),
      ));
      if (Number(changed[0].affectedRows) !== 1) return null;
      await tx.insert(miraStripeBillingIdentities).values({ photographerUserId: pending.photographerUserId, stripeCustomerId: identity.customerId, stripeSubscriptionId: identity.subscriptionId || null, stripePriceId: identity.priceId, currency: identity.currency, paymentState: "active", cancelAtPeriodEnd: identity.cancelAtPeriodEnd ? 1 : 0, cancelAt: identity.cancelAt, currentPeriodEnd: identity.currentPeriodEnd });
      return { openId: user[0].openId, state: "active" as const, ...identity };
    });
  }

  async findPaymentIdentity(params: { customerId?: string | null; subscriptionId?: string | null }) {
    const db = await requireDb();
    const conditions = [];
    if (params.customerId) conditions.push(eq(miraStripeBillingIdentities.stripeCustomerId, params.customerId));
    if (params.subscriptionId) conditions.push(eq(miraStripeBillingIdentities.stripeSubscriptionId, params.subscriptionId));
    if (!conditions.length) return null;
    const rows = await db.select({ billing: miraStripeBillingIdentities, openId: users.openId }).from(miraStripeBillingIdentities)
      .innerJoin(users, eq(users.id, miraStripeBillingIdentities.photographerUserId))
      .where(or(...conditions)).limit(1);
    return rows[0] ? toIdentity(rows[0].billing, rows[0].openId) : null;
  }

  async findPaymentIdentityForUser(openId: string) {
    const db = await requireDb();
    const rows = await db.select({ billing: miraStripeBillingIdentities, openId: users.openId }).from(miraStripeBillingIdentities)
      .innerJoin(users, eq(users.id, miraStripeBillingIdentities.photographerUserId))
      .where(eq(users.openId, openId)).limit(1);
    return rows[0] ? toIdentity(rows[0].billing, rows[0].openId) : null;
  }

  async getBillingIdentityForUser(openId: string) {
    return this.findPaymentIdentityForUser(openId);
  }

  async updatePaymentState(openId: string, state: PaymentState, details?: Pick<PaymentIdentity, "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd">) {
    const db = await requireDb();
    const rows = await db.select({ billing: miraStripeBillingIdentities, openId: users.openId }).from(miraStripeBillingIdentities)
      .innerJoin(users, eq(users.id, miraStripeBillingIdentities.photographerUserId))
      .where(eq(users.openId, openId)).limit(1);
    const current = rows[0];
    if (!current) return null;
    await db.update(miraStripeBillingIdentities).set({ paymentState: state, cancellationAt: state === "cancelled" ? new Date() : current.billing.cancellationAt, cancelAtPeriodEnd: details?.cancelAtPeriodEnd === undefined ? current.billing.cancelAtPeriodEnd : details.cancelAtPeriodEnd ? 1 : 0, cancelAt: details?.cancelAt === undefined ? current.billing.cancelAt : details.cancelAt, currentPeriodEnd: details?.currentPeriodEnd === undefined ? current.billing.currentPeriodEnd : details.currentPeriodEnd }).where(eq(miraStripeBillingIdentities.id, current.billing.id));
    return toIdentity({ ...current.billing, paymentState: state, cancelAtPeriodEnd: details?.cancelAtPeriodEnd === undefined ? current.billing.cancelAtPeriodEnd : details.cancelAtPeriodEnd ? 1 : 0, cancelAt: details?.cancelAt === undefined ? current.billing.cancelAt : details.cancelAt, currentPeriodEnd: details?.currentPeriodEnd === undefined ? current.billing.currentPeriodEnd : details.currentPeriodEnd }, openId);
  }

  async hasProcessedEvent(eventId: string) {
    const db = await requireDb();
    const rows = await db.select({ id: miraProcessedStripeEvents.id }).from(miraProcessedStripeEvents).where(eq(miraProcessedStripeEvents.stripeEventId, eventId)).limit(1);
    return Boolean(rows[0]);
  }

  async recordProcessedEvent(eventId: string, eventType = "unknown", processingResult = "processed") {
    const db = await requireDb();
    await db.insert(miraProcessedStripeEvents).values({ stripeEventId: eventId, eventType, processingResult }).catch(error => {
      if (!String(error).toLowerCase().includes("duplicate") && !String(error).toLowerCase().includes("unique")) throw error;
    });
  }
}

