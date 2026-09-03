import { describe, expect, it, vi } from "vitest";
import { buildPortalReturnUrl, createPortalSessionForUser, validatePortalUrl } from "./stripePortal";
import { readFileSync } from "node:fs";

const activeIdentity = {
  openId: "photographer-a",
  state: "active" as const,
  customerId: "customer-a",
  subscriptionId: "subscription-a",
  priceId: "price-mira",
  currency: "eur",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  currentPeriodEnd: null,
};

function repository(identity = activeIdentity) {
  return { getBillingIdentityForUser: vi.fn(async (openId: string) => openId === "photographer-a" ? identity : null) };
}

function stripe(url = "https://billing.stripe.com/p/session/synthetic") {
  return { billingPortal: { sessions: { create: vi.fn(async () => ({ url })) } } };
}

describe("Stripe Customer Portal access", () => {
  it("creates a portal session using only the authenticated user's stored customer identity", async () => {
    const repo = repository();
    const client = stripe();
    const result = await createPortalSessionForUser({ userOpenId: "photographer-a", repository: repo, stripe: client, paymentMode: "stripe", publicBaseUrl: "https://mira.example" });
    expect(result).toBe("https://billing.stripe.com/p/session/synthetic");
    expect(repo.getBillingIdentityForUser).toHaveBeenCalledWith("photographer-a");
    expect(client.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "customer-a", return_url: "https://mira.example/mira/dashboard" });
  });

  it("rejects unpaid, missing, and local-test identities without calling Stripe", async () => {
    const client = stripe();
    await expect(createPortalSessionForUser({ userOpenId: "photographer-a", repository: repository({ ...activeIdentity, state: "past_due" }), stripe: client, paymentMode: "stripe", publicBaseUrl: "https://mira.example" })).rejects.toThrow();
    await expect(createPortalSessionForUser({ userOpenId: "missing", repository: repository(), stripe: client, paymentMode: "stripe", publicBaseUrl: "https://mira.example" })).rejects.toThrow();
    await expect(createPortalSessionForUser({ userOpenId: "photographer-a", repository: repository(), stripe: client, paymentMode: "local", publicBaseUrl: "https://mira.example" })).rejects.toThrow();
    expect(client.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("keeps scheduled cancellation eligible while preserving the stored period fields", async () => {
    const identity = { ...activeIdentity, cancelAtPeriodEnd: true, cancelAt: new Date("2027-01-01T00:00:00.000Z"), currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z") };
    const client = stripe();
    await expect(createPortalSessionForUser({ userOpenId: "photographer-a", repository: repository(identity), stripe: client, paymentMode: "stripe", publicBaseUrl: "https://mira.example" })).resolves.toContain("billing.stripe.com");
  });

  it("rejects invalid portal hosts and unsafe return bases", () => {
    expect(validatePortalUrl("https://example.com/portal")).toBeNull();
    expect(validatePortalUrl("http://billing.stripe.com/session")).toBeNull();
    expect(buildPortalReturnUrl("https://mira.example/base")).toBe("https://mira.example/base/mira/dashboard");
    expect(() => buildPortalReturnUrl("https://evil.example/?redirect=https://other.example")).toThrow();
  });

  it("ignores forged browser identity and return-url fields", async () => {
    const client = stripe();
    await createPortalSessionForUser({ userOpenId: "photographer-a", repository: repository(), stripe: client, paymentMode: "stripe", publicBaseUrl: "https://mira.example", customerId: "other-customer", subscriptionId: "other-subscription", returnUrl: "https://evil.example" } as never);
    expect(client.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "customer-a", return_url: "https://mira.example/mira/dashboard" });
  });

  it("keeps the router procedure authenticated and the dashboard action single-flight", () => {
    const routerSource = readFileSync(new URL("../miraCore/router.ts", import.meta.url), "utf8");
    const dashboardSource = readFileSync(new URL("../../client/src/pages/MiraDashboard.tsx", import.meta.url), "utf8");
    expect(routerSource).toContain("createCustomerPortalSession: protectedProcedure.input(z.object({}).strict())");
    expect(dashboardSource).toContain("disabled={portalPending}");
    expect(dashboardSource).toContain("portal.mutate({})");
  });
});
