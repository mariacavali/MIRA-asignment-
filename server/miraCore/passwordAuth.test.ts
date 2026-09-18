import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPhotographerPasswordResetToken, photographerPasswordResetBinding, verifyPhotographerPasswordResetToken } from "../auth/photographerPasswordReset";

const dbMocks = vi.hoisted(() => ({
  verifyDbPhotographerPassword: vi.fn(),
  getDbPhotographerPasswordResetAccount: vi.fn(),
  getDbPhotographerCredentialByUserId: vi.fn(),
  getDbPhotographerPasswordResetTargetByUserId: vi.fn(),
  resetDbPhotographerPassword: vi.fn(),
  setDbPhotographerPassword: vi.fn(),
  getUserByOpenId: vi.fn(),
}));
const emailMocks = vi.hoisted(() => ({ sendPhotographerPasswordResetEmail: vi.fn() }));

vi.mock("../db", async importOriginal => ({ ...(await importOriginal<typeof import("../db")>()), ...dbMocks }));
vi.mock("../email/passwordReset", () => emailMocks);
vi.mock("../_core/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../_core/env")>();
  return { ENV: { ...actual.ENV, cookieSecret: "reset-test-secret", publicAppBaseUrl: "https://mira.example.test" } };
});

import { appRouter } from "../routers";
import { createPhotographerSessionToken, PHOTOGRAPHER_SESSION_COOKIE, verifyPhotographerSessionToken } from "../auth/photographerSession";
import { createContext } from "../_core/context";

function context() {
  return { req: { protocol: "https", get: () => "mira.example.test", headers: {} } as never, res: { cookie: vi.fn() } as never, user: null };
}

beforeEach(() => {
  delete process.env.MIRA_LOCAL_FILE_STORE;
  Object.values(dbMocks).forEach(mock => mock.mockReset());
  emailMocks.sendPhotographerPasswordResetEmail.mockReset();
});

