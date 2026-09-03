import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ENV } from "../_core/env";
import { processEmailOutboxBatch, type MiraEmailOutboxWorker } from "./outbox";

export const MIRA_EMAIL_WORKER_BATCH_LIMIT = 10;
let processing = false;

export function constantTimeSecretEqual(provided: string | undefined, expected: string) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createEmailOutboxWorkerHandler(worker: MiraEmailOutboxWorker | null, secret = process.env.MIRA_EMAIL_WORKER_SECRET ?? ""): RequestHandler {
  return async (req, res) => {
    if (!secret) return res.status(503).json({ error: "Email worker is not configured" });
    if (!constantTimeSecretEqual(req.header("X-MIRA-EMAIL-WORKER-SECRET"), secret)) return res.status(401).json({ error: "Email worker authentication failed" });
    if (!worker) return res.status(503).json({ error: "Email worker is unavailable" });
    if (processing) return res.status(409).json({ error: "Email worker is already processing" });
    processing = true;
    try {
      return res.status(200).json(await processEmailOutboxBatch(worker, MIRA_EMAIL_WORKER_BATCH_LIMIT));
    } catch {
      return res.status(503).json({ error: "Email worker is unavailable" });
    } finally {
      processing = false;
    }
  };
}

export function workerConfigurationSecret() {
  return ENV.emailWorkerSecret;
}