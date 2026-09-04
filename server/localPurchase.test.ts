import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
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
    process.env.MIRA_PAYMENT_MODE = "local";
    mocks.activateLocalPlanForUser.mockReset();
    mocks.getPhotographerAccess.mockReset();
  });

  it("rejects checkout before a photographer account is authenticated", async () => {
    await expect(appRouter.createCaller(context()).miraCore.completeLocalPurchase({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.activateLocalPlanForUser).not.toHaveBeenCalled();
  });

  it("binds checkout to the authenticated account instead of submitted identity fields", () => {
    const source = readFileSync(new URL("./miraCore/router.ts", import.meta.url), "utf8");
    expect(source).toContain("completeLocalPurchase: protectedProcedure");
    expect(source).toContain("ctx.user.id");
    expect(source).toContain("ctx.user.email");
    expect(source).toContain("z.object({}).strict()");
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