describe("database-mode photographer password login", () => {
  it("requires the correct password, issues the normal session cookie, and supports the dashboard session", async () => {
    dbMocks.verifyDbPhotographerPassword.mockResolvedValue({ userId: 1, openId: "mira-account-1", name: "Maria Photographer", passwordHash: "stored-hash" });
    const ctx = context();
    await expect(appRouter.createCaller(ctx).miraCore.localPhotographerLogin({ email: "maria@example.test", password: "secure-password" })).resolves.toEqual({ signedIn: true });
    expect(dbMocks.verifyDbPhotographerPassword).toHaveBeenCalledWith("maria@example.test", "secure-password");
    const cookie = (ctx.res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cookie[0]).toBe(PHOTOGRAPHER_SESSION_COOKIE);
    expect(cookie[2]).toEqual(expect.objectContaining({ httpOnly: true }));
    await expect(verifyPhotographerSessionToken(cookie[1], "reset-test-secret")).resolves.toMatchObject({ userId: 1 });
  });

  it("does not authenticate an OAuth-only or incorrect-password account", async () => {
    dbMocks.verifyDbPhotographerPassword.mockResolvedValue(null);
    const ctx = context();
    await expect(appRouter.createCaller(ctx).miraCore.localPhotographerLogin({ email: "oauth@example.test", password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(ctx.res.cookie).not.toHaveBeenCalled();
  });

  it("authenticates the isolated photographer cookie through the real request context used by the dashboard", async () => {
    const token = await createPhotographerSessionToken({ userId: 1, passwordHash: "stored-hash", secret: "reset-test-secret" });
    dbMocks.getDbPhotographerCredentialByUserId.mockResolvedValue({ userId: 1, openId: "mira-account-1", name: "Maria Photographer", passwordHash: "stored-hash" });
    dbMocks.getUserByOpenId.mockResolvedValue({ id: 1, openId: "mira-account-1", name: "Maria Photographer", email: "maria@example.test", role: "user" });
    const ctx = await createContext({ req: { headers: { cookie: `${PHOTOGRAPHER_SESSION_COOKIE}=${token}` } } as never, res: {} as never });
    await expect(appRouter.createCaller(ctx).auth.me()).resolves.toMatchObject({ openId: "mira-account-1" });
  });
});

describe("photographer password reset", () => {
  it("creates an expiring token that becomes invalid when the stored password hash changes", () => {
    const token = createPhotographerPasswordResetToken({ userId: 12, accountBinding: "old-hash", secret: "secret", now: 1_000, nonce: "fixed-nonce" });
    expect(verifyPhotographerPasswordResetToken({ token, accountBinding: "old-hash", secret: "secret", now: 1_001 })).toMatchObject({ userId: 12 });
    expect(verifyPhotographerPasswordResetToken({ token, accountBinding: "new-hash", secret: "secret", now: 1_001 })).toBeNull();
    expect(verifyPhotographerPasswordResetToken({ token, accountBinding: "old-hash", secret: "secret", now: 1_801_001 })).toBeNull();
  });

  it("sends a time-limited link only for a database password account without revealing account existence", async () => {
    dbMocks.getDbPhotographerPasswordResetAccount.mockResolvedValue({ userId: 12, openId: "existing-account", email: "maria@example.test", passwordHash: "stored-hash" });
    emailMocks.sendPhotographerPasswordResetEmail.mockResolvedValue({ provider: "resend", messageId: "email_1" });
    const ctx = context();
    await expect(appRouter.createCaller(ctx).miraCore.requestPhotographerPasswordReset({ email: "maria@example.test" })).resolves.toEqual({ accepted: true });
    expect(emailMocks.sendPhotographerPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "maria@example.test", resetUrl: expect.stringMatching(/^https:\/\/mira\.example\.test\/mira\/reset-password\?token=/) }));

    dbMocks.getDbPhotographerPasswordResetAccount.mockResolvedValue(null);
    await expect(appRouter.createCaller(context()).miraCore.requestPhotographerPasswordReset({ email: "oauth@example.test" })).resolves.toEqual({ accepted: true });
    expect(emailMocks.sendPhotographerPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("atomically changes the password and signs the photographer in", async () => {
    const token = createPhotographerPasswordResetToken({ userId: 12, accountBinding: "stored-hash", secret: "reset-test-secret", nonce: "fixed-nonce" });
    dbMocks.getDbPhotographerPasswordResetTargetByUserId.mockResolvedValue({ userId: 12, openId: "mira-account-12", name: "Maria Photographer", passwordHash: "stored-hash" });
    dbMocks.setDbPhotographerPassword.mockResolvedValue("new-stored-hash");
    const ctx = context();
    await expect(appRouter.createCaller(ctx).miraCore.resetPhotographerPassword({ token, password: "new-secure-password" })).resolves.toEqual({ reset: true, signedIn: true });
    expect(dbMocks.setDbPhotographerPassword).toHaveBeenCalledWith(12, "stored-hash", "new-secure-password");
    const cookie = (ctx.res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cookie[0]).toBe(PHOTOGRAPHER_SESSION_COOKIE);
    await expect(verifyPhotographerSessionToken(cookie[1], "reset-test-secret")).resolves.toMatchObject({ userId: 12 });
  });

  it("allows a verified legacy account to create its first password without creating a user", async () => {
    const binding = photographerPasswordResetBinding("legacy-account-12", null);
    const token = createPhotographerPasswordResetToken({ userId: 12, accountBinding: binding, secret: "reset-test-secret", nonce: "fixed-nonce" });
    dbMocks.getDbPhotographerPasswordResetTargetByUserId.mockResolvedValue({ userId: 12, openId: "legacy-account-12", name: "Maria Photographer", passwordHash: null });
    dbMocks.setDbPhotographerPassword.mockResolvedValue("first-stored-hash");
    const ctx = context();
    await expect(appRouter.createCaller(ctx).miraCore.resetPhotographerPassword({ token, password: "first-secure-password" })).resolves.toEqual({ reset: true, signedIn: true });
    expect(dbMocks.setDbPhotographerPassword).toHaveBeenCalledWith(12, null, "first-secure-password");
    const cookie = (ctx.res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    await expect(verifyPhotographerSessionToken(cookie[1], "reset-test-secret")).resolves.toMatchObject({ userId: 12 });
    expect(verifyPhotographerPasswordResetToken({ token, accountBinding: "first-stored-hash", secret: "reset-test-secret" })).toBeNull();
  });
});
