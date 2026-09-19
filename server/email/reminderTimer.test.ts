import { afterEach, describe, expect, it, vi } from "vitest";
import { startEmailReminderTimer } from "./reminderTimer";
import type { MiraEmailOutboxWorker } from "./outbox";

afterEach(() => { vi.useRealTimers(); });
describe("client reminder timer", () => {
  it("does not run immediately, bounds batches, unrefs and stops", async () => {
    vi.useFakeTimers();
    const interval = vi.spyOn(globalThis, "setInterval");
    const processOne = vi.fn().mockResolvedValue("sent");
    const timer = startEmailReminderTimer({ processOne } as unknown as MiraEmailOutboxWorker, { intervalMs: 1000, batchLimit: 2 });
    expect(processOne).not.toHaveBeenCalled();
    const handle = interval.mock.results[0].value as NodeJS.Timeout;
    expect(handle.hasRef()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(processOne).toHaveBeenCalledTimes(2);
    timer.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(processOne).toHaveBeenCalledTimes(2);
    interval.mockRestore();
  });
  it("never overlaps batches and recovers after failure", async () => {
    vi.useFakeTimers();
    let complete!: (outcome: string) => void;
    const processOne = vi.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockRejectedValueOnce(new Error("offline")).mockResolvedValue("idle");
    const onError = vi.fn();
    const timer = startEmailReminderTimer({ processOne } as unknown as MiraEmailOutboxWorker, { intervalMs: 1000, batchLimit: 1, onError });
    await vi.advanceTimersByTimeAsync(4000);
    expect(processOne).toHaveBeenCalledTimes(1);
    complete("idle"); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(processOne).toHaveBeenCalledTimes(3);
    timer.stop();
  });
});
