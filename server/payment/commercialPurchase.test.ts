import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landing = readFileSync(new URL("../../client/src/pages/MiraLanding.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../../client/src/pages/MiraPhotographerCheckout.tsx", import.meta.url), "utf8");
const signup = readFileSync(new URL("../../client/src/pages/MiraPhotographerSignup.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../../client/src/pages/MiraPhotographerLogin.tsx", import.meta.url), "utf8");

describe("photographer commercial purchase experience", () => {
  it("shows the approved offer and routes both public CTAs through the same secure purchase journey", () => {
    expect(landing).toContain("Prepare every client before the shoot begins.");
    expect(landing).toContain("€33.33");
    expect(landing).toContain("one-time");
    expect(landing).toContain("One payment. No recurring charges.");
    expect(checkout).toContain("One payment. No recurring charges.");
    expect(landing).toContain("Private preparation rooms for your clients");
    expect(landing).toContain("AI-assisted creative preparation");
    expect(landing).toContain("Clearer shoot direction before the session");
    expect(landing).toContain("Secure checkout powered by Stripe");
    expect(landing.match(/href="\/mira\/signup"/g)).toHaveLength(2);
    expect(signup).toContain('window.location.assign("/mira/checkout")');
    expect(signup).toContain('/mira/login?returnTo=/mira/checkout');
    expect(signup).toContain('new URLSearchParams({ returnTo: "/mira/checkout", email: form.email })');
    expect(signup).toContain('if (/already exists/i.test(mutationError.message))');
    expect(signup).toContain('sessionStorage.setItem("mira_purchase_return_to", "/mira/checkout")');
    expect(login).toContain('get("email") ?? ""');
    expect(login).toContain('get("returnTo") === "/mira/checkout"');
    expect(login).toContain('sessionStorage.getItem("mira_purchase_return_to")');
    expect(login).toContain('sessionStorage.setItem("mira_purchase_email", email.trim().toLowerCase())');
    expect(login).toContain('window.location.assign(returnToCheckout ? "/mira/checkout" : "/mira/account")');
    expect(checkout).toContain('purchase.mutate({ email: purchaseEmail })');
  });

  it("keeps Stripe redirection in the same tab and leaves payment activation behind the server boundary", () => {
    expect(checkout).toContain("trpc.miraCore.completeLocalPurchase.useMutation");
    expect(checkout).toContain('redirectPath: "/mira/signup"');
    expect(checkout).toContain("purchase.mutate({ email: purchaseEmail })");
    expect(checkout).toContain("window.location.assign(result.redirectUrl)");
    expect(checkout).toContain("Secure checkout powered by Stripe");
    expect(checkout).not.toMatch(/Activate test access|Test payment|Local payment|Mock payment|Developer mode/i);
    expect(`${landing}\n${checkout}`).not.toMatch(/MARIATEST|MIRADEMO|promo_1TKjXwAyPllSTyTE7wbb6mOO|nEH2OgQB/);
  });
});
