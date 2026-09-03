export type PaymentState = "pending" | "active" | "past_due" | "cancelled" | "expired";
export type MaybePromise<T> = T | Promise<T>;

export function paymentStateGrantsAccess(state: PaymentState | null | undefined) {
  return state === "active";
}

export type NormalizedPaymentEvent = {
  eventId: string;
  type: "checkout.session.completed" | "customer.subscription.updated" | "customer.subscription.deleted" | "invoice.paid" | "invoice.payment_failed";
  paymentMode: "subscription" | "payment";
  currency: string;
  priceId: string;
  paid: boolean;
  subscriptionStatus: "active" | "past_due" | "cancelled" | "incomplete" | "incomplete_expired" | "unpaid" | null;
  clientReferenceId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: Date | null;
  currentPeriodEnd?: Date | null;
};

export type PendingCheckoutIdentity = {
  referenceId: string;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "consumed" | "expired";
  name?: string;
  email?: string;
  userId?: number;
  openId?: string;
};

export type PaymentIdentity = {
  openId: string;
  state: PaymentState;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  currency: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  currentPeriodEnd: Date | null;
};

export interface PaymentEventRepository {
  getPending(referenceId: string): MaybePromise<PendingCheckoutIdentity | null>;
  consumePending(referenceId: string, identity: Omit<PaymentIdentity, "openId" | "state" | "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd"> & Partial<Pick<PaymentIdentity, "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd">>): MaybePromise<PaymentIdentity | null>;
  findPaymentIdentity(params: { customerId?: string | null; subscriptionId?: string | null }): MaybePromise<PaymentIdentity | null>;
  updatePaymentState(openId: string, state: PaymentState, details?: Pick<PaymentIdentity, "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd">): MaybePromise<PaymentIdentity | null>;
  hasProcessedEvent(eventId: string): MaybePromise<boolean>;
  recordProcessedEvent(eventId: string, eventType?: string, processingResult?: string): MaybePromise<void>;
}

export type PaymentProcessorConfig = {
  currency: string;
  priceId: string;
  now?: () => Date;
};

export type PaymentProcessResult = {
  accepted: boolean;
  action: "activated" | "updated" | "duplicate" | "rejected";
  state?: PaymentState;
  reason?: "invalid_event" | "wrong_payment_mode" | "wrong_currency" | "wrong_price" | "unpaid" | "subscription_not_active" | "missing_reference" | "unknown_reference" | "expired_reference" | "consumed_reference" | "unknown_payment_identity";
};

function validEvent(event: NormalizedPaymentEvent, config: PaymentProcessorConfig) {
  if (event.paymentMode !== "subscription") return "wrong_payment_mode" as const;
  if (event.currency.toLowerCase() !== config.currency.toLowerCase()) return "wrong_currency" as const;
  if (event.priceId !== config.priceId) return "wrong_price" as const;
  return null;
}

function transitionFor(event: NormalizedPaymentEvent): { state: PaymentState; details?: Pick<PaymentIdentity, "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd"> } | null {
  const details = { cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false, cancelAt: event.cancelAt ?? null, currentPeriodEnd: event.currentPeriodEnd ?? null };
  if (event.type === "customer.subscription.deleted") return { state: "cancelled", details: { ...details, cancelAtPeriodEnd: false } };
  if (event.type === "invoice.payment_failed") return { state: "past_due", details: { ...details, cancelAtPeriodEnd: false, cancelAt: null } };
  if (event.type === "invoice.paid" || event.type === "customer.subscription.updated") {
    if (event.subscriptionStatus === "active" && event.paid) return { state: "active", details };
    if (event.subscriptionStatus === "past_due" || event.subscriptionStatus === "unpaid") return { state: "past_due", details: { ...details, cancelAtPeriodEnd: false, cancelAt: null } };
    if (event.subscriptionStatus === "cancelled" || event.subscriptionStatus === "incomplete_expired") return { state: "cancelled", details: { ...details, cancelAtPeriodEnd: false } };
    return null;
  }
  return null;
}

