import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { callClockCommandSchema, CALL_CONNECTION_GRACE_MS } from "../../shared/miraCallClock";
import { callClockStatus, commandCallClock, newCallClock, settleCallClock } from "./callClock";

const conversationId = randomUUID(), origin = Date.UTC(2026, 9, 26, 12);
const command = (action: "start" | "resume" | "pause" | "end" | "heartbeat", expectedRevision: number) => ({ workspaceId: 10, conversationId, requestId: randomUUID(), expectedRevision, action });
describe("durable call allowance arithmetic", () => {
  it("starts only on an explicit server command and pauses without consuming the break", () => {
    const ready = settleCallClock(newCallClock(origin), origin + 1_000_000);
    expect(callClockStatus(ready)).toMatchObject({ state: "ready", usedMs: 0, remainingMs: 3_600_000 });
    const started = commandCallClock(ready, command("start", 0), ready.observedAtMs);
    const paused = commandCallClock(started, command("pause", 1), ready.observedAtMs + 12_345);
    expect(paused).toMatchObject({ state: "paused", usedMs: 12_345 });
    const later = settleCallClock(paused, ready.observedAtMs + 9_000_000);
    expect(later.usedMs).toBe(12_345);
    const resumed = commandCallClock(later, command("resume", later.revision), later.observedAtMs);
    expect(settleCallClock(resumed, later.observedAtMs + 1000).usedMs).toBe(13_345);
  });
  it("automatically pauses after a bounded disconnect and does not restart on a late heartbeat", () => {
    const started = commandCallClock(newCallClock(origin), command("start", 0), origin);
    const disconnected = settleCallClock(started, origin + 3_600_000);
    expect(disconnected).toMatchObject({ state: "paused", usedMs: CALL_CONNECTION_GRACE_MS, pauseReason: "connection_lost", epoch: 2 });
    expect(() => commandCallClock(disconnected, command("heartbeat", disconnected.revision), origin + 3_600_001)).toThrow();
    expect(settleCallClock(disconnected, origin + 9_000_000).usedMs).toBe(CALL_CONNECTION_GRACE_MS);
  });
  it("renews the connection without resetting spent time or the reply epoch", () => {
    let clock = commandCallClock(newCallClock(origin), command("start", 0), origin);
    for (let step = 1; step <= 12; step++) clock = commandCallClock(clock, command("heartbeat", clock.revision), origin + step * 10_000);
    expect(clock).toMatchObject({ state: "active", usedMs: 120_000, epoch: 1, leaseUntilMs: origin + 150_000 });
  });
  it("deduplicates commands without giving a replay extra connection time", () => {
    const input = command("start", 0), started = commandCallClock(newCallClock(origin), input, origin);
    const replayed = commandCallClock(started, input, origin + 10_000);
    expect(replayed).toMatchObject({ revision: 1, usedMs: 10_000, leaseUntilMs: origin + 30_000 });
    expect(() => commandCallClock(replayed, { ...input, action: "pause" }, origin + 10_000)).toThrow();
    expect(() => commandCallClock(replayed, command("pause", 0), origin + 10_000)).toThrow();
  });
  it("caps usage, preserves one in-flight finishing epoch, and never refills on start", () => {
    const started = commandCallClock(newCallClock(origin, 15_000), command("start", 0), origin);
    const exhausted = settleCallClock(started, origin + 20_000);
    expect(callClockStatus(exhausted)).toMatchObject({ state: "exhausted", usedMs: 15_000, remainingMs: 0, warning: "ending" });
    expect(exhausted.epoch).toBe(started.epoch);
    expect(() => commandCallClock(exhausted, command("start", exhausted.revision), origin + 20_000)).toThrow();
    expect(() => commandCallClock(exhausted, command("resume", exhausted.revision), origin + 20_000)).toThrow();
  });
  it("handles backwards wall-clock readings without negative or double consumption", () => {
    const started = commandCallClock(newCallClock(origin), command("start", 0), origin);
    const forward = settleCallClock(started, origin + 10_000), backward = settleCallClock(forward, origin - 1000);
    expect(backward.usedMs).toBe(10_000);
    expect(settleCallClock(backward, origin + 15_000).usedMs).toBe(15_000);
  });
  it("keeps the same balance after ending and starting another conversation", () => {
    const started = commandCallClock(newCallClock(origin), command("start", 0), origin);
    const ended = commandCallClock(started, command("end", 1), origin + 5000);
    const again = commandCallClock(ended, { ...command("start", ended.revision), conversationId: randomUUID() }, origin + 500_000);
    expect(again.usedMs).toBe(5000);
    expect(() => commandCallClock(again, { ...command("pause", again.revision), conversationId }, origin + 500_100)).toThrow();
  });
  it("warns during the last five minutes without manufacturing task completion", () => {
    expect(callClockStatus(newCallClock(origin, 300_001)).warning).toBeNull();
    expect(callClockStatus(newCallClock(origin, 300_000)).warning).toBe("wrap_up");
    expect(callClockStatus(newCallClock(origin, 60_000)).warning).toBe("ending");
  });
  it("rejects client-controlled clocks, allowances and authority", () => {
    for (const extra of [{ allowanceMs: 9_000_000 }, { usedMs: 0 }, { serverNowMs: 1 }, { userId: 2 }]) expect(() => callClockCommandSchema.parse({ ...command("start", 0), ...extra })).toThrow();
    for (const bad of [-1, 0.5, NaN, Infinity]) expect(() => settleCallClock(newCallClock(origin), bad)).toThrow();
  });
});
