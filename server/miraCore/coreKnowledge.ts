export const MIRA_CORE_KNOWLEDGE_VERSION = "remote-photography-v1" as const;

export const MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE = `MIRA CORE KNOWLEDGE · ${MIRA_CORE_KNOWLEDGE_VERSION}
- Remote photoshoots use Clos.
- The client participates with a smartphone; the client workflow supports iOS and Android.
- The photographer connects remotely through the remote-photography workflow to photograph through the client's back smartphone camera.
- The photographer can see and direct the composition remotely and guide the client throughout the shoot.
- Standard preparation includes a charged phone, stable internet, a clean camera lens, the required app and permissions, suitable environment and light, and stable phone positioning when required.
- Explain these product-defined facts confidently when relevant. Do not invent device-specific compatibility, connection guarantees, storage behavior, or photographer-specific procedures that are not present in the shoot context.`;

export function daysUntilShoot(scheduledAt: Date | string | null, now = new Date()) {
  if (!scheduledAt) return null;
  const shootDate = new Date(scheduledAt);
  if (Number.isNaN(shootDate.getTime())) return null;
  const shootDay = Date.UTC(shootDate.getUTCFullYear(), shootDate.getUTCMonth(), shootDate.getUTCDate());
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((shootDay - currentDay) / 86_400_000);
}
