import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailProvider } from "./resend";

describe("Resend email provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends configured sender and photographer Reply-To through the provider boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ResendEmailProvider("test-key").send({
      to: "client@example.test",
      from: "Shoot Preparation <prepare@example.test>",
      replyTo: "photographer@example.test",
      subject: "Prepare for your shoot",
      text: "Text",
      html: "<p>Text</p>",
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      from: "Shoot Preparation <prepare@example.test>",
      to: ["client@example.test"],
      reply_to: "photographer@example.test",
    });
    expect(result).toEqual({ provider: "resend", messageId: "email_123" });
  });
});
