import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { miraClientInvitations, miraEmailOutbox, miraShootMemoryRevisions, miraShoots } from "../../drizzle/schema";
import { CLIENT_REMINDER_MILESTONES, clientPreferencesInputSchema, clientPreferencesSchema, getReminderOptions, getShootReminderAt, readClientPreferences, type ClientPreferences, type ClientPreferencesInput } from "../../shared/miraClientPreferences";
import { MIRA_SHOOT_MEMORY_SCHEMA_VERSION, shootMemorySchema } from "../../shared/miraCore";
import { getDb } from "../db";
import { isValidEmailAddress } from "../email/provider";
import { emptyShootMemory } from "./memory";
import { clientReminderInfrastructureAvailable } from "./emailOutboxWorker";
import { calculateShootAccessDeadline } from "./db";
import { LEGACY_CLIENT_REMINDER_MILESTONES } from "../../shared/miraEmailSequence";

type Scope = { shootId: number; photographerUserId: number; invitationId: string };
type ReminderJob = Pick<typeof miraEmailOutbox.$inferSelect, "id" | "milestoneId" | "scheduledAt" | "status" | "sentAt">;
type Shoot = Pick<typeof miraShoots.$inferSelect, "clientEmail" | "scheduledAt" | "timezone" | "status">;
const isSent = (job: ReminderJob) => job.status === "sent" || job.status === "delivered" || Boolean(job.sentAt);
const isPending = (job: ReminderJob) => job.status === "pending" || job.status === "processing";
function snapshot(raw: unknown) {
  return shootMemorySchema.passthrough().parse(typeof raw === "string" ? JSON.parse(raw) : raw ?? emptyShootMemory());
}
function response(preferences: ClientPreferences, jobs: ReminderJob[], shoot: Shoot, deliveryAvailable: boolean, completed: boolean, now: Date) {
  const sent = jobs.find(isSent);
  const job = jobs.find(isPending) ?? sent ?? jobs[0];
  const emailAvailable = deliveryAvailable && isValidEmailAddress(shoot.clientEmail);
  return {
    preferences: { ...preferences, reminderAt: job && (isPending(job) || isSent(job)) ? job.scheduledAt.toISOString() : null },
    contactEmail: shoot.clientEmail,
    deliveryAvailable,
    emailAvailable,
    reminderStatus: job?.status ?? null,
    reminderKind: job ? job.milestoneId === "client_preparation_reminder" ? "preparation" as const : "shoot" as const : null,
    reminderOptions: emailAvailable && !sent && !completed && !jobs.some(item => item.status === "processing")
      ? getReminderOptions(shoot.scheduledAt, shoot.timezone, now) : [],
  };
}

export async function getClientPreparationPreferences(scope: Scope) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your preferences could not be loaded." });
  const [shoots, invitations, revisions, jobs] = await Promise.all([
    db.select().from(miraShoots).where(and(eq(miraShoots.id, scope.shootId), eq(miraShoots.photographerUserId, scope.photographerUserId))).limit(1),
    db.select().from(miraClientInvitations).where(and(eq(miraClientInvitations.id, scope.invitationId), eq(miraClientInvitations.shootId, scope.shootId))).limit(1),
    db.select().from(miraShootMemoryRevisions).where(eq(miraShootMemoryRevisions.shootId, scope.shootId)).orderBy(desc(miraShootMemoryRevisions.version)).limit(1),
    db.select().from(miraEmailOutbox).where(and(eq(miraEmailOutbox.invitationId, scope.invitationId), inArray(miraEmailOutbox.milestoneId, [...CLIENT_REMINDER_MILESTONES]))),
  ]);
  if (!shoots[0] || !invitations[0]) throw new TRPCError({ code: "NOT_FOUND" });
  return response(readClientPreferences(revisions[0]?.snapshotJson), jobs, shoots[0], clientReminderInfrastructureAvailable(), Boolean(invitations[0].completedAt), new Date());
}

