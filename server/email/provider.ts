export type TransactionalEmail = {
  to: string;
  from: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
};

export type EmailDeliveryResult = { provider: string; messageId: string };

export function isValidEmailAddress(value: string | null | undefined) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface TransactionalEmailProvider {
  send(message: TransactionalEmail): Promise<EmailDeliveryResult>;
}
