import { z } from "zod";

export const BRAND_CALL_ALLOWANCE_MS = 60 * 60_000;
export const CALL_CONNECTION_GRACE_MS = 30_000;
export const CALL_HEARTBEAT_MS = 10_000;
export const CALL_CLOCK_POLICY = "pause-free-disconnect-30s-v1";
const milliseconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const callClockCommandSchema = z.object({
  workspaceId: z.number().int().positive(), conversationId: z.string().uuid(), requestId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(), action: z.enum(["start", "pause", "resume", "end", "heartbeat"]),
}).strict();
export type CallClockCommand = z.infer<typeof callClockCommandSchema>;
const state = z.enum(["ready", "active", "paused", "ended", "exhausted"]);
const reason = z.enum(["client_pause", "connection_lost", "ended", "allowance_used"]);
export const callClockRecordSchema = z.object({
  version: z.literal("call-clock-v1"), policy: z.literal(CALL_CLOCK_POLICY), revision: z.number().int().nonnegative(), epoch: z.number().int().nonnegative(),
  allowanceMs: milliseconds.min(1).max(24 * 60 * 60_000), usedMs: milliseconds, state,
  conversationId: z.string().uuid().nullable(), observedAtMs: milliseconds, accountedAtMs: milliseconds.nullable(), leaseUntilMs: milliseconds.nullable(),
  pauseReason: reason.nullable(), receipts: z.array(z.object({ requestId: z.string().uuid(), payload: z.string().max(1000) }).strict()).max(32),
  claim: z.object({ requestId: z.string().uuid(), conversationId: z.string().uuid(), leaseToken: z.string().uuid(), epoch: z.number().int().nonnegative() }).strict().nullable(),
}).strict().superRefine((record, ctx) => {
  const anchorsValid = record.state === "active" ? record.accountedAtMs !== null && record.leaseUntilMs !== null
    && record.leaseUntilMs >= record.accountedAtMs && record.accountedAtMs <= record.observedAtMs && !!record.conversationId
    : record.accountedAtMs === null && record.leaseUntilMs === null;
  if (record.usedMs > record.allowanceMs || !anchorsValid || (record.state === "exhausted" && record.usedMs !== record.allowanceMs)) ctx.addIssue({ code: "custom", message: "Invalid call clock state." });
});
export type CallClockRecord = z.infer<typeof callClockRecordSchema>;
export const callClockStatusSchema = z.object({
  version: z.literal("call-clock-v1"), policy: z.literal(CALL_CLOCK_POLICY), revision: z.number().int().nonnegative(), state,
  conversationId: z.string().uuid().nullable(), allowanceMs: milliseconds, usedMs: milliseconds, remainingMs: milliseconds,
  serverNowMs: milliseconds, leaseUntilMs: milliseconds.nullable(), pauseReason: reason.nullable(),
  connectionGraceMs: z.literal(CALL_CONNECTION_GRACE_MS), warning: z.enum(["wrap_up", "ending"]).nullable(),
}).strict();
export type CallClockStatus = z.infer<typeof callClockStatusSchema>;
