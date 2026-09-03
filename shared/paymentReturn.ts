export const PAYMENT_CONFIRMATION_POLL_MS = 3_000;
export const PAYMENT_CONFIRMATION_TIMEOUT_MS = 30_000;

export type StoredPaymentState = "pending" | "active" | "past_due" | "cancelled" | "expired" | null | undefined;

export function isPaidPaymentState(state: StoredPaymentState, paymentStatus?: string | null) {
  return state ? state === "active" : paymentStatus === "paid" || paymentStatus === "test_active";
}

// Derives a StoredPaymentState from a getPhotographerAccess() response: Stripe
// mode returns an explicit paymentState, while local/test mode returns only
// paymentStatus. When there is no explicit paymentState, this must fall
// through to isPaidPaymentState's own paymentStatus check rather than
// fabricating a state string here - synthesizing anything other than
// null/undefined for an unrecognized paymentStatus would short-circuit that
// check (isPaidPaymentState treats any truthy state as authoritative) and
// hide a legitimately paid local/test account behind a "pending" state.
export function resolvePaymentState(access: { paymentState?: StoredPaymentState; paymentStatus?: string | null } | null | undefined): StoredPaymentState {
  if (!access) return undefined;
  return "paymentState" in access ? access.paymentState : undefined;
}

export function isBlockedPaymentState(state: StoredPaymentState) {
  return state === "past_due" || state === "cancelled" || state === "expired";
}

export function paymentReturnDestination(paymentState: StoredPaymentState, _onboardingStatus: "started" | "complete" | null, paymentStatus?: string | null) {
  if (!isPaidPaymentState(paymentState, paymentStatus)) return null;
  return "/mira/dashboard";
}

export function startPaymentConfirmationPoll(onPoll: () => void, onTimeout: () => void) {
  const interval = window.setInterval(onPoll, PAYMENT_CONFIRMATION_POLL_MS);
  const timeout = window.setTimeout(() => {
    window.clearInterval(interval);
    onTimeout();
  }, PAYMENT_CONFIRMATION_TIMEOUT_MS);
  return () => {
    window.clearInterval(interval);
    window.clearTimeout(timeout);
  };
}
