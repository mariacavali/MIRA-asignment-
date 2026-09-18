import { requireEmailConfiguration } from "./index";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export async function sendPhotographerPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}) {
  const { provider, from } = requireEmailConfiguration();
  const safeUrl = escapeHtml(input.resetUrl);
  return provider.send({
    to: input.to,
    from,
    subject: "Reset your MIRA password",
    text: `Reset your MIRA password using this secure link: ${input.resetUrl}\n\nThis link expires in 30 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Reset your MIRA password using the secure link below.</p><p><a href="${safeUrl}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}