export async function saveClientPreparationPreferences(scope: Scope, raw: ClientPreferencesInput) {
  const input = clientPreferencesInputSchema.parse(raw);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your preferences could not be saved." });
  // Retrying the whole transaction re-reads the latest memory if a concurrent
  // voice/brief revision won the unique shoot/version constraint.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async tx => {
        const shoots = await tx.select().from(miraShoots).where(and(eq(miraShoots.id, scope.shootId), eq(miraShoots.photographerUserId, scope.photographerUserId))).limit(1).for("update");
        const shoot = shoots[0];
        if (!shoot || shoot.status === "archived") throw new TRPCError({ code: "NOT_FOUND" });
        const invitations = await tx.select().from(miraClientInvitations).where(and(eq(miraClientInvitations.id, scope.invitationId), eq(miraClientInvitations.shootId, scope.shootId), eq(miraClientInvitations.photographerUserId, scope.photographerUserId))).limit(1).for("update");
        const invitation = invitations[0];
        const now = new Date();
        if (!invitation || !["active", "completed"].includes(invitation.status) || calculateShootAccessDeadline(shoot.scheduledAt, shoot.durationMinutes, invitation.expiresAt) <= now) throw new TRPCError({ code: "NOT_FOUND", message: "This preparation link is no longer active." });
        const revisions = await tx.select().from(miraShootMemoryRevisions).where(eq(miraShootMemoryRevisions.shootId, scope.shootId)).orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
        const previous = snapshot(revisions[0]?.snapshotJson);
        const current = readClientPreferences(previous);
        const preferences = clientPreferencesSchema.parse({ ...current,
          ...(input.calendarChoice !== undefined ? { calendarChoice: input.calendarChoice } : {}),
          ...(input.emailReminders !== undefined ? { emailReminders: input.emailReminders } : {}),
          ...(input.prepareChoice !== undefined ? { prepareChoice: input.prepareChoice } : {}),
          updatedAt: now.toISOString(),
        });
        const contactChanged = input.contactEmail !== undefined && input.contactEmail.toLowerCase() !== shoot.clientEmail?.toLowerCase();
        const nextShoot = { ...shoot, clientEmail: contactChanged ? input.contactEmail! : shoot.clientEmail };
        const deliveryAvailable = clientReminderInfrastructureAvailable();
        const emailAvailable = deliveryAvailable && isValidEmailAddress(nextShoot.clientEmail);
        if ((input.emailReminders === true || input.reminderChoice !== undefined) && !emailAvailable) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: deliveryAvailable ? "Add a valid email address before choosing reminders." : "Email reminders are unavailable right now. You can still prepare now or return to this room later." });
        }
        if (input.reminderChoice && preferences.emailReminders !== true) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Choose email reminders first, or return to this room when you are ready." });
        if (input.reminderChoice && invitation.completedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your preparation is already complete." });
        let jobs = await tx.select().from(miraEmailOutbox).where(and(eq(miraEmailOutbox.invitationId, scope.invitationId), inArray(miraEmailOutbox.milestoneId, [...CLIENT_REMINDER_MILESTONES]))).for("update");
        // An explicit client choice replaces the old automatic sequence. This
        // also prevents the separately operated endpoint from sending both.
        if (input.emailReminders !== undefined) {
          await tx.update(miraEmailOutbox).set({ status: "cancelled", lastErrorCategory: "client_selected_notifications", leaseUntil: null })
            .where(and(eq(miraEmailOutbox.invitationId, scope.invitationId), inArray(miraEmailOutbox.milestoneId, [...LEGACY_CLIENT_REMINDER_MILESTONES]), inArray(miraEmailOutbox.status, ["pending", "processing"])));
        }
        const sent = jobs.find(isSent);
        if (input.reminderChoice && sent) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your reminder has already been sent. Open this room whenever you are ready." });
        if (input.reminderChoice && jobs.some(job => job.status === "processing")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your reminder is being sent. Please check again in a moment." });

        let desired: { milestoneId: typeof CLIENT_REMINDER_MILESTONES[number]; at: Date } | null | undefined;
        if (input.reminderChoice) {
          const option = getReminderOptions(shoot.scheduledAt, shoot.timezone, now).find(item => item.choice === input.reminderChoice);
          if (!option) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "There is not enough time before your shoot for that reminder. Choose another time or prepare now." });
          desired = { milestoneId: "client_preparation_reminder", at: new Date(option.at) };
        } else if (input.emailReminders === false) {
          desired = null;
        } else if (input.prepareChoice !== undefined || (input.emailReminders === true && !jobs.some(job => isPending(job) && job.milestoneId === "client_preparation_reminder"))) {
          // Preparing now (or returning without a preparation reminder) keeps
          // a shoot reminder only when the client has explicitly opted in.
          const at = preferences.emailReminders === true && emailAvailable && !sent ? getShootReminderAt(shoot.scheduledAt, shoot.timezone, now) : null;
          desired = at ? { milestoneId: "client_shoot_reminder", at } : null;
        }

        if (desired !== undefined) {
          if (desired && jobs.some(job => job.status === "processing")) {
            // A processing job cannot honestly be moved. Keep its persisted
            // time for ordinary preference changes; explicit moves reject above.
            desired = undefined;
          } else {
            await tx.update(miraEmailOutbox).set({ status: "cancelled", lastErrorCategory: preferences.emailReminders === false ? "client_opted_out" : "client_changed_preparation", leaseUntil: null })
              .where(and(eq(miraEmailOutbox.invitationId, scope.invitationId), inArray(miraEmailOutbox.status, ["pending", "processing"]),
                inArray(miraEmailOutbox.milestoneId, [...CLIENT_REMINDER_MILESTONES]),
                desired ? ne(miraEmailOutbox.milestoneId, desired.milestoneId) : undefined));
            if (desired) {
              const existing = jobs.find(job => job.milestoneId === desired!.milestoneId);
              if (existing && !isSent(existing)) {
                await tx.update(miraEmailOutbox).set({ status: "pending", scheduledAt: desired.at, attemptCount: 0, lastErrorCategory: null, leaseUntil: null, claimedAt: null })
                  .where(and(eq(miraEmailOutbox.id, existing.id), inArray(miraEmailOutbox.status, ["pending", "cancelled", "suppressed", "failed"])));
              } else if (!existing) {
                await tx.insert(miraEmailOutbox).values({ shootId: scope.shootId, invitationId: scope.invitationId, milestoneId: desired.milestoneId, scheduledAt: desired.at, idempotencyKey: `mira:invitation:${scope.invitationId}:milestone:${desired.milestoneId}` });
              }
            }
            jobs = await tx.select().from(miraEmailOutbox).where(and(eq(miraEmailOutbox.invitationId, scope.invitationId), inArray(miraEmailOutbox.milestoneId, [...CLIENT_REMINDER_MILESTONES])));
          }
        }
        const saved = response(preferences, jobs, nextShoot, deliveryAvailable, Boolean(invitation.completedAt), now);
        if (contactChanged) {
          await tx.update(miraShoots).set({ clientEmail: input.contactEmail }).where(and(eq(miraShoots.id, scope.shootId), eq(miraShoots.photographerUserId, scope.photographerUserId)));
        }
        await tx.insert(miraShootMemoryRevisions).values({ shootId: scope.shootId, photographerUserId: scope.photographerUserId, version: (revisions[0]?.version ?? 0) + 1, schemaVersion: MIRA_SHOOT_MEMORY_SCHEMA_VERSION, source: "system", snapshotJson: { ...previous, clientPreferences: saved.preferences } });
        return saved;
      });
    } catch (error) {
      const dbError = error as { code?: string; cause?: { code?: string } };
      if (attempt < 2 && [dbError.code, dbError.cause?.code].some(code => code === "ER_DUP_ENTRY" || code === "ER_LOCK_DEADLOCK")) continue;
      throw error;
    }
  }
  throw new Error("Unable to save client preferences");
}
