import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTransactionalEmailProvider: vi.fn(),
  startEmailReminderTimer: vi.fn(),
  env: {
    invitationLinkSecret: "synthetic-invitation-link-secret",
    publicAppBaseUrl: "https://mira.example",
    invitationFrom: "MIRA <prepare@example.test>",
    isProduction: false,
    paymentMode: "stripe",
    miraLocalFileStore: false,
    databaseUrl: "mysql://synthetic-database",
  },
}));

vi.mock("../_core/env", () => ({ ENV: mocks.env }));
vi.mock("../email", () => ({ getTransactionalEmailProvider: mocks.getTransactionalEmailProvider }));
vi.mock("../email/reminderTimer", () => ({ startEmailReminderTimer: mocks.startEmailReminderTimer }));

import { buildProductionMiraEmailOutboxWorker, clientReminderInfrastructureAvailable, startProductionClientReminderTimer } from "./emailOutboxWorker";
import { MiraEmailOutboxWorker } from "../email/outbox";

beforeEach(() => {
  mocks.env.invitationLinkSecret = "synthetic-invitation-link-secret";
  mocks.env.publicAppBaseUrl = "https://mira.example";
  mocks.env.invitationFrom = "MIRA <prepare@example.test>";
  mocks.getTransactionalEmailProvider.mockReturnValue({ send: vi.fn() });
  mocks.startEmailReminderTimer.mockReset();
  Object.assign(mocks.env, { isProduction: false, paymentMode: "stripe", miraLocalFileStore: false, databaseUrl: "mysql://synthetic-database" });
});

describe("MIRA production email outbox worker factory", () => {
  it("starts no timer in development, local file mode, or without complete database and sender configuration", () => {
    expect(startProductionClientReminderTimer()).toBeNull();
    mocks.env.isProduction = true;
    for (const key of ["databaseUrl", "invitationLinkSecret", "invitationFrom", "publicAppBaseUrl"] as const) {
      const original = mocks.env[key]; mocks.env[key] = "";
      expect(clientReminderInfrastructureAvailable()).toBe(false);
      expect(startProductionClientReminderTimer()).toBeNull();
      mocks.env[key] = original;
    }
    mocks.env.miraLocalFileStore = true;
    expect(startProductionClientReminderTimer()).toBeNull();
    expect(mocks.startEmailReminderTimer).not.toHaveBeenCalled();
  });

  it("assembles a timer in configured production database mode without sending immediately", () => {
    mocks.env.isProduction = true;
    mocks.startEmailReminderTimer.mockReturnValue({ stop: vi.fn() });
    expect(clientReminderInfrastructureAvailable()).toBe(true);
    expect(startProductionClientReminderTimer()).toHaveProperty("stop");
    expect(mocks.startEmailReminderTimer).toHaveBeenCalledOnce();
    expect(mocks.getTransactionalEmailProvider.mock.results.at(-1)?.value.send).not.toHaveBeenCalled();
  });

  it("rejects a public base URL that cannot create safe reminder links", () => {
    mocks.env.publicAppBaseUrl = "not-a-url";
    expect(buildProductionMiraEmailOutboxWorker()).toBeNull();
  });
  it("assembles a worker only when every piece of required configuration is present", () => {
    const worker = buildProductionMiraEmailOutboxWorker();
    expect(worker).toBeInstanceOf(MiraEmailOutboxWorker);
  });

  it("is unavailable (returns null) when the invitation link signing secret is missing", () => {
    mocks.env.invitationLinkSecret = "";
    expect(buildProductionMiraEmailOutboxWorker()).toBeNull();
  });

  it("is unavailable when the public base URL is missing", () => {
    mocks.env.publicAppBaseUrl = "";
    expect(buildProductionMiraEmailOutboxWorker()).toBeNull();
  });

  it("is unavailable when the sender address is missing", () => {
    mocks.env.invitationFrom = "";
    expect(buildProductionMiraEmailOutboxWorker()).toBeNull();
  });

  it("is unavailable when no transactional email provider is configured", () => {
    mocks.getTransactionalEmailProvider.mockReturnValue(null);
    expect(buildProductionMiraEmailOutboxWorker()).toBeNull();
  });
});
