# MIRA Production Environment Contract

This document classifies every environment variable MIRA's server reads (`server/_core/env.ts`), by what it gates. It never states a value — only whether a variable is expected, and what happens if it's missing.

A runnable, safe check exists at `scripts/check-production-env.mjs` (`pnpm check:env`). It reports only `configured` / `missing` per variable name, reads no external service, and never prints a value. Run it after configuring the production environment and before starting MIRA.

## 1. Required for application startup

Without these, photographer authentication and cross-service links (invitations, checkout returns, webhooks) will not work correctly in production.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Production MySQL-compatible connection string. |
| `JWT_SECRET` | Session/cookie signing secret for the OAuth session. |
| `VITE_APP_ID` | Application identity used by the OAuth SDK. |
| `OAUTH_SERVER_URL` | The OAuth provider MIRA authenticates photographers against. |
| `MIRA_PUBLIC_APP_BASE_URL` | The public origin MIRA uses to build every link it generates — invitation links, signed access links, checkout/portal returns, calendar links. Must be the real HTTPS production URL, never `localhost`. Confirmed value: `https://www.mariacavali.com` (no separate MIRA subdomain — see `docs/MANUS_DEPLOYMENT_RUNBOOK.md` §0 for the route map). |

## 2. Required for Stripe payments

Only load-bearing when `MIRA_PAYMENT_MODE=stripe` — the production default (see below). Missing these leaves photographer checkout, webhook processing, and Customer Portal access non-functional, but does not stop the app from starting.

| Variable | Purpose |
|---|---|
| `MIRA_PAYMENT_MODE` | `stripe` in production. Defaults to `stripe` automatically when `NODE_ENV=production` and this is unset — see §6. |
| `STRIPE_SECRET_KEY` | Server-side Stripe API key (Customer Portal session creation, event enrichment). |
| `STRIPE_WEBHOOK_SECRET` | Verifies the signature on `POST /api/webhooks/stripe`. Required for the webhook to accept anything. |
| `STRIPE_PAYMENT_LINK_URL` | The photographer-facing Stripe Payment Link (€33.33/month). |
| `STRIPE_PRICE_ID` | Expected price id; used to validate incoming checkout/subscription events match the configured plan. |
| `STRIPE_CURRENCY` | Expected currency (e.g. `eur`); same validation purpose. |

## 3. Required for Resend email

Missing any of these leaves `getTransactionalEmailProvider()` returning `null` — invitation emails and outbox-driven reminders fail closed (no send attempted) rather than erroring.

| Variable | Purpose |
|---|---|
| `MIRA_EMAIL_PROVIDER` | Must be exactly `resend` to activate the provider. |
| `RESEND_API_KEY` | Resend API key. |
| `MIRA_INVITATION_FROM` | Verified sender address/display name. |

## 4. Required for signed invitation links

| Variable | Purpose |
|---|---|
| `MIRA_INVITATION_LINK_SECRET` | HMAC secret the email outbox worker uses to mint `/prepare/access/:signedAccessToken` links at send time. Without it, `buildProductionMiraEmailOutboxWorker()` returns `null` and the worker endpoint stays unavailable — no reminder email can ever be generated, by design (fail closed, not fail open). |

## 5. Required for the secured email worker

| Variable | Purpose |
|---|---|
| `MIRA_EMAIL_WORKER_SECRET` | Shared secret the scheduler (Manus or n8n — pick exactly one, see the runbook) presents in the `X-MIRA-EMAIL-WORKER-SECRET` header to `POST /api/internal/mira/email-outbox/process`. Missing → the endpoint returns `503` unconditionally, verified via constant-time comparison when present. |

## 6. Required for AI features (Call MIRA / moodboard generation)

Not one of the task's six named buckets — added because the brief also asks to include "OpenAI configuration." The app starts and photographer checkout/onboarding work without these; the client-facing "Call MIRA" voice conversation and moodboard generation do not.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Realtime voice + embedding/moodboard calls. |
| `OPENAI_EMBEDDING_BASE_URL`, `OPENAI_EMBEDDING_MODEL` | Retrieval/embedding configuration (has safe defaults). |
| `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_CUSTOM_VOICE_ID`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | Realtime call configuration (has safe defaults except the API key). |

