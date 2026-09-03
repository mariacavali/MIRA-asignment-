import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTransactionalEmailProvider: vi.fn(),
  env: {
    invitationLinkSecret: "synthetic-invitation-link-secret",
    publicAppBaseUrl: "https://mira.example",
    invitationFrom: "MIRA <prepare@example.test>",
  },
}));

vi.mock("../_core/env", () => ({ ENV: mocks.env }));
vi.mock("../email", () => ({ getTransactionalEmailProvider: mocks.getTransactionalEmailProvider }));

import { buildProductionMiraEmailOutboxWorker } from "./emailOutboxWorker";
import { MiraEmailOutboxWorker } from "../email/outbox";

beforeEach(() => {
  mocks.env.invitationLinkSecret = "synthetic-invitation-link-secret";
  mocks.env.publicAppBaseUrl = "https://mira.example";
  mocks.env.invitationFrom = "MIRA <prepare@example.test>";
  mocks.getTransactionalEmailProvider.mockReturnValue({ send: vi.fn() });
});

describe("MIRA production email outbox worker factory", () => {
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
