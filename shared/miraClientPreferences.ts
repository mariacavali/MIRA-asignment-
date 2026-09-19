import { z } from "zod";

export const clientPreferencesSchema = z.object({
  calendarChoice: z.enum(["opened", "skip"]).nullable(),
  emailReminders: z.boolean().nullable(),
  prepareChoice: z.enum(["now", "later"]).nullable(),
  reminderAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
}).strict();

export const clientPreferencesInputSchema = z.object({
  calendarChoice: z.enum(["opened", "skip"]).optional(),
  emailReminders: z.boolean().optional(),
  prepareChoice: z.enum(["now", "later"]).optional(),
  reminderChoice: z.enum(["tomorrow", "one_hour"]).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
}).strict().refine(input => Object.values(input).some(value => value !== undefined), "Choose a preference to save.")
  .refine(input => input.reminderChoice === undefined || input.prepareChoice === "later", "Choose prepare later to set a reminder.");

export type ClientPreferences = z.infer<typeof clientPreferencesSchema>;
export type ClientPreferencesInput = z.infer<typeof clientPreferencesInputSchema>;
export type ClientReminderOption = { choice: "tomorrow" | "one_hour"; at: string; label: string };
export const EMPTY_CLIENT_PREFERENCES: ClientPreferences = {
  calendarChoice: null, emailReminders: null, prepareChoice: null, reminderAt: null, updatedAt: null,
};
export const CLIENT_REMINDER_MILESTONES = ["client_preparation_reminder", "client_shoot_reminder"] as const;
export const CLIENT_REMINDER_BUFFER_MS = 2 * 60 * 60_000;

type DateInput = Date | string | null | undefined;
function date(value: DateInput) {
  if (!value) return null;
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : null;
}
function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

// Calendar-day differences must use the shoot's time zone: midnight and DST
// both make elapsed 24-hour periods misleading for clients.
export function getShootCountdown(scheduledAt: DateInput, timeZone: string, now: Date = new Date()): string | null {
  const shoot = date(scheduledAt);
  if (!shoot || !Number.isFinite(now.getTime()) || shoot <= now) return null;
  try {
    const current = zonedParts(now, timeZone);
    const target = zonedParts(shoot, timeZone);
    const days = Math.round((Date.UTC(target.year, target.month - 1, target.day) - Date.UTC(current.year, current.month - 1, current.day)) / 86_400_000);
    return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  } catch { return null; }
}

function localMorning(source: Date, dayOffset: number, timeZone: string): Date {
  const parts = zonedParts(source, timeZone);
  const target = Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 10);
  let candidate = target;
  for (let pass = 0; pass < 4; pass++) {
    const shown = zonedParts(new Date(candidate), timeZone);
    const shownClock = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    if (shownClock === target) return new Date(candidate);
    candidate -= shownClock - target;
  }
  throw new Error("No valid local reminder time");
}

export function getReminderOptions(scheduledAt: DateInput, timeZone: string, now: Date = new Date()): ClientReminderOption[] {
  const shoot = date(scheduledAt);
  if (!shoot || !Number.isFinite(now.getTime()) || shoot <= now) return [];
  try {
    const format = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
    const candidates: Array<{ choice: ClientReminderOption["choice"]; at: Date; name: string }> = [
      { choice: "tomorrow", at: localMorning(now, 1, timeZone), name: "Tomorrow" },
      { choice: "one_hour", at: new Date(now.getTime() + 60 * 60_000), name: "In one hour" },
    ];
    return candidates.filter(item => item.at > now && item.at.getTime() + CLIENT_REMINDER_BUFFER_MS < shoot.getTime())
      .map(item => ({ choice: item.choice, at: item.at.toISOString(), label: `${item.name} · ${format.format(item.at)}` }));
  } catch { return []; }
}

export function getShootReminderAt(scheduledAt: DateInput, timeZone: string, now: Date = new Date()): Date | null {
  const shoot = date(scheduledAt);
  if (!shoot || !Number.isFinite(now.getTime()) || shoot <= now) return null;
  try {
    const morning = localMorning(shoot, -1, timeZone);
    if (morning > now && morning.getTime() + CLIENT_REMINDER_BUFFER_MS < shoot.getTime()) return morning;
    const soon = getReminderOptions(shoot, timeZone, now).find(option => option.choice === "one_hour");
    return soon ? new Date(soon.at) : null;
  } catch { return null; }
}

// Read just the preference object without discarding any other JSON fields.
export function readClientPreferences(raw: unknown): ClientPreferences {
  const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
  const candidate = snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>).clientPreferences : undefined;
  return candidate === undefined ? { ...EMPTY_CLIENT_PREFERENCES } : clientPreferencesSchema.parse(candidate);
}
