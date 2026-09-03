import type { TransactionalEmail, TransactionalEmailProvider } from "./provider";

export class ResendEmailProvider implements TransactionalEmailProvider {
  constructor(private readonly apiKey: string) {}

  async send(message: TransactionalEmail) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        reply_to: message.replyTo || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    const payload = await response.json() as { id?: string; message?: string };
    if (!response.ok || !payload.id) {
      throw new Error(payload.message || `Resend request failed (${response.status})`);
    }
    return { provider: "resend", messageId: payload.id };
  }
}
