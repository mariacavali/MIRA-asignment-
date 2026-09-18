import { createHmac, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ONE_YEAR_MS } from "@shared/const";

export const PHOTOGRAPHER_SESSION_COOKIE = "mira_photographer_session";

function passwordTag(passwordHash: string, secret: string) {
  return createHmac("sha256", secret).update(passwordHash).digest("base64url");
}

export async function createPhotographerSessionToken(input: {
  userId: number;
  passwordHash: string;
  secret: string;
  expiresInMs?: number;
}) {
  if (!input.secret) throw new Error("Photographer session signing is not configured");
  const now = Date.now();
  return new SignJWT({ passwordTag: passwordTag(input.passwordHash, input.secret) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("mira-photographer")
    .setAudience("mira-dashboard")
    .setSubject(String(input.userId))
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + (input.expiresInMs ?? ONE_YEAR_MS)) / 1000))
    .sign(new TextEncoder().encode(input.secret));
}

export async function verifyPhotographerSessionToken(token: string, secret: string) {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: "mira-photographer",
      audience: "mira-dashboard",
    });
    const userId = Number(payload.sub);
    const tag = payload.passwordTag;
    if (!Number.isInteger(userId) || userId <= 0 || typeof tag !== "string" || !tag) return null;
    return { userId, passwordTag: tag };
  } catch {
    return null;
  }
}

export function isPhotographerSessionCurrent(input: { passwordTag: string; passwordHash: string; secret: string }) {
  const expected = Buffer.from(passwordTag(input.passwordHash, input.secret));
  const actual = Buffer.from(input.passwordTag);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
