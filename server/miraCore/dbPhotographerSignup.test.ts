import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the database-mode photographer signup fix: in the
// deployed (non-local-file-store) preview, createLocalPhotographerAccount
// unconditionally threw FORBIDDEN, so /for-photographers -> BUY MIRA -> create
// account could never reach the existing Stripe checkout. This exercises the
// new database-mode branch through the actual router, mocking only the DB
// layer (server/db.ts) and the session-signing SDK - never a live database or
// a live Stripe/OAuth call.
const dbMocks = vi.hoisted(() => ({
  createDbPhotographerAccount: vi.fn(),
  createLocalPhotographer: vi.fn(),
}));
const sdkMocks = vi.hoisted(() => ({
  createSessionToken: vi.fn(async (openId: string) => `signed-session-for.${openId}`),
}));
const paymentMocks = vi.hoisted(() => ({
  createPendingCheckout: vi.fn(),
}));

vi.mock("../db", async importOriginal => ({
  ...(await importOriginal<typeof import("../db")>()),
  createDbPhotographerAccount: dbMocks.createDbPhotographerAccount,
}));
vi.mock("../localFileStore", async importOriginal => ({
  ...(await importOriginal<typeof import("../localFileStore")>()),
  createLocalPhotographer: dbMocks.createLocalPhotographer,
}));
vi.mock("../_core/sdk", () => ({ sdk: { createSessionToken: sdkMocks.createSessionToken } }));
vi.mock("../payment/pendingCheckout", () => ({ createPendingCheckout: paymentMocks.createPendingCheckout }));
vi.mock("../_core/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../_core/env")>();
  return { ENV: { ...actual.ENV, paymentMode: "stripe" as const } };
});

import { appRouter } from "../routers";
import { COOKIE_NAME } from "@shared/const";

function context() {
  return { req: { protocol: "https", headers: {} } as never, res: { cookie: vi.fn() } as never, user: null };
}

const validInput = { firstName: "Jamie", lastName: "Rivera", email: "jamie@example.test", password: "correct horse battery staple" };

beforeEach(() => {
  process.env.NODE_ENV = "test";
  dbMocks.createDbPhotographerAccount.mockReset();
  dbMocks.createLocalPhotographer.mockReset();
  sdkMocks.createSessionToken.mockClear();
  paymentMocks.createPendingCheckout.mockReset();
});

describe("createLocalPhotographerAccount - database mode (MIRA_LOCAL_FILE_STORE unset)", () => {
  beforeEach(() => {
    delete process.env.MIRA_LOCAL_FILE_STORE;
  });

  it("creates the account and signs in with the same session mechanism the OAuth callback uses", async () => {
    dbMocks.createDbPhotographerAccount.mockResolvedValue({ openId: "mira-account-11111111-1111-4111-8111-111111111111" });
    const ctx = context();

    const result = await appRouter.createCaller(ctx).miraCore.createLocalPhotographerAccount(validInput);

    expect(result).toEqual({ created: true });
    expect(dbMocks.createDbPhotographerAccount).toHaveBeenCalledWith(validInput);
    expect(dbMocks.createLocalPhotographer).not.toHaveBeenCalled();
    expect(sdkMocks.createSessionToken).toHaveBeenCalledWith("mira-account-11111111-1111-4111-8111-111111111111", expect.objectContaining({ name: "Jamie Rivera" }));
    expect(ctx.res.cookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      "signed-session-for.mira-account-11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("rejects a duplicate email with CONFLICT and sets no session cookie", async () => {
    dbMocks.createDbPhotographerAccount.mockResolvedValue(null);
    const ctx = context();

    await expect(appRouter.createCaller(ctx).miraCore.createLocalPhotographerAccount(validInput)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(ctx.res.cookie).not.toHaveBeenCalled();
    expect(sdkMocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("rejects invalid input (short password, malformed email) before ever reaching account creation", async () => {
    const ctx = context();

    await expect(appRouter.createCaller(ctx).miraCore.createLocalPhotographerAccount({ ...validInput, password: "short" })).rejects.toThrow();
    await expect(appRouter.createCaller(ctx).miraCore.createLocalPhotographerAccount({ ...validInput, email: "not-an-email" })).rejects.toThrow();
    expect(dbMocks.createDbPhotographerAccount).not.toHaveBeenCalled();
  });
});

describe("createLocalPhotographerAccount - local-file-store mode (unchanged regression guard)", () => {
  beforeEach(() => {
    process.env.MIRA_LOCAL_FILE_STORE = "true";
  });

  it("still uses the local-file-store signup path, not the new database-mode branch", async () => {
    dbMocks.createLocalPhotographer.mockResolvedValue({ openId: "local-photographer-abc" });
    const ctx = context();

    const result = await appRouter.createCaller(ctx).miraCore.createLocalPhotographerAccount(validInput);

    expect(result).toEqual({ created: true });
    expect(dbMocks.createLocalPhotographer).toHaveBeenCalledWith(validInput);
    expect(dbMocks.createDbPhotographerAccount).not.toHaveBeenCalled();
    expect(sdkMocks.createSessionToken).not.toHaveBeenCalled();
    expect(ctx.res.cookie).toHaveBeenCalledWith("mira_local_session", "local-photographer-abc", expect.any(Object));
  });
});

describe("handoff to the existing Stripe checkout after database-mode signup", () => {
  beforeEach(() => {
    delete process.env.MIRA_LOCAL_FILE_STORE;
  });

  // The signup mutation itself only proves a session cookie was set (above).
  // This proves the *account that cookie authenticates as* is one the
  // existing, unmodified completeLocalPurchase (protectedProcedure) accepts
  // and correctly hands off to the existing Stripe checkout - i.e. the full
  // /for-photographers -> BUY MIRA -> create account -> Stripe journey, not
  // just the signup step in isolation. Stripe itself is fully mocked; no
  // network call is made.
  it("routes the newly created account straight to the existing Stripe checkout redirect", async () => {
    const newAccount = { id: 501, openId: "mira-account-22222222-2222-4222-8222-222222222222", name: "Jamie Rivera", email: "jamie@example.test", role: "user" as const };
    paymentMocks.createPendingCheckout.mockResolvedValue({ redirectUrl: "https://checkout.stripe.com/test-session" });

    const result = await appRouter.createCaller({ req: {} as never, res: {} as never, user: newAccount }).miraCore.completeLocalPurchase({});

    expect(result).toEqual({ mode: "stripe", redirectUrl: "https://checkout.stripe.com/test-session" });
    expect(paymentMocks.createPendingCheckout).toHaveBeenCalledWith({ name: "Jamie Rivera", email: "jamie@example.test" }, 501);
  });
});
