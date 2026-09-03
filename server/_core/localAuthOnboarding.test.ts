import { beforeEach, describe, expect, it, vi } from "vitest";

const { localUser, dbMocks } = vi.hoisted(() => {
  const localUser = {
  id: 210001,
  openId: "mira-assignment2-local-photographer",
  name: "Local Dev Photographer",
  email: "local-photographer@example.test",
  loginMethod: "local-dev",
  role: "user",
  createdAt: new Date("2026-09-02T10:00:00.000Z"),
  updatedAt: new Date("2026-09-02T10:00:00.000Z"),
  lastSignedIn: new Date("2026-09-02T10:00:00.000Z"),
  };
  return {
    localUser,
    dbMocks: {
      upsertUser: vi.fn(async () => undefined),
      getUserByOpenId: vi.fn(async () => localUser),
    },
  };
});

vi.mock("../db", async importOriginal => ({
  ...(await importOriginal<typeof import("../db")>()),
  upsertUser: dbMocks.upsertUser,
  getUserByOpenId: dbMocks.getUserByOpenId,
}));

vi.mock("../miraCore/db", async importOriginal => ({
  ...(await importOriginal<typeof import("../miraCore/db")>()),
  getPhotographerProfile: vi.fn(async () => null),
  savePhotographerProfile: vi.fn(async (input: { userId: number; websiteUrl: string | null; instagramUrl: string | null }) => ({
    userId: input.userId,
    onboardingStatus: "complete",
    websiteUrl: input.websiteUrl,
    instagramUrl: input.instagramUrl,
  })),
}));

import { appRouter } from "../routers";
import { createContext, isLocalAuthEnabled } from "./context";

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.DEV_LOCAL_AUTH_BYPASS = "true";
  process.env.DEV_LOCAL_OPEN_ID = localUser.openId;
  dbMocks.upsertUser.mockClear();
  dbMocks.getUserByOpenId.mockClear();
});

describe("isolated local photographer auth", () => {
  it("does not create an implicit photographer before purchase", async () => {
    const context = await createContext({ req: { headers: {} } as never, res: {} as never });
    expect(isLocalAuthEnabled("production", "true")).toBe(false);
    expect(context.user).toBeNull();
    expect(dbMocks.upsertUser).not.toHaveBeenCalled();
  });

  it("allows the protected onboarding procedure for an authenticated paid account", async () => {
    const context = { req: {} as never, res: {} as never, user: localUser };
    const result = await appRouter.createCaller(context).miraCore.savePhotographerProfile({
      displayName: "Maria",
      businessName: "Maria Cavali",
      bio: "Editorial photographer",
      photographyStyle: "Editorial",
      areasOfExpertise: ["Portraits"],
      websiteUrl: "www.mariacavali.com",
      instagramUrl: "@mariacavali",
      timezone: "Europe/Amsterdam",
    });
    expect(result).toMatchObject({ userId: localUser.id, onboardingStatus: "complete", websiteUrl: "https://www.mariacavali.com", instagramUrl: "mariacavali" });
  });

});
