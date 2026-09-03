#!/usr/bin/env node
// Validates the production environment *contract* for MIRA: reports which
// named variables are configured or missing, grouped by what they gate.
// It NEVER reads or prints a variable's value - only presence/absence - so
// this script is safe to run in any log-visible CI/deploy step.
//
// Usage: node scripts/check-production-env.mjs
// Exit code: 1 if any "required for startup" variable is missing, else 0.
// Every other category is informational only (a missing Stripe/Resend/
// invitation-link/email-worker variable just means that feature stays
// disabled - not that the app can't start).

import "dotenv/config";

const isSet = name => Boolean(process.env[name] && process.env[name].trim().length > 0);

const CATEGORIES = [
  {
    title: "Required for application startup",
    blocking: true,
    vars: ["DATABASE_URL", "JWT_SECRET", "VITE_APP_ID", "OAUTH_SERVER_URL", "MIRA_PUBLIC_APP_BASE_URL"],
  },
  {
    title: "Required for Stripe payments",
    blocking: false,
    note: "Only load-bearing when MIRA_PAYMENT_MODE=stripe (the production default).",
    vars: ["MIRA_PAYMENT_MODE", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PAYMENT_LINK_URL", "STRIPE_PRICE_ID", "STRIPE_CURRENCY"],
  },
  {
    title: "Required for Resend email",
    blocking: false,
    vars: ["MIRA_EMAIL_PROVIDER", "RESEND_API_KEY", "MIRA_INVITATION_FROM"],
  },
  {
    title: "Required for signed invitation links",
    blocking: false,
    note: "Without this, the email-worker's reminder links cannot be generated and the worker stays unavailable.",
    vars: ["MIRA_INVITATION_LINK_SECRET"],
  },
  {
    title: "Required for the secured email worker",
    blocking: false,
    vars: ["MIRA_EMAIL_WORKER_SECRET"],
  },
  {
    title: "Required for AI features (Call MIRA / moodboard generation)",
    blocking: false,
    note: "Not one of the task's six named buckets, added for completeness per 'include all current relevant names'.",
    vars: ["OPENAI_API_KEY", "OPENAI_EMBEDDING_BASE_URL", "OPENAI_EMBEDDING_MODEL", "OPENAI_REALTIME_MODEL", "OPENAI_REALTIME_VOICE", "OPENAI_REALTIME_TRANSCRIPTION_MODEL"],
  },
  {
    title: "Optional / development-only",
    blocking: false,
    vars: ["MIRA_V3_ENABLED", "MIRA_V3_BIRTH_DATA_ENABLED", "MIRA_PILOT_QA_RETENTION_DAYS", "DAKIDARTS_API_KEY", "DAKIDARTS_API_BASE_URL", "NOTION_INTELLIGENCE_ENABLED", "NOTION_API_KEY", "NOTION_DATABASE_ID", "BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY", "VITE_FRONTEND_FORGE_API_URL", "VITE_FRONTEND_FORGE_API_KEY", "PORT", "VITE_APP_TITLE", "VITE_APP_LOGO", "OWNER_OPEN_ID"],
  },
  {
    title: "Must never be true/set in production",
    blocking: false,
    note: "These fail closed automatically when NODE_ENV=production regardless of their value (verified in server/_core/context.ts and server/localFileStore.ts) - listed here for operator awareness, not because the app trusts them.",
    vars: ["DEV_LOCAL_AUTH_BYPASS", "DEV_LOCAL_OPEN_ID", "MIRA_LOCAL_FILE_STORE"],
    productionDangerValues: { DEV_LOCAL_AUTH_BYPASS: "true", MIRA_LOCAL_FILE_STORE: "true" },
  },
];

const nodeEnv = process.env.NODE_ENV ?? "(unset)";
console.log(`MIRA production environment contract check - NODE_ENV=${nodeEnv}\n`);

let hasBlockingGap = false;
let hasProductionDangerFlag = false;

for (const category of CATEGORIES) {
  console.log(`## ${category.title}${category.blocking ? " (blocking)" : ""}`);
  if (category.note) console.log(`   ${category.note}`);
  for (const name of category.vars) {
    const configured = isSet(name);
    const dangerValue = category.productionDangerValues?.[name];
    const flaggedDangerous = nodeEnv === "production" && dangerValue && process.env[name] === dangerValue;
    if (flaggedDangerous) hasProductionDangerFlag = true;
    const state = flaggedDangerous ? "SET (fails closed at runtime, but should be unset in production config)" : configured ? "configured" : "missing";
    console.log(`   - ${name}: ${state}`);
    if (category.blocking && !configured) hasBlockingGap = true;
  }
  console.log("");
}

if (hasProductionDangerFlag) {
  console.log("NOTE: a development-only flag is set to its dangerous value while NODE_ENV=production. The application code path ignores it in production, but remove it from the deployment config for clarity.\n");
}

if (hasBlockingGap) {
  console.error("RESULT: missing one or more variables required for application startup.");
  process.exit(1);
}

console.log("RESULT: all startup-blocking variables are configured. Review the non-blocking categories above before enabling the corresponding features.");
