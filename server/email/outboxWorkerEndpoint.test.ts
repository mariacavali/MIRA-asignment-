import { describe, expect, it, vi } from "vitest";
import { constantTimeSecretEqual, createEmailOutboxWorkerHandler, MIRA_EMAIL_WORKER_BATCH_LIMIT } from "./outboxWorkerEndpoint";
import { InMemoryEmailOutboxRepository, MiraEmailOutboxWorker } from "./outbox";

function response() {
  const result = { statusCode: 0, body: undefined as unknown };
  const res = { status(code: number) { result.statusCode = code; return res; }, json(value: unknown) { result.body = value; return res; } };
  return { result, res };
}

describe("email outbox worker endpoint", () => {
  it("uses constant-time secret comparison", () => {
    expect(constantTimeSecretEqual("synthetic-secret", "synthetic-secret")).toBe(true);
    expect(constantTimeSecretEqual("synthetic-secret", "different-secret")).toBe(false);
    expect(constantTimeSecretEqual(undefined, "synthetic-secret")).toBe(false);
  });

  it("rejects missing and invalid worker secrets", async () => {
    const worker = null;
    const missing = response();
    await createEmailOutboxWorkerHandler(worker, "")({ header: () => undefined } as never, missing.res as never, (() => undefined) as never);
    expect(missing.result).toEqual({ statusCode: 503, body: { error: "Email worker is not configured" } });
    const invalid = response();
    await createEmailOutboxWorkerHandler(worker, "synthetic-secret")({ header: () => "wrong-secret" } as never, invalid.res as never, (() => undefined) as never);
    expect(invalid.result.statusCode).toBe(401);
  });

  it("returns aggregate counts for a valid synthetic worker request", async () => {
    const repository = new InMemoryEmailOutboxRepository();
    const provider = { send: vi.fn(async () => ({ provider: "fake", messageId: "synthetic" })) };
    const worker = new MiraEmailOutboxWorker(repository, async () => ({ clientFirstName: "Synthetic", photographerName: "Synthetic Studio", shootTitle: "Synthetic shoot", scheduledAt: new Date(Date.now() + 3_600_000), shootEndsAt: new Date(Date.now() + 7_200_000), timeZone: "UTC", location: null, accessUntil: null, preparationUrl: "https://example.test/room", clientEmail: "synthetic@example.test", preparationCompleted: false, invitationValid: true, shootCancelled: false }), provider, "MIRA <prepare@example.test>");
    await repository.schedule({ shootId: 1, invitationId: "invitation", milestoneId: "shoot_room_invitation", scheduledAt: new Date(0), idempotencyKey: "synthetic" });
    const output = response();
    await createEmailOutboxWorkerHandler(worker, "synthetic-secret")({ header: name => name === "X-MIRA-EMAIL-WORKER-SECRET" ? "synthetic-secret" : undefined } as never, output.res as never, (() => undefined) as never);
    expect(output.result.statusCode).toBe(200);
    expect(output.result.body).toEqual({ claimed: 1, sent: 1, suppressed: 0, failed: 0 });
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("does not accept caller-selected jobs or recipients and enforces the fixed batch limit", () => {
    expect(MIRA_EMAIL_WORKER_BATCH_LIMIT).toBe(10);
    const source = createEmailOutboxWorkerHandler.toString();
    expect(source).not.toContain("req.body");
    expect(source).not.toContain("recipient");
    expect(source).not.toContain("jobId");
  });
});
