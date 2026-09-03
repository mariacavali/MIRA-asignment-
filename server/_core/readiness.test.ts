import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isLocalFileStoreEnabled: vi.fn(),
  getTransactionalEmailProvider: vi.fn(),
  env: {
    paymentMode: "local" as "local" | "stripe",
    stripeSecretKey: "",
    stripeWebhookSecret: "",
    stripePriceId: "",
    stripePaymentLinkUrl: "",
    invitationLinkSecret: "",
    emailWorkerSecret: "",
  },
}));

vi.mock("./env", () => ({ ENV: mocks.env }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../localFileStore", () => ({ isLocalFileStoreEnabled: mocks.isLocalFileStoreEnabled }));
vi.mock("../email", () => ({ getTransactionalEmailProvider: mocks.getTransactionalEmailProvider }));

import { buildReadinessReport } from "./readiness";

function response() {
  const result = { statusCode: 0, body: undefined as unknown };
  const res = { status(code: number) { result.statusCode = code; return res; }, json(value: unknown) { result.body = value; return res; } };
  return { result, res };
}

beforeEach(() => {
  mocks.getDb.mockReset();
  mocks.isLocalFileStoreEnabled.mockReset().mockReturnValue(false);
  mocks.getTransactionalEmailProvider.mockReset().mockReturnValue(null);
  mocks.env.paymentMode = "local";
  mocks.env.stripeSecretKey = "";
  mocks.env.stripeWebhookSecret = "";
  mocks.env.stripePriceId = "";
  mocks.env.stripePaymentLinkUrl = "";
  mocks.env.invitationLinkSecret = "";
  mocks.env.emailWorkerSecret = "";
});

describe("MIRA production readiness report", () => {
  it("reports every component as a safe state string only - never a value, id, or count", async () => {
    mocks.isLocalFileStoreEnabled.mockReturnValue(true);
    const report = await buildReadinessReport();
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/mysql:\/\/|postgres:\/\/|sk_live|sk_test|whsec_|re_[A-Za-z0-9]/);
    for (const component of Object.values(report.components)) {
      expect(["ready", "not_ready", "not_configured"]).toContain(component.state);
    }
  });

  it("reports database/migrations as not_configured (not failing) in local file-store mode", async () => {
    mocks.isLocalFileStoreEnabled.mockReturnValue(true);
    const report = await buildReadinessReport();
    expect(report.components.database.state).toBe("not_configured");
    expect(report.components.migrations.state).toBe("not_configured");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(report.status).toBe("ready");
  });

  it("reports database as not_ready when getDb() returns null", async () => {
    mocks.isLocalFileStoreEnabled.mockReturnValue(false);
    mocks.getDb.mockResolvedValue(null);
    const report = await buildReadinessReport();
    expect(report.components.database.state).toBe("not_ready");
    expect(report.components.migrations.state).toBe("not_ready");
    expect(report.status).toBe("not_ready");
  });

  it("reports database ready but migrations not_ready when the connection works but a MIRA table is missing", async () => {
    mocks.isLocalFileStoreEnabled.mockReturnValue(false);
    let call = 0;
    mocks.getDb.mockResolvedValue({
      execute: vi.fn(async () => {
        call += 1;
        if (call === 1) return []; // SELECT 1 succeeds
        throw new Error("Table 'mira_stripe_billing_identities' doesn't exist");
      }),
    });
    const report = await buildReadinessReport();
    expect(report.components.database.state).toBe("ready");
    expect(report.components.migrations.state).toBe("not_ready");
    expect(report.status).toBe("not_ready");
  });

  it("reports migrations ready when connectivity and every required table probe succeed", async () => {
    mocks.isLocalFileStoreEnabled.mockReturnValue(false);
    mocks.getDb.mockResolvedValue({ execute: vi.fn(async () => []) });
    const report = await buildReadinessReport();
    expect(report.components.database.state).toBe("ready");
    expect(report.components.migrations.state).toBe("ready");
  });

  it("reports Stripe ready only when in stripe payment mode with every required field present", async () => {
    mocks.env.paymentMode = "stripe";
    mocks.env.stripeSecretKey = "present";
    mocks.env.stripeWebhookSecret = "present";
    mocks.env.stripePriceId = "present";
    mocks.env.stripePaymentLinkUrl = "present";
    const report = await buildReadinessReport();
    expect(report.components.stripe.state).toBe("ready");
  });

  it("reports Stripe not_configured when payment mode is local even if fields happen to be set", async () => {
    mocks.env.paymentMode = "local";
    mocks.env.stripeSecretKey = "present";
    mocks.env.stripeWebhookSecret = "present";
    mocks.env.stripePriceId = "present";
    mocks.env.stripePaymentLinkUrl = "present";
    const report = await buildReadinessReport();
    expect(report.components.stripe.state).toBe("not_configured");
  });

  it("reports Resend, invitation-link signing, and email-worker states from configuration presence only", async () => {
    mocks.getTransactionalEmailProvider.mockReturnValue({ send: vi.fn() });
    mocks.env.invitationLinkSecret = "present";
    mocks.env.emailWorkerSecret = "present";
    const report = await buildReadinessReport();
    expect(report.components.resend.state).toBe("ready");
    expect(report.components.invitationLinkSigning.state).toBe("ready");
    expect(report.components.emailWorker.state).toBe("ready");
  });

  it("never calls a transactional email provider's send() as part of the check", async () => {
    const send = vi.fn();
    mocks.getTransactionalEmailProvider.mockReturnValue({ send });
    await buildReadinessReport();
    expect(send).not.toHaveBeenCalled();
  });
});
