import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { miraEmailOutbox } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildMiraEmailSequence, type MiraClientEmailMilestoneId } from "../../shared/miraEmailSequence";
import { callMiraReminderEmail, clientShootRoomInvitationEmail, preparationGuidanceEmail, shootDayReminderEmail } from "./templates";
import type { TransactionalEmail, TransactionalEmailProvider } from "./provider";

export type EmailOutboxStatus = "pending" | "processing" | "sent" | "failed" | "suppressed" | "cancelled";
export type EmailOutboxJob = { id: string; shootId: number; invitationId: string; milestoneId: MiraClientEmailMilestoneId; scheduledAt: Date; status: EmailOutboxStatus; attemptCount: number; lastErrorCategory: string | null; idempotencyKey: string; leaseUntil: Date | null; claimedAt: Date | null; sentAt: Date | null };

export interface EmailOutboxRepository {
  schedule(job: Omit<EmailOutboxJob, "id" | "status" | "attemptCount" | "lastErrorCategory" | "leaseUntil" | "claimedAt" | "sentAt">): Promise<EmailOutboxJob>;
  claimDue(now: Date, leaseMs: number): Promise<EmailOutboxJob | null>;
  markSent(id: string, now: Date): Promise<void>;
  markSuppressed(id: string, category: string): Promise<void>;
  markFailed(id: string, category: string, retryAt: Date, maxAttempts: number): Promise<void>;
  cancelPending(invitationId: string, category: string): Promise<void>;
  recoverExpiredLeases(now: Date): Promise<number>;
  list(): Promise<EmailOutboxJob[]>;
}

export class InMemoryEmailOutboxRepository implements EmailOutboxRepository {
  private jobs: EmailOutboxJob[] = [];
  private nextId = 1;
  async schedule(input: Omit<EmailOutboxJob, "id" | "status" | "attemptCount" | "lastErrorCategory" | "leaseUntil" | "claimedAt" | "sentAt">) {
    const existing = this.jobs.find(job => job.invitationId === input.invitationId && job.milestoneId === input.milestoneId);
    if (existing) {
      if (existing.status === "pending") existing.scheduledAt = input.scheduledAt;
      return { ...existing };
    }
    const job: EmailOutboxJob = { ...input, id: String(this.nextId++), status: "pending", attemptCount: 0, lastErrorCategory: null, leaseUntil: null, claimedAt: null, sentAt: null };
    this.jobs.push(job);
    return { ...job };
  }
  async claimDue(now: Date, leaseMs: number) {
    const job = this.jobs.find(item => item.status === "pending" && item.scheduledAt <= now);
    if (!job) return null;
    job.status = "processing"; job.attemptCount += 1; job.claimedAt = now; job.leaseUntil = new Date(now.getTime() + leaseMs);
    return { ...job };
  }
  async markSent(id: string, now: Date) { const job = this.jobs.find(item => item.id === id); if (job) { job.status = "sent"; job.sentAt = now; job.leaseUntil = null; } }
  async markSuppressed(id: string, category: string) { const job = this.jobs.find(item => item.id === id); if (job) { job.status = "suppressed"; job.lastErrorCategory = category; job.leaseUntil = null; } }
  async markFailed(id: string, category: string, retryAt: Date, maxAttempts: number) { const job = this.jobs.find(item => item.id === id); if (!job) return; job.lastErrorCategory = category; job.leaseUntil = null; if (job.attemptCount >= maxAttempts) job.status = "failed"; else { job.status = "pending"; job.scheduledAt = retryAt; } }
  async cancelPending(invitationId: string, category: string) { for (const job of this.jobs) if (job.invitationId === invitationId && (job.status === "pending" || job.status === "processing")) { job.status = "cancelled"; job.lastErrorCategory = category; job.leaseUntil = null; } }
  async recoverExpiredLeases(now: Date) { let count = 0; for (const job of this.jobs) if (job.status === "processing" && job.leaseUntil && job.leaseUntil <= now) { job.status = "pending"; job.leaseUntil = null; count += 1; } return count; }
  async list() { return this.jobs.map(job => ({ ...job })); }
}

export async function recordImmediateInvitationAsSent(repository: EmailOutboxRepository, input: { invitationId: string; shootId: number; scheduledAt: Date; idempotencyKey: string }, sentAt = new Date()) {
  const job = await repository.schedule({ ...input, milestoneId: "shoot_room_invitation" });
  if (job.status !== "sent") await repository.markSent(job.id, sentAt);
  return repository.list();
}

export async function cancelMiraEmailOutbox(repository: EmailOutboxRepository, invitationId: string, category: string) {
  await repository.cancelPending(invitationId, category);
}

