import { describe, expect, it } from "vitest";
import {
  constantTimeTokenEqual,
  createInvitationAccessToken,
  parseInvitationAccessToken,
  verifyInvitationAccessSignature,
} from "./invitationAccessLink";

const SECRET = "synthetic-invitation-link-secret";
const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN_HASH = "a".repeat(64);
const OTHER_TOKEN_HASH = "b".repeat(64);

describe("MIRA invitation access link signing", () => {
  it("creates a signed token that parses back to the same invitation id and verifies", () => {
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: TOKEN_HASH, secret: SECRET });
    const parsed = parseInvitationAccessToken(signed);
    expect(parsed).not.toBeNull();
    expect(parsed?.invitationId).toBe(INVITATION_ID);
    expect(verifyInvitationAccessSignature(parsed!, TOKEN_HASH, SECRET)).toBe(true);
  });

  it("contains no PII, raw token, or token hash - only the version, invitation id, and signature", () => {
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: TOKEN_HASH, secret: SECRET });
    expect(signed.split(".")).toHaveLength(3);
    expect(signed).not.toContain(TOKEN_HASH);
    expect(signed).not.toContain(SECRET);
    expect(signed).not.toMatch(/@/); // no email could sneak in
  });

  it("rejects a tampered signature", () => {
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: TOKEN_HASH, secret: SECRET });
    const parsed = parseInvitationAccessToken(signed)!;
    const tampered = { ...parsed, signature: parsed.signature.slice(0, -1) + (parsed.signature.endsWith("A") ? "B" : "A") };
    expect(verifyInvitationAccessSignature(tampered, TOKEN_HASH, SECRET)).toBe(false);
  });

  it("rejects malformed and oversized candidates during strict parsing", () => {
    expect(parseInvitationAccessToken("")).toBeNull();
    expect(parseInvitationAccessToken("not-a-signed-token")).toBeNull();
    expect(parseInvitationAccessToken(`v2.${INVITATION_ID}.${"a".repeat(43)}`)).toBeNull();
    expect(parseInvitationAccessToken("v1.not-a-uuid.abcdef")).toBeNull();
    expect(parseInvitationAccessToken(`v1.${INVITATION_ID}.short`)).toBeNull();
    expect(parseInvitationAccessToken(`v1.${INVITATION_ID}`)).toBeNull();
    expect(parseInvitationAccessToken(`v1.${INVITATION_ID}.${"a".repeat(43)}.extra`)).toBeNull();
    expect(parseInvitationAccessToken(`v1.${INVITATION_ID}.${"a".repeat(400)}`)).toBeNull();
    expect(parseInvitationAccessToken(123 as unknown as string)).toBeNull();
    expect(parseInvitationAccessToken(null as unknown as string)).toBeNull();
  });

  it("rejects a signature minted for another invitation", () => {
    const signedForOther = createInvitationAccessToken({ invitationId: OTHER_INVITATION_ID, tokenHash: TOKEN_HASH, secret: SECRET });
    const parsedForOther = parseInvitationAccessToken(signedForOther)!;
    // Swap in a different invitation id while keeping the original signature -
    // the recomputed expected signature must no longer match.
    const forged = { invitationId: INVITATION_ID, signature: parsedForOther.signature };
    expect(verifyInvitationAccessSignature(forged, TOKEN_HASH, SECRET)).toBe(false);
  });

  it("invalidates a previously-issued link automatically once the invitation's tokenHash rotates", () => {
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: TOKEN_HASH, secret: SECRET });
    const parsed = parseInvitationAccessToken(signed)!;
    expect(verifyInvitationAccessSignature(parsed, TOKEN_HASH, SECRET)).toBe(true);
    // Rotation changes the stored tokenHash; the old signature no longer matches it.
    expect(verifyInvitationAccessSignature(parsed, OTHER_TOKEN_HASH, SECRET)).toBe(false);
    // A freshly minted link against the new tokenHash works again.
    const reissued = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: OTHER_TOKEN_HASH, secret: SECRET });
    expect(verifyInvitationAccessSignature(parseInvitationAccessToken(reissued)!, OTHER_TOKEN_HASH, SECRET)).toBe(true);
  });

  it("fails safely without a configured secret", () => {
    const signed = createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: TOKEN_HASH, secret: SECRET });
    const parsed = parseInvitationAccessToken(signed)!;
    expect(verifyInvitationAccessSignature(parsed, TOKEN_HASH, "")).toBe(false);
    expect(() => createInvitationAccessToken({ invitationId: INVITATION_ID, tokenHash: TOKEN_HASH, secret: "" })).toThrow();
  });

  it("exercises the constant-time comparison helper directly", () => {
    expect(constantTimeTokenEqual("abc", "abc")).toBe(true);
    expect(constantTimeTokenEqual("abc", "abd")).toBe(false);
    expect(constantTimeTokenEqual("abc", "abcd")).toBe(false);
    expect(constantTimeTokenEqual("", "")).toBe(true);
  });
});
