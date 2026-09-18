import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PHOTOGRAPHER_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

function signatureFor(payload: string, accountBinding: string, secret: string) {
  return createHmac("sha256", secret)
    .update(payload)
    .update(".")
    .update(accountBinding)
    .digest("base64url");
}

export function photographerPasswordResetBinding(openId: string, passwordHash: string | null) {
  return passwordHash ?? `legacy:${openId}`;
}

export function createPhotographerPasswordResetToken(input: {
  userId: number;
  accountBinding: string;
  secret: string;
  now?: number;
  nonce?: string;
}) {
  if (!input.secret) throw new Error("Password reset signing is not configured");
  const expiresAt = (input.now ?? Date.now()) + PHOTOGRAPHER_PASSWORD_RESET_TTL_MS;
  const nonce = input.nonce ?? randomBytes(24).toString("base64url");
  const payload = `${input.userId}.${expiresAt}.${nonce}`;
  return `${payload}.${signatureFor(payload, input.accountBinding, input.secret)}`;
}

export function inspectPhotographerPasswordResetToken(token: string) {
  const [userIdText, expiresAtText, nonce, signature, ...extra] = token.split(".");
  const userId = Number(userIdText);
  const expiresAt = Number(expiresAtText);
  if (
    extra.length > 0 ||
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !Number.isFinite(expiresAt) ||
    !nonce ||
    !signature
  ) return null;
  return { userId, expiresAt, nonce, signature };
}

export function verifyPhotographerPasswordResetToken(input: {
  token: string;
  accountBinding: string;
  secret: string;
  now?: number;
}) {
  const parsed = inspectPhotographerPasswordResetToken(input.token);
  if (!parsed || !input.secret || parsed.expiresAt < (input.now ?? Date.now())) return null;
  const payload = `${parsed.userId}.${parsed.expiresAt}.${parsed.nonce}`;
  const expected = Buffer.from(signatureFor(payload, input.accountBinding, input.secret));
  const actual = Buffer.from(parsed.signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { userId: parsed.userId, expiresAt: parsed.expiresAt };
}