function toJob(row: typeof miraEmailOutbox.$inferSelect): EmailOutboxJob { return { id: String(row.id), shootId: row.shootId, invitationId: row.invitationId, milestoneId: row.milestoneId as MiraClientEmailMilestoneId, scheduledAt: row.scheduledAt, status: row.status, attemptCount: row.attemptCount, lastErrorCategory: row.lastErrorCategory, idempotencyKey: row.idempotencyKey, leaseUntil: row.leaseUntil, claimedAt: row.claimedAt, sentAt: row.sentAt }; }

async function requireDb() { const db = await getDb(); if (!db) throw new Error("Email outbox database is unavailable"); return db; }

export class DrizzleEmailOutboxRepository implements EmailOutboxRepository {
  async schedule(input: Omit<EmailOutboxJob, "id" | "status" | "attemptCount" | "lastErrorCategory" | "leaseUntil" | "claimedAt" | "sentAt">) { const db = await requireDb(); await db.insert(miraEmailOutbox).values({ shootId: input.shootId, invitationId: input.invitationId, milestoneId: input.milestoneId, scheduledAt: input.scheduledAt, idempotencyKey: input.idempotencyKey }).onDuplicateKeyUpdate({ set: { scheduledAt: sql`IF(${miraEmailOutbox.status} = 'pending', VALUES(${miraEmailOutbox.scheduledAt}), ${miraEmailOutbox.scheduledAt})` } }); const rows = await db.select().from(miraEmailOutbox).where(eq(miraEmailOutbox.idempotencyKey, input.idempotencyKey)).limit(1); if (!rows[0]) throw new Error("Email outbox job was not created"); return toJob(rows[0]); }
  async claimDue(now: Date, leaseMs: number) { const db = await requireDb(); const rows = await db.select().from(miraEmailOutbox).where(or(and(eq(miraEmailOutbox.status, "pending"), lte(miraEmailOutbox.scheduledAt, now)), and(eq(miraEmailOutbox.status, "processing"), lte(miraEmailOutbox.leaseUntil, now)))).limit(1); const row = rows[0]; if (!row) return null; const changed = await db.update(miraEmailOutbox).set({ status: "processing", attemptCount: sql`${miraEmailOutbox.attemptCount} + 1`, claimedAt: now, leaseUntil: new Date(now.getTime() + leaseMs) }).where(and(eq(miraEmailOutbox.id, row.id), or(eq(miraEmailOutbox.status, "pending"), and(eq(miraEmailOutbox.status, "processing"), lte(miraEmailOutbox.leaseUntil, now))))); return Number(changed[0].affectedRows) === 1 ? { ...toJob(row), status: "processing" as const, attemptCount: row.attemptCount + 1, claimedAt: now, leaseUntil: new Date(now.getTime() + leaseMs) } : null; }
  async markSent(id: string, now: Date) { const db = await requireDb(); await db.update(miraEmailOutbox).set({ status: "sent", sentAt: now, leaseUntil: null }).where(eq(miraEmailOutbox.id, Number(id))); }
  async markSuppressed(id: string, category: string) { const db = await requireDb(); await db.update(miraEmailOutbox).set({ status: "suppressed", lastErrorCategory: category, leaseUntil: null }).where(eq(miraEmailOutbox.id, Number(id))); }
  async markFailed(id: string, category: string, retryAt: Date, maxAttempts: number) { const db = await requireDb(); await db.update(miraEmailOutbox).set({ status: "failed", lastErrorCategory: category, leaseUntil: null }).where(and(eq(miraEmailOutbox.id, Number(id)), sql`${miraEmailOutbox.attemptCount} >= ${maxAttempts}`)); await db.update(miraEmailOutbox).set({ status: "pending", lastErrorCategory: category, scheduledAt: retryAt, leaseUntil: null }).where(and(eq(miraEmailOutbox.id, Number(id)), sql`${miraEmailOutbox.attemptCount} < ${maxAttempts}`)); }
  async cancelPending(invitationId: string, category: string) { const db = await requireDb(); await db.update(miraEmailOutbox).set({ status: "cancelled", lastErrorCategory: category, leaseUntil: null }).where(and(eq(miraEmailOutbox.invitationId, invitationId), or(eq(miraEmailOutbox.status, "pending"), eq(miraEmailOutbox.status, "processing")))); }
  async recoverExpiredLeases(now: Date) { const db = await requireDb(); const result = await db.update(miraEmailOutbox).set({ status: "pending", leaseUntil: null }).where(and(eq(miraEmailOutbox.status, "processing"), lte(miraEmailOutbox.leaseUntil, now))); return Number(result[0].affectedRows); }
  async list() { const db = await requireDb(); return (await db.select().from(miraEmailOutbox)).map(toJob); }
}