export async function processPaymentEvent(event: NormalizedPaymentEvent, repository: PaymentEventRepository, config: PaymentProcessorConfig): Promise<PaymentProcessResult> {
  if (!event.eventId || await repository.hasProcessedEvent(event.eventId)) return { accepted: true, action: "duplicate" };
  const validationError = validEvent(event, config);
  if (validationError) return { accepted: false, action: "rejected", reason: validationError };

  if (event.type === "checkout.session.completed") {
    if (!event.clientReferenceId) return { accepted: false, action: "rejected", reason: "missing_reference" };
    if (!event.paid) return { accepted: false, action: "rejected", reason: "unpaid" };
    if (event.subscriptionStatus !== "active") return { accepted: false, action: "rejected", reason: "subscription_not_active" };
    const pending = await repository.getPending(event.clientReferenceId);
    if (!pending) return { accepted: false, action: "rejected", reason: "unknown_reference" };
    if (pending.status === "expired" || pending.expiresAt.getTime() <= (config.now ? config.now() : new Date()).getTime()) return { accepted: false, action: "rejected", reason: "expired_reference" };
    if (pending.status !== "pending") return { accepted: false, action: "rejected", reason: "consumed_reference" };
    if (!event.customerId || !event.subscriptionId) return { accepted: false, action: "rejected", reason: "invalid_event" };
    const identity = await repository.consumePending(event.clientReferenceId, {
      customerId: event.customerId,
      subscriptionId: event.subscriptionId,
      priceId: event.priceId,
      currency: event.currency,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
      cancelAt: event.cancelAt ?? null,
      currentPeriodEnd: event.currentPeriodEnd ?? null,
    });
    if (!identity) return { accepted: false, action: "rejected", reason: "consumed_reference" };
    await repository.recordProcessedEvent(event.eventId, event.type, "activated");
    return { accepted: true, action: "activated", state: identity.state };
  }

  const identity = await repository.findPaymentIdentity({ customerId: event.customerId, subscriptionId: event.subscriptionId });
  if (!identity) return { accepted: false, action: "rejected", reason: "unknown_payment_identity" };
  const transition = transitionFor(event);
  if (!transition) return { accepted: false, action: "rejected", reason: event.paid ? "subscription_not_active" : "unpaid" };
  const updated = await repository.updatePaymentState(identity.openId, transition.state, transition.details);
  if (!updated) return { accepted: false, action: "rejected", reason: "unknown_payment_identity" };
  await repository.recordProcessedEvent(event.eventId, event.type, "updated");
  return { accepted: true, action: "updated", state: updated.state };
}

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly pending = new Map<string, PendingCheckoutIdentity>();
  private readonly identities = new Map<string, PaymentIdentity>();
  private readonly processed = new Set<string>();
  private nextOpenId = 1;

  seedPending(record: PendingCheckoutIdentity) {
    this.pending.set(record.referenceId, { ...record });
  }

  getPending(referenceId: string) {
    return this.pending.get(referenceId) ?? null;
  }

  consumePending(referenceId: string, identity: Omit<PaymentIdentity, "openId" | "state" | "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd"> & Partial<Pick<PaymentIdentity, "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd">>) {
    const pending = this.pending.get(referenceId);
    if (!pending || pending.status !== "pending") return null;
    const created: PaymentIdentity = { ...identity, openId: pending.openId ?? `test-payment-user-${this.nextOpenId++}`, state: "active", cancelAtPeriodEnd: identity.cancelAtPeriodEnd ?? false, cancelAt: identity.cancelAt ?? null, currentPeriodEnd: identity.currentPeriodEnd ?? null };
    pending.status = "consumed";
    this.identities.set(created.openId, created);
    return created;
  }

  findPaymentIdentity(params: { customerId?: string | null; subscriptionId?: string | null }) {
    return Array.from(this.identities.values()).find(identity => (params.customerId && identity.customerId === params.customerId) || (params.subscriptionId && identity.subscriptionId === params.subscriptionId)) ?? null;
  }

  updatePaymentState(openId: string, state: PaymentState, details?: Pick<PaymentIdentity, "cancelAtPeriodEnd" | "cancelAt" | "currentPeriodEnd">) {
    const identity = this.identities.get(openId);
    if (!identity) return null;
    identity.state = state;
    if (details) Object.assign(identity, details);
    return identity;
  }

  hasProcessedEvent(eventId: string) {
    return this.processed.has(eventId);
  }

  recordProcessedEvent(eventId: string) {
    this.processed.add(eventId);
  }

  getIdentityByCustomer(customerId: string) {
    return Array.from(this.identities.values()).find(identity => identity.customerId === customerId) ?? null;
  }
}
