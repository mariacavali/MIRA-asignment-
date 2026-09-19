import { ENV } from "../_core/env";
import { getTransactionalEmailProvider } from "../email";
import { DrizzleEmailOutboxRepository, MiraEmailOutboxWorker } from "../email/outbox";
import { resolveMiraEmailOutboxContext } from "./emailOutboxContext";
import { CLIENT_REMINDER_MILESTONES } from "../../shared/miraClientPreferences";
import { startEmailReminderTimer } from "../email/reminderTimer";
import { normalizePublicBaseUrl } from "../_core/publicUrl";

// Construction never claims jobs. The existing protected endpoint retains its
// full queue; the app timer is restricted to explicitly requested reminders.
export function buildProductionMiraEmailOutboxWorker(clientRemindersOnly = false): MiraEmailOutboxWorker | null {
  if (!ENV.invitationLinkSecret || !ENV.publicAppBaseUrl || !ENV.invitationFrom) return null;
  try { normalizePublicBaseUrl(ENV.publicAppBaseUrl); } catch { return null; }
  const provider = getTransactionalEmailProvider();
  if (!provider) return null;
  return new MiraEmailOutboxWorker(
    new DrizzleEmailOutboxRepository(clientRemindersOnly ? CLIENT_REMINDER_MILESTONES : undefined),
    resolveMiraEmailOutboxContext,
    provider,
    ENV.invitationFrom,
  );
}

export function clientReminderInfrastructureAvailable(): boolean {
  return Boolean(ENV.isProduction && !ENV.miraLocalFileStore && ENV.databaseUrl && buildProductionMiraEmailOutboxWorker(true));
}

export function startProductionClientReminderTimer() {
  if (!clientReminderInfrastructureAvailable()) return null;
  const worker = buildProductionMiraEmailOutboxWorker(true);
  return worker ? startEmailReminderTimer(worker) : null;
}
