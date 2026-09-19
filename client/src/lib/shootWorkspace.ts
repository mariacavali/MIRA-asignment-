import { miraV4CreativeDnaSchema } from "@shared/miraV4CreativeDna";

export type ShootStep = 1 | 2 | 3;
export function shootWorkspaceProgress(input: {
  clientName?: string | null;
  clientEmail?: string | null;
  deliveryStatus?: string;
  ready: boolean;
}) {
  const details = Boolean(
    input.clientName?.trim() && input.clientEmail?.trim()
  );
  // Queued and created do not prove that an invitation left the application.
  const invited = [
    "sent",
    "delivered",
    "opened",
    "preparation_in_progress",
    "completed",
  ].includes(input.deliveryStatus ?? "");
  const completed = [details, invited, input.ready] as const;
  const done = completed.filter(Boolean).length;
  const next: ShootStep = !details ? 1 : !invited ? 2 : 3;
  return { completed, done, percent: Math.round((done / 3) * 100), next };
}

export function readShootDirection(value: unknown) {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const result = miraV4CreativeDnaSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function formatShootDate(
  value: Date | string | null | undefined,
  timezone?: string
) {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date needs checking";
  try {
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    });
  } catch {
    return "Date needs checking";
  }
}
