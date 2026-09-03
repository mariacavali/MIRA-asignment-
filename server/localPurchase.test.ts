import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  createLocalPaidPhotographerAccount: vi.fn(),
  activateLocalPlanForUser: vi.fn(),
  getPhotographerAccess: vi.fn(),
}));

vi.mock("./db", () => mocks);

import { appRouter } from "./routers";

const user = {
  id: 42,
  openId: "server-created-open-id",
  name: "Existing Photographer",
  email: "duplicate@example.test",
  role: "user" as const,
  paymentStatus: "unpaid" as const,
  selectedPlan: null,
};

function context(authenticatedUser: typeof user | null = null) {
  return { req: {} as never, res: { cookie: vi.fn() } as never, user: authenticatedUser };
}

describe("local purchase identity boundary", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.MIRA_LOCAL_FILE_STORE = "true";
    mocks.createLocalPaidPhotographerAccount.mockReset();
    mocks.activateLocalPlanForUser.mockReset();
    mocks.getPhotographerAccess.mockReset();
  });

  it("creates a unique server-account and session for a signed-out first-time buyer", async () => {
    const created = { ...user, id: 43, openId: "new-server-created-open-id", email: "new@example.test", paymentStatus: "test_active", selectedPlan: "MIRA Studio" };
    mocks.createLocalPaidPhotographerAccount.mockResolvedValue(created);
    const ctx = context();

    const result = await appRouter.createCaller(ctx).miraCore.completeLocalPurchase({ name: "New Buyer", email: "new@example.test" });

    expect(result).toMatchObject({ paid: true, paymentStatus: "test_active", selectedPlan: "MIRA Studio" });
    expect(mocks.createLocalPaidPhotographerAccount).toHaveBeenCalledWith("New Buyer", "new@example.test");
    expect((ctx.res as { cookie: ReturnType<typeof vi.fn> }).cookie).toHaveBeenCalledWith("mira_local_session", created.openId, expect.any(Object));
  });

  it("rejects duplicate email checkout instead of activating an existing account", async () => {
    mocks.createLocalPaidPhotographerAccount.mockResolvedValue(null);

    await expect(appRouter.createCaller(context()).miraCore.completeLocalPurchase({ name: "Buyer", email: "duplicate@example.test" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.activateLocalPlanForUser).not.toHaveBeenCalled();
  });

  it("activates only the authenticated user and ignores submitted identity fields", async () => {
    mocks.activateLocalPlanForUser.mockResolvedValue({ ...user, paymentStatus: "test_active", selectedPlan: "MIRA Studio" });

    await appRouter.createCaller(context(user)).miraCore.completeLocalPurchase({ name: "Untrusted Name", email: "another@example.test" });

    expect(mocks.activateLocalPlanForUser).toHaveBeenCalledWith(user.openId, "MIRA Studio");
    expect(mocks.createLocalPaidPhotographerAccount).not.toHaveBeenCalled();
  });

  it("keeps access unpaid until payment state changes", async () => {
    mocks.getPhotographerAccess.mockResolvedValue({ paymentStatus: "unpaid", selectedPlan: null });

    const result = await appRouter.createCaller(context(user)).miraCore.getPhotographerAccess();

    expect(result).toEqual({ paymentStatus: "unpaid", selectedPlan: null });
    expect(mocks.activateLocalPlanForUser).not.toHaveBeenCalled();
  });

  it("does not treat login or a direct success URL as payment", () => {
    const source = readFileSync(new URL("../client/src/pages/MiraPaymentSuccess.tsx", import.meta.url), "utf8");
    expect(source).toContain("getPhotographerAccess");
    expect(source).not.toContain("searchParams");
    expect(source).not.toContain("activateLocalPlan");
  });
});
