import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markInvitationDeliveredByMessageId: vi.fn(),
  markInvitationBouncedByMessageId: vi.fn(),
}));
vi.mock("../miraCore/db", () => ({
  markInvitationDeliveredByMessageId: mocks.markInvitationDeliveredByMessageId,
  markInvitationBouncedByMessageId: mocks.markInvitationBouncedByMessageId,
}));

import { createResendWebhookHandler, verifyResendWebhookSignature } from "./resendWebhook";

const secret = "whsec_c3ludGhldGljLXRlc3Qtc2VjcmV0"; // base64 of "synthetic-test-secret"

function sign(id: string, timestamp: string, body: string) {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  return `v1,${createHmac("sha256", secretBytes).update(signedContent).digest("base64")}`;
}

function response() {
  const result = { statusCode: 0, body: undefined as unknown };
  const res = { status(code: number) { result.statusCode = code; return res; }, json(value: unknown) { result.body = value; return res; } };
  return { result, res };
}

function request(payload: unknown, headerOverrides: Record<string, string | undefined> = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const id = "msg_synthetic";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string | undefined> = {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": sign(id, timestamp, body.toString("utf8")),
    ...headerOverrides,
  };
  return { body, header: (name: string) => headers[name] };
}

beforeEach(() => {
  mocks.markInvitationDeliveredByMessageId.mockReset().mockResolvedValue(undefined);
  mocks.markInvitationBouncedByMessageId.mockReset().mockResolvedValue(undefined);
});

describe("Resend delivery webhook", () => {
  it("rejects requests when no signing secret is configured", async () => {
    const output = response();
    await createResendWebhookHandler({ secret: "" })(request({ type: "email.delivered" }) as never, output.res as never, (() => undefined) as never);
    expect(output.result.statusCode).toBe(503);
  });

  it("rejects a request with an invalid signature", async () => {
    const output = response();
    const req = request({ type: "email.delivered", data: { email_id: "email_123" } }, { "svix-signature": "v1,not-the-real-signature" });
    await createResendWebhookHandler({ secret })(req as never, output.res as never, (() => undefined) as never);
    expect(output.result.statusCode).toBe(401);
    expect(mocks.markInvitationDeliveredByMessageId).not.toHaveBeenCalled();
  });

  it("rejects a stale, replayed timestamp even with a technically valid signature", async () => {
    const output = response();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const body = Buffer.from(JSON.stringify({ type: "email.delivered", data: { email_id: "email_123" } }));
    const req = { body, header: (name: string) => ({ "svix-id": "msg_synthetic", "svix-timestamp": staleTimestamp, "svix-signature": sign("msg_synthetic", staleTimestamp, body.toString("utf8")) } as Record<string, string>)[name] };
    await createResendWebhookHandler({ secret })(req as never, output.res as never, (() => undefined) as never);
    expect(output.result.statusCode).toBe(401);
  });

  it("marks the invitation delivered on a verified email.delivered event, matched by message id", async () => {
    const output = response();
    const req = request({ type: "email.delivered", data: { email_id: "email_123" } });
    await createResendWebhookHandler({ secret })(req as never, output.res as never, (() => undefined) as never);
    expect(output.result.statusCode).toBe(200);
    expect(mocks.markInvitationDeliveredByMessageId).toHaveBeenCalledWith("email_123");
    expect(mocks.markInvitationBouncedByMessageId).not.toHaveBeenCalled();
  });

  it("marks the invitation failed on a bounced or complained event", async () => {
    for (const type of ["email.bounced", "email.complained", "email.delivery_delayed"]) {
      mocks.markInvitationBouncedByMessageId.mockClear();
      const output = response();
      const req = request({ type, data: { email_id: "email_456" } });
      await createResendWebhookHandler({ secret })(req as never, output.res as never, (() => undefined) as never);
      expect(output.result.statusCode).toBe(200);
      expect(mocks.markInvitationBouncedByMessageId).toHaveBeenCalledWith("email_456");
    }
  });

  it("acknowledges but ignores an event type it does not track", async () => {
    const output = response();
    const req = request({ type: "email.opened", data: { email_id: "email_789" } });
    await createResendWebhookHandler({ secret })(req as never, output.res as never, (() => undefined) as never);
    expect(output.result.statusCode).toBe(200);
    expect(output.result.body).toMatchObject({ processed: false });
    expect(mocks.markInvitationDeliveredByMessageId).not.toHaveBeenCalled();
    expect(mocks.markInvitationBouncedByMessageId).not.toHaveBeenCalled();
  });

  it("never accepts a caller-selected recipient or status - only the provider's signed payload drives it", () => {
    const source = createResendWebhookHandler.toString();
    expect(source).not.toContain("req.body.recipient");
    expect(source).not.toContain("req.query");
  });

  it("verifies signatures independent of the handler for direct unit coverage", () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const id = "msg_direct";
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(verifyResendWebhookSignature(body, { id, timestamp, signature: sign(id, timestamp, body.toString("utf8")) }, secret)).toBe(true);
    expect(verifyResendWebhookSignature(body, { id, timestamp, signature: "v1,wrong" }, secret)).toBe(false);
    expect(verifyResendWebhookSignature(body, {}, secret)).toBe(false);
  });
});
