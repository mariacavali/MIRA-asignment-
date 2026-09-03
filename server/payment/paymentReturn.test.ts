import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isBlockedPaymentState, isPaidPaymentState, paymentReturnDestination, PAYMENT_CONFIRMATION_POLL_MS, PAYMENT_CONFIRMATION_TIMEOUT_MS, resolvePaymentState, startPaymentConfirmationPoll } from "../../shared/paymentReturn";

afterEach(() => vi.useRealTimers());

describe("payment return flow", () => {
  it("polls at a modest interval and stops at the timeout", () => {
    vi.useFakeTimers();
    const poll = vi.fn();
    const timeout = vi.fn();
    const originalWindow = globalThis.window;
    globalThis.window = { setInterval, clearInterval, setTimeout, clearTimeout } as unknown as Window & typeof globalThis;
    const cleanup = startPaymentConfirmationPoll(poll, timeout);
    vi.advanceTimersByTime(PAYMENT_CONFIRMATION_POLL_MS * 2 + 100);
    expect(poll).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(PAYMENT_CONFIRMATION_TIMEOUT_MS - PAYMENT_CONFIRMATION_POLL_MS * 2);
    expect(timeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PAYMENT_CONFIRMATION_POLL_MS * 2);
    expect(poll).toHaveBeenCalledTimes(10);
    cleanup();
    globalThis.window = originalWindow;
  });

  it("treats only stored active state as paid and blocks other states", () => {
    expect(isPaidPaymentState("active", "unpaid")).toBe(true);
    expect(isPaidPaymentState(null, "test_active")).toBe(true);
    expect(isPaidPaymentState("past_due", "paid")).toBe(false);
    expect(isPaidPaymentState("pending", "paid")).toBe(false);
    expect(["past_due", "cancelled", "expired"].every(state => isBlockedPaymentState(state as "past_due" | "cancelled" | "expired"))).toBe(true);
  });

  it("resolves a local/test account (paymentStatus only, no explicit paymentState) as paid, not pending", () => {
    // Regression: a getPhotographerAccess() response for local mode carries only
    // paymentStatus ("test_active"), no paymentState. resolvePaymentState must
    // pass that through as undefined so isPaidPaymentState falls back to
    // paymentStatus, rather than the page fabricating a "pending" string that
    // would make isPaidPaymentState ignore paymentStatus entirely.
    const localTestAccess = { paymentStatus: "test_active" as const, selectedPlan: "MIRA Studio" };
    const state = resolvePaymentState(localTestAccess);
    expect(state).toBeUndefined();
    expect(isPaidPaymentState(state, localTestAccess.paymentStatus)).toBe(true);
    expect(isBlockedPaymentState(state)).toBe(false);
    expect(paymentReturnDestination(state, "complete", localTestAccess.paymentStatus)).toBe("/mira/dashboard");
    expect(paymentReturnDestination(state, "started", localTestAccess.paymentStatus)).toBe("/mira/onboarding");
  });

  it("resolves an unpaid local account as not paid and not blocked", () => {
    const unpaidAccess = { paymentStatus: "unpaid" as const, selectedPlan: null };
    const state = resolvePaymentState(unpaidAccess);
    expect(isPaidPaymentState(state, unpaidAccess.paymentStatus)).toBe(false);
    expect(isBlockedPaymentState(state)).toBe(false);
  });

  it("still trusts an explicit Stripe paymentState over paymentStatus", () => {
    const stripeAccess = { paymentState: "past_due" as const, paymentStatus: "unpaid" };
    expect(resolvePaymentState(stripeAccess)).toBe("past_due");
    expect(isBlockedPaymentState(resolvePaymentState(stripeAccess))).toBe(true);
  });

  it("resolves null/undefined access as unresolved, not paid", () => {
    expect(resolvePaymentState(null)).toBeUndefined();
    expect(resolvePaymentState(undefined)).toBeUndefined();
  });

  it("does not use return query payment values or activate payment in the page", () => {
    const source = readFileSync(new URL("../../client/src/pages/MiraPaymentSuccess.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/session_id|payment_status|searchParams|activateLocalPlan/);
    expect(source).toContain("getPhotographerAccess");
    expect(source).toContain("/mira/login");
    expect(source).toContain("/mira/checkout");
  });
});