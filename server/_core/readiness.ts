import { sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import { ENV } from "./env";
import { getDb } from "../db";
import { isLocalFileStoreEnabled } from "../localFileStore";
import { getTransactionalEmailProvider } from "../email";

export type ReadinessState = "ready" | "not_ready" | "not_configured";
export type ReadinessComponent = { state: ReadinessState };
export type ReadinessReport = {
  status: "ready" | "not_ready";
  components: {
    app: ReadinessComponent;
    database: ReadinessComponent;
    migrations: ReadinessComponent;
    stripe: ReadinessComponent;
    resend: ReadinessComponent;
    invitationLinkSigning: ReadinessComponent;
    emailWorker: ReadinessComponent;
  };
};

// Every check here is a boolean/state probe only - it never returns a value,
// an identifier, a row count, or any provider payload, and it never calls
// Stripe, Resend, or any other external service. Database checks are limited
// to `SELECT 1` (connectivity) and a zero-row SELECT against MIRA's own
// tables (existence), so this endpoint can never process a job, send an
// email, or leak business data - only "is this component wired up".
async function checkDatabase(): Promise<{ database: ReadinessComponent; migrations: ReadinessComponent }> {
  if (isLocalFileStoreEnabled()) {
    // Local file-store mode intentionally has no MySQL dependency - report
    // this distinctly from a real, misconfigured/unreachable database.
    return { database: { state: "not_configured" }, migrations: { state: "not_configured" } };
  }
  const db = await getDb();
  if (!db) return { database: { state: "not_ready" }, migrations: { state: "not_ready" } };
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    return { database: { state: "not_ready" }, migrations: { state: "not_ready" } };
  }
  // Migrations 0016/0017 introduce these tables; their presence is the
  // cheapest reliable signal that the required MIRA migrations have actually
  // been applied to this database (see the migration audit in the runbook -
  // the journal/snapshot metadata for 0016/0017 must be reconciled before
  // `drizzle-kit migrate` will pick them up at all).
  const requiredTables = ["mira_stripe_billing_identities", "mira_pending_checkouts", "mira_processed_stripe_events", "mira_email_outbox"];
  try {
    for (const table of requiredTables) {
      await db.execute(sql`SELECT 1 FROM ${sql.identifier(table)} LIMIT 0`);
    }
    return { database: { state: "ready" }, migrations: { state: "ready" } };
  } catch {
    return { database: { state: "ready" }, migrations: { state: "not_ready" } };
  }
}

function checkStripe(): ReadinessComponent {
  const configured = ENV.paymentMode === "stripe"
    && Boolean(ENV.stripeSecretKey)
    && Boolean(ENV.stripeWebhookSecret)
    && Boolean(ENV.stripePriceId)
    && Boolean(ENV.stripePaymentLinkUrl);
  return { state: configured ? "ready" : "not_configured" };
}

function checkResend(): ReadinessComponent {
  return { state: getTransactionalEmailProvider() ? "ready" : "not_configured" };
}

function checkInvitationLinkSigning(): ReadinessComponent {
  return { state: ENV.invitationLinkSecret ? "ready" : "not_configured" };
}

function checkEmailWorker(): ReadinessComponent {
  return { state: ENV.emailWorkerSecret ? "ready" : "not_configured" };
}

export async function buildReadinessReport(): Promise<ReadinessReport> {
  const { database, migrations } = await checkDatabase();
  const components: ReadinessReport["components"] = {
    app: { state: "ready" },
    database,
    migrations,
    stripe: checkStripe(),
    resend: checkResend(),
    invitationLinkSigning: checkInvitationLinkSigning(),
    emailWorker: checkEmailWorker(),
  };
  // "not_configured" is a legitimate state in local/dev deployments (e.g.
  // local file-store mode, or Stripe/Resend simply not wired up yet) and
  // must not fail the overall report - only an actual "not_ready" component
  // (something expected to work that doesn't) does.
  const status = Object.values(components).some(component => component.state === "not_ready") ? "not_ready" : "ready";
  return { status, components };
}

// GET /api/health - minimal process liveness only, for load balancers/uptime
// monitors. No component detail, no DB call, always safe and instant.
export const healthHandler: RequestHandler = (_req, res) => {
  res.status(200).json({ status: "ok" });
};

// GET /api/internal/mira/readiness - the detailed, per-component breakdown.
// Every field is a state enum ("ready"/"not_ready"/"not_configured"); no
// secret value, connection string, table row, or provider identifier is ever
// present in the response.
export const readinessHandler: RequestHandler = async (_req, res) => {
  try {
    const report = await buildReadinessReport();
    res.status(report.status === "ready" ? 200 : 503).json(report);
  } catch {
    res.status(503).json({ status: "not_ready", error: "Readiness check failed" });
  }
};
