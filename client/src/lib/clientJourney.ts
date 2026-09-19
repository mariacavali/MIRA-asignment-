import type { ClientPreferences } from "@shared/miraClientPreferences";
import type { ShootPreparationStatus } from "@shared/shootPreparationProgress";

export type ClientJourneyView =
  | "confirm"
  | "calendar"
  | "email"
  | "when"
  | "later"
  | "prepare"
  | "review";
export function nextClientJourneyView(
  accepted: boolean,
  status: ShootPreparationStatus | undefined,
  preferences: ClientPreferences | undefined
): ClientJourneyView {
  if (!accepted || !status?.scheduleResponse) return "confirm";
  if (!preferences?.calendarChoice) return "calendar";
  if (preferences.emailReminders === null) return "email";
  if (status.creativeDirectionConfirmed) return "review";
  if (preferences.prepareChoice === "later") return "later";
  return preferences.prepareChoice === "now" ? "prepare" : "when";
}
