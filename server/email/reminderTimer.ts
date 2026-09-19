import { processEmailOutboxBatch, type MiraEmailOutboxWorker } from "./outbox";

// A bounded batch per minute, with no overlapping runs or immediate startup
// send. Factory callers provide the repository restricted to opt-in jobs.
export function startEmailReminderTimer(worker: MiraEmailOutboxWorker, options: { intervalMs?: number; batchLimit?: number; onError?: () => void } = {}) {
  let running = false;
  let stopped = false;
  const intervalMs = Math.max(1_000, options.intervalMs ?? 60_000);
  const batchLimit = Math.max(1, Math.min(20, Math.floor(options.batchLimit ?? 10)));
  const timer = setInterval(async () => {
    if (running || stopped) return;
    running = true;
    try { await processEmailOutboxBatch(worker, batchLimit); }
    catch { options.onError?.(); }
    finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return { stop() { stopped = true; clearInterval(timer); } };
}