export type EmailContext = { clientFirstName: string | null; photographerName: string; shootTitle: string; scheduledAt: Date | null; shootEndsAt: Date | null; timeZone: string; location: string | null; accessUntil: Date | null; preparationUrl: string; clientEmail: string | null; preparationCompleted: boolean; invitationValid: boolean; shootCancelled: boolean };
export type EmailContextResolver = (job: EmailOutboxJob) => Promise<EmailContext | null>;

export function scheduleMiraEmailMilestones(repository: EmailOutboxRepository, input: { invitationId: string; shootId: number; scheduledAt: Date; timeZone: string; invitationSentAt: Date; acceptedAt?: Date | null; preparationCompletedAt?: Date | null; invitationValid?: boolean; shootCancelled?: boolean }) {
  const sequence = buildMiraEmailSequence({ shootId: input.shootId, scheduledAt: input.scheduledAt, timeZone: input.timeZone, clientEmail: null, invitationSentAt: input.invitationSentAt, acceptedAt: input.acceptedAt, preparationCompletedAt: input.preparationCompletedAt, invitationValid: input.invitationValid, shootCancelled: input.shootCancelled });
  return Promise.all(sequence.filter(item => item.status === "scheduled").map(item => repository.schedule({ shootId: input.shootId, invitationId: input.invitationId, milestoneId: item.id, scheduledAt: item.scheduledAt, idempotencyKey: item.idempotencyKey })));
}

function renderMilestone(milestoneId: MiraClientEmailMilestoneId, context: EmailContext, now: Date) {
  if (milestoneId === "shoot_room_invitation") return clientShootRoomInvitationEmail({ clientFirstName: context.clientFirstName, photographerName: context.photographerName, shootTitle: context.shootTitle, scheduledAt: context.scheduledAt, timeZone: context.timeZone, location: context.location, accessUntil: context.accessUntil, preparationUrl: context.preparationUrl, sentAt: now });
  if (milestoneId === "preparation_guidance") return preparationGuidanceEmail({ clientFirstName: context.clientFirstName, preparationUrl: context.preparationUrl });
  if (milestoneId === "call_mira_reminder") return callMiraReminderEmail({ clientFirstName: context.clientFirstName, photographerName: context.photographerName, preparationUrl: context.preparationUrl });
  return shootDayReminderEmail({ clientFirstName: context.clientFirstName, photographerName: context.photographerName, scheduledAt: context.scheduledAt ?? new Date(), timeZone: context.timeZone, location: context.location, preparationUrl: context.preparationUrl });
}

export class MiraEmailOutboxWorker {
  constructor(private readonly repository: EmailOutboxRepository, private readonly resolveContext: EmailContextResolver, private readonly provider: TransactionalEmailProvider, private readonly from: string, private readonly now = () => new Date(), private readonly maxAttempts = 3) {}
  async processOne() { const job = await this.repository.claimDue(this.now(), 5 * 60_000); if (!job) return "idle" as const; const context = await this.resolveContext(job); const now = this.now(); if (!context || !context.invitationValid || context.shootCancelled || context.preparationCompleted || (context.scheduledAt && now >= context.scheduledAt)) { await this.repository.markSuppressed(job.id, "not_deliverable"); return "suppressed" as const; } if (!context.clientEmail) { await this.repository.markFailed(job.id, "missing_recipient", new Date(now.getTime() + 60_000), this.maxAttempts); return "failed" as const; } try { await this.provider.send({ to: context.clientEmail, from: this.from, ...renderMilestone(job.milestoneId, context, now) } as TransactionalEmail); await this.repository.markSent(job.id, now); return "sent" as const; } catch { await this.repository.markFailed(job.id, "provider_delivery", new Date(now.getTime() + 60_000), this.maxAttempts); return "failed" as const; } }
}

export type EmailOutboxBatchResult = { claimed: number; sent: number; suppressed: number; failed: number };

export async function processEmailOutboxBatch(worker: MiraEmailOutboxWorker, batchLimit: number): Promise<EmailOutboxBatchResult> {
  const result: EmailOutboxBatchResult = { claimed: 0, sent: 0, suppressed: 0, failed: 0 };
  for (let index = 0; index < batchLimit; index += 1) {
    const outcome = await worker.processOne();
    if (outcome === "idle") break;
    result.claimed += 1;
    result[outcome] += 1;
  }
  return result;
}
