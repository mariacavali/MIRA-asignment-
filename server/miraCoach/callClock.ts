import { BRAND_CALL_ALLOWANCE_MS, CALL_CLOCK_POLICY, CALL_CONNECTION_GRACE_MS, callClockRecordSchema, callClockStatusSchema,
  type CallClockRecord, type CallClockCommand } from "../../shared/miraCallClock";

export class CallClockConflict extends Error { constructor() { super("The session timer changed. Refresh and try again."); } }
export function newCallClock(nowMs: number, allowanceMs = BRAND_CALL_ALLOWANCE_MS): CallClockRecord {
  return callClockRecordSchema.parse({ version: "call-clock-v1", policy: CALL_CLOCK_POLICY, revision: 0, epoch: 0, allowanceMs, usedMs: 0,
    state: "ready", conversationId: null, observedAtMs: nowMs, accountedAtMs: null, leaseUntilMs: null, pauseReason: null, receipts: [], claim: null });
}
export function settleCallClock(raw: CallClockRecord, nowMs: number): CallClockRecord {
  const clock = structuredClone(callClockRecordSchema.parse(raw));
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid server clock");
  clock.observedAtMs = Math.max(nowMs, clock.observedAtMs);
  if (clock.state === "active") {
    const until = Math.min(clock.observedAtMs, clock.leaseUntilMs!);
    clock.usedMs = Math.min(clock.allowanceMs, clock.usedMs + Math.max(0, until - clock.accountedAtMs!));
    clock.accountedAtMs = Math.max(clock.accountedAtMs!, until);
    if (clock.usedMs >= clock.allowanceMs || clock.observedAtMs >= clock.leaseUntilMs!) {
      const exhausted = clock.usedMs >= clock.allowanceMs;
      clock.state = exhausted ? "exhausted" : "paused";
      clock.pauseReason = exhausted ? "allowance_used" : "connection_lost";
      clock.accountedAtMs = null; clock.leaseUntilMs = null; clock.revision++;
      // A reply already started within the allowance may finish at exhaustion.
      // Disconnect/pause/end instead invalidate its epoch and prevent a late save.
      if (!exhausted) clock.epoch++;
    }
  }
  return callClockRecordSchema.parse(clock);
}
export function commandCallClock(raw: CallClockRecord, input: CallClockCommand, nowMs: number): CallClockRecord {
  const clock = settleCallClock(raw, nowMs), payload = JSON.stringify(input);
  const receipt = clock.receipts.find(item => item.requestId === input.requestId);
  if (receipt) { if (receipt.payload !== payload) throw new CallClockConflict(); return clock; }
  if (clock.revision !== input.expectedRevision) throw new CallClockConflict();
  if (input.action !== "start" && clock.conversationId !== input.conversationId) throw new CallClockConflict();
  if (input.action === "start" || input.action === "resume") {
    if (clock.usedMs >= clock.allowanceMs || clock.state === "active" || (input.action === "resume" && clock.state !== "paused")) throw new CallClockConflict();
    clock.state = "active"; clock.conversationId = input.conversationId; clock.pauseReason = null;
    clock.accountedAtMs = clock.observedAtMs; clock.leaseUntilMs = clock.observedAtMs + CALL_CONNECTION_GRACE_MS; clock.epoch++;
  } else if (input.action === "heartbeat") {
    if (clock.state !== "active") throw new CallClockConflict();
    clock.leaseUntilMs = clock.observedAtMs + CALL_CONNECTION_GRACE_MS;
  } else {
    if (input.action === "pause" && clock.state !== "active") throw new CallClockConflict();
    clock.state = clock.usedMs >= clock.allowanceMs ? "exhausted" : input.action === "end" ? "ended" : "paused";
    clock.pauseReason = clock.state === "exhausted" ? "allowance_used" : input.action === "end" ? "ended" : "client_pause";
    clock.accountedAtMs = null; clock.leaseUntilMs = null; clock.epoch++;
  }
  clock.revision++;
  clock.receipts = [...clock.receipts, { requestId: input.requestId, payload }].slice(-32);
  return callClockRecordSchema.parse(clock);
}
export function callClockStatus(clock: CallClockRecord) {
  const remainingMs = clock.allowanceMs - clock.usedMs;
  return callClockStatusSchema.parse({ version: clock.version, policy: clock.policy, revision: clock.revision, state: clock.state,
    conversationId: clock.conversationId, allowanceMs: clock.allowanceMs, usedMs: clock.usedMs, remainingMs, serverNowMs: clock.observedAtMs,
    leaseUntilMs: clock.leaseUntilMs, pauseReason: clock.pauseReason, connectionGraceMs: CALL_CONNECTION_GRACE_MS,
    warning: remainingMs <= 60_000 ? "ending" : remainingMs <= 5 * 60_000 ? "wrap_up" : null });
}