## 7. Optional / development-only

Safe to leave unset in production; each has a workable default or gates an unrelated optional feature.

`MIRA_V3_ENABLED`, `MIRA_V3_BIRTH_DATA_ENABLED`, `MIRA_PILOT_QA_RETENTION_DAYS`, `DAKIDARTS_API_KEY`, `DAKIDARTS_API_BASE_URL`, `NOTION_INTELLIGENCE_ENABLED`, `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `NOTION_API_BASE_URL`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY`, `PORT` (the host sets this), `VITE_APP_TITLE`, `VITE_APP_LOGO`, `OWNER_OPEN_ID`, `VITE_OAUTH_PORTAL_URL`.

`VITE_FRONTEND_FORGE_API_KEY` is intentionally the one secret-shaped value exposed to the browser bundle (the `VITE_` prefix is Vite's own client-exposure convention) — this is pre-existing platform infrastructure unrelated to MIRA's own work, confirmed to be the only `VITE_`-prefixed credential referenced anywhere in client code. No MIRA-specific secret (Stripe, Resend, OpenAI, invitation-link, email-worker) is ever read via `import.meta.env` — confirmed by direct search of `client/src`.

### Isolated-preview storage fallback (not for real commercial production)

`MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION` (`server/_core/env.ts`) is an explicit, off-by-default opt-in for an isolated preview/demo deployment that runs with `NODE_ENV=production` but has no Forge storage (`BUILT_IN_FORGE_API_URL`/`BUILT_IN_FORGE_API_KEY`) configured. Forge is always preferred whenever both Forge variables are set, regardless of this flag. When Forge is absent, `NODE_ENV=production`, and this flag is unset or anything other than the literal string `true`, both the storage proxy (`server/_core/storageProxy.ts`) and `storageGetSignedUrl`/`storagePut` (`server/storage.ts`) continue to fail closed exactly as before. Setting it to exactly `true` only widens the existing local-disk fallback (`LOCAL_STORAGE_ROOT` in `server/storage.ts`) to also apply under production, so an isolated preview that already wrote assets to that path (uploaded references, demo moodboard placeholders) can serve them. It does not change Forge-configured behavior, does not touch the database, and is not a substitute for real commercial production storage (Forge/S3) — a genuine production deployment should configure Forge instead of setting this flag.

## 8. Must never be `true` / set in production

| Variable | Dangerous value | What actually happens if set anyway |
|---|---|---|
| `DEV_LOCAL_AUTH_BYPASS` | `true` | **Fails closed automatically.** `isLocalAuthEnabled()` (`server/_core/context.ts`) requires `NODE_ENV` to be `development` or `test` *and* this flag — under `NODE_ENV=production` it is always ignored, regardless of value. |
| `DEV_LOCAL_OPEN_ID` | any | Only read inside the same bypass path above — inert without it. |
| `MIRA_LOCAL_FILE_STORE` | `true` | **Fails closed automatically.** `isLocalFileStoreEnabled()` (`server/localFileStore.ts`) has the identical `NODE_ENV` guard — under `NODE_ENV=production`, MIRA always uses the real database regardless of this flag. |

This is a verified property of the current code, not a promise — confirmed by reading both guard functions directly. It means an accidental leftover `MIRA_LOCAL_FILE_STORE=true` in a production `.env` cannot silently divert real payment/invitation data into a local JSON file; it is simply ignored once `NODE_ENV=production`. Still remove these from the production configuration for clarity — `scripts/check-production-env.mjs` flags them if present.

## Notes on defaults

- `MIRA_PAYMENT_MODE` defaults to `stripe` when `NODE_ENV=production` and the variable is unset, and to `local` otherwise (`server/_core/env.ts`). Production deployments should set it explicitly rather than rely on the default.
- `STRIPE_CURRENCY` defaults to `eur` if unset.
- All embedding/realtime model variables have working defaults; only the API key is truly required to enable the feature.
