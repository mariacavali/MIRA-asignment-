import { ENV } from "../_core/env";
import type { TransactionalEmailProvider } from "./provider";
import { ResendEmailProvider } from "./resend";

export function getTransactionalEmailProvider(): TransactionalEmailProvider | null {
  if (ENV.emailProvider !== "resend" || !ENV.resendApiKey || !ENV.invitationFrom) return null;
  return new ResendEmailProvider(ENV.resendApiKey);
}

export function requireEmailConfiguration() {
  if (!ENV.invitationFrom) throw new Error("MIRA_INVITATION_FROM is not configured");
  const provider = getTransactionalEmailProvider();
  if (!provider) throw new Error("Resend email delivery is not configured");
  return { provider, from: ENV.invitationFrom };
}
