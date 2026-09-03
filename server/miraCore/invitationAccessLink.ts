import { createHmac, timingSafeEqual } from "node:crypto";

// A URL-safe, tamper-resistant credential clients can use in place of the raw
// invitation token for links generated after the initial invitation email
// (e.g. outbox-driven reminders). It carries no secret and no PII: only the
// invitation's stable id plus an HMAC over (id, current tokenHash). Because
// the signature is bound to the invitation's *current* tokenHash, rotating
// the invitation's token (which changes tokenHash) silently invalidates every
// previously issued signed link without needing to track or revoke anything.
export const INVITATION_ACCESS_TOKEN_VERSION = "v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// HMAC-SHA256 digested as base64url is always 43 characters (no padding).
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_SIGNED_TOKEN_LENGTH = 160;

export type ParsedInvitationAccessToken = { invitationId: string; signature: string };

function signaturePayload(invitationId: string, tokenHash: string) {
  return `${INVITATION_ACCESS_TOKEN_VERSION}:${invitationId}:${tokenHash}`;
}

function computeSignature(invitationId: string, tokenHash: string, secret: string) {
  return createHmac("sha256", secret).update(signaturePayload(invitationId, tokenHash)).digest("base64url");
}

export function constantTimeTokenEqual(a: string, b: string) {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export function createInvitationAccessToken(params: { invitationId: string; tokenHash: string; secret: string }): string {
  if (!params.secret) throw new Error("Invitation link signing secret is not configured");
  if (!UUID_PATTERN.test(params.invitationId)) throw new Error("Invalid invitation id");
  const signature = computeSignature(params.invitationId, params.tokenHash, params.secret);
  return `${INVITATION_ACCESS_TOKEN_VERSION}.${params.invitationId}.${signature}`;
}

// Strict, allocation-cheap parse: rejects anything oversized or malformed
// before any signature work or database lookup happens.
export function parseInvitationAccessToken(candidate: unknown): ParsedInvitationAccessToken | null {
  if (typeof candidate !== "string") return null;
  if (candidate.length === 0 || candidate.length > MAX_SIGNED_TOKEN_LENGTH) return null;
  const parts = candidate.split(".");
  if (parts.length !== 3) return null;
  const [version, invitationId, signature] = parts;
  if (version !== INVITATION_ACCESS_TOKEN_VERSION) return null;
  if (!UUID_PATTERN.test(invitationId)) return null;
  if (!SIGNATURE_PATTERN.test(signature)) return null;
  return { invitationId, signature };
}

// The invitation's *current* tokenHash must be looked up server-side by the
// caller (never trusted from the URL) and passed in here.
export function verifyInvitationAccessSignature(parsed: ParsedInvitationAccessToken, currentTokenHash: string, secret: string): boolean {
  if (!secret) return false;
  const expected = computeSignature(parsed.invitationId, currentTokenHash, secret);
  return constantTimeTokenEqual(parsed.signature, expected);
}
