import { describe, expect, it } from "vitest";

describe("private preview checkout runtime", () => {
  it("resolves the existing payment-success route through the configured public application base URL", async () => {
    const baseUrl = process.env.MIRA_PUBLIC_APP_BASE_URL;

    expect(baseUrl).toBeTruthy();

    const response = await fetch(new URL("/mira/payment-success", baseUrl));

    expect(response.ok).toBe(true);
    expect(await response.text()).toContain("Mira V3 Private Staging");
  });

  it("creates an account session before returning an account-bound Stripe Payment Link", async () => {
    const baseUrl = process.env.MIRA_TEST_BASE_URL ?? "http://127.0.0.1:3000";
    const email = `checkout-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
    const signup = await fetch(`${baseUrl}/api/trpc/miraCore.createLocalPhotographerAccount?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: { json: { firstName: "Checkout", lastName: "Runtime", email, password: "runtime-test-password" } } }),
    });
    expect(signup.ok).toBe(true);
    const sessionCookie = signup.headers.get("set-cookie")?.split(";")[0];
    expect(sessionCookie).toMatch(/^mira_local_session=/);

    const response = await fetch(`${baseUrl}/api/trpc/miraCore.completeLocalPurchase?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie ?? "" },
      body: JSON.stringify({ 0: { json: {} } }),
    });

    expect(response.ok).toBe(true);

    const payload = await response.json() as Array<{
      result?: { data?: { json?: { mode?: string; redirectUrl?: string } } };
    }>;
    const result = payload[0]?.result?.data?.json;

    expect(result?.mode).toBe("stripe");
    expect(result?.redirectUrl).toMatch(/^https:\/\/buy\.stripe\.com\/28E5kC94C0K8dsR2Shds40M\?client_reference_id=/);
  });
});
