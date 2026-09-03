# MIRA — Manus Deployment Runbook

Ordered, one-pass deployment procedure for a controlled MIRA production rollout. No step in this document has been executed — this is the plan, not a log. No secret value appears anywhere below; see `docs/MANUS_ENVIRONMENT_CONTRACT.md` for the full variable classification and `pnpm check:env` for a safe presence-only check.

**Read this entire document before starting.**

---

## ✅ Migration audit finding — resolved

`drizzle/meta/_journal.json` previously listed only migrations `0000`–`0015`, while **`0016_mira_stripe_payment_persistence.sql`** and **`0017_mira_email_outbox.sql`** existed on disk with no `meta/0016_snapshot.json` / `meta/0017_snapshot.json` and no journal entry — so `drizzle-kit migrate` would have silently skipped both.

This has been remediated using the disposable-workspace procedure this box used to prescribe: a scratch copy of `schema.ts` + `meta/0000`–`0015` (no database, no `DATABASE_URL` connection) was used to run `drizzle-kit generate` in two steps, confirming the resulting DDL matches the hand-written `0016`/`0017` SQL field-for-field. Only the reconciled `meta/0016_snapshot.json`, `meta/0017_snapshot.json`, and the two `_journal.json` entries (tagged `0016_mira_stripe_payment_persistence` / `0017_mira_email_outbox` to match the real filenames) were carried into the repo — the reviewed `.sql` files themselves were not touched. `drizzle-kit check` now reports the journal/snapshot chain consistent.

**Non-blocking follow-up, not part of this fix:** `schema.ts`'s `.references()` calls for these four tables don't pin explicit foreign-key names, so `drizzle-kit generate`'s implicit naming (`..._<col>_<refTable>_<refCol>_fk`) differs from the shorter custom names the hand-written SQL actually creates (e.g. `mira_pending_checkouts_photographer_fk`, `mira_email_outbox_shoot_fk`). The reconciled snapshots record the *real* names that will exist in the database, which is correct — but the next `drizzle-kit generate` run will therefore propose a cosmetic rename migration (`DROP FOREIGN KEY` / `ADD CONSTRAINT` back to the implicit names) for these four constraints even with no other schema change. It's a naming-convention mismatch, not a data-safety issue, and applying it is optional; only fix it (by adding explicit `name:` options in `schema.ts`, in its own reviewed migration) if that generated rename migration is ever something the team wants to run.

**Still true:** do not run `drizzle-kit generate` against a database you care about — validate with `pnpm db:check` (`drizzle-kit check`, added to `package.json`, no database connection) instead.

---

## 0. URL and routing architecture — confirmed, no subdomain

MIRA shares the single production domain `www.mariacavali.com` with the existing Maria Cavali website. **The existing website must remain intact** — MIRA is mounted alongside it at specific path prefixes, never at a separate subdomain, and the existing site's own routes (its homepage and everything outside the prefixes below) are not overwritten, redirected, or proxied to this Express server.

**Routes that belong to this Express/Vite app** — Manus's routing layer (reverse proxy / path-based rule set in front of the existing site) must forward exactly these prefixes here, and nothing else:
- `/for-photographers` — the public MIRA sales/landing page (renders the same component as `/mira`, which remains a working backward-compatible alias — do not remove it or redirect it away).
- `/mira` and every path under `/mira/*` — the photographer application (login, signup, checkout, onboarding, dashboard, shoot detail, and the `/mira` landing alias itself).
- `/prepare/*` — the private client Shoot Room, covering both `/prepare/:token` (first-email link) and `/prepare/access/:signedAccessToken` (reminder-email signed link).
- `/api/*` — every MIRA API, webhook, and worker endpoint (tRPC at `/api/trpc`, the OAuth callback at `/api/oauth/callback`, health/readiness, the Stripe webhook, and the email-worker endpoint below). These must reach this Express server directly and untouched — see Step 8 for why the Stripe webhook specifically cannot sit behind a body-rewriting proxy.

**Everything else on the domain** (the existing site's homepage `/` and its other pages) is out of this app's scope — do not point Manus's catch-all at this Express server, or the SPA fallback in `server/_core/vite.ts` (`serveStatic`'s `app.use("*", ...)`) will serve the MIRA client bundle for the existing site's URLs too, which would visibly break it. Route only the four prefixes above to this app.

**Client-side deep links and refresh:** this app's static-file server falls back to `index.html` for any path it doesn't otherwise recognize, so a browser refresh or a bookmark at `/for-photographers`, `/mira/checkout`, `/mira/payment-success`, `/mira/dashboard`, `/mira/shoots/:id`, `/prepare/:token`, or `/prepare/access/:signedAccessToken` all load correctly and hand off to the client router — provided Manus is forwarding those prefixes here per the routing rule above. Because every `/api/*` route is registered in `server/_core/index.ts` *before* that catch-all fallback, a request to a real API path is always handled by its own handler and never swallowed by the SPA fallback.

**Confirmed production URLs** (all driven by `MIRA_PUBLIC_APP_BASE_URL=https://www.mariacavali.com` — see Step 6; no server code hard-codes this domain, it is documentation only):
- Stripe after-payment redirect (configured in the Stripe dashboard, Step 7): `https://www.mariacavali.com/mira/payment-success?session_id={CHECKOUT_SESSION_ID}`
- Stripe webhook (Step 8): `https://www.mariacavali.com/api/webhooks/stripe`
- Email-worker endpoint (Steps 13–15): `https://www.mariacavali.com/api/internal/mira/email-outbox/process`
- Stripe Customer Portal return (built by `buildPortalReturnUrl`, Step 10): `https://www.mariacavali.com/mira/dashboard`

---

## 1. Create/connect the production MySQL-compatible database

Provision a MySQL 8-compatible database (PlanetScale, RDS, Cloud SQL, or Manus's own managed offering). Record the connection string for `DATABASE_URL` — do not paste it into chat, tickets, or logs.

## 2. Back up existing production data

If this is the first MIRA deployment to this database, a fresh empty database needs no backup. If any prior MIRA data already exists in this database (a prior partial deployment, or a shared database with other tables), take a full logical backup (`mysqldump` or the provider's snapshot feature) before touching migrations. Store the backup location for the rollback procedure in Step 18.

## 3. Configure environment variables securely

Use `docs/MANUS_ENVIRONMENT_CONTRACT.md` as the checklist. Set variables through the hosting platform's secret manager, never in a committed file. After setting them, run:

```
pnpm check:env
```

This reports `configured`/`missing` per variable name only — no values are read back or logged. Resolve every "Required for application startup" gap before continuing; the other categories can be deferred feature-by-feature (e.g. deploy without Resend configured, add it later — the app fails closed, not open, per the environment contract).

## 4. Apply migrations 0016 then 0017 through the existing Drizzle process

The migration audit finding above is resolved, so the journal now registers `0016` and `0017`. Against the real production `DATABASE_URL`:

```
npx drizzle-kit migrate
```

Do not run `drizzle-kit generate` against production. `drizzle-kit migrate` applies journal-registered, not-yet-applied migrations **in journal order** — with the reconciled journal, this naturally applies `0016` before `0017` (0017's `mira_email_outbox` table has foreign keys into tables `0008` and `0016`'s siblings already created). Every migration from `0000` through `0017` is additive (`CREATE TABLE` / `CREATE INDEX` only) — none of them contain `DROP`, destructive `ALTER`, or a column removal. No existing MIRA data is at risk from applying them; the risk this runbook flags is entirely about the *tooling* not knowing 0016/0017 exist yet, not about their content.

These migrations were not written idempotently (`CREATE TABLE` without `IF NOT EXISTS`), matching this project's existing convention — every other migration in `drizzle/` follows the same pattern. Do not re-run `drizzle-kit migrate` against a database where 0016/0017 already applied; Drizzle's own migration ledger table prevents double-application in the normal case, but do not work around that ledger manually.

## 5. Build and start MIRA

```
pnpm install
pnpm build
NODE_ENV=production pnpm start
```

- Node.js: `^20.19.0 || >=22.12.0` (declared in `package.json` `engines`; this is what Vite 7 requires for the production build — building on Node 22.10 or earlier prints a version warning but currently still succeeds; do not rely on that margin in production).
- `pnpm start` runs `node dist/index.js` with `NODE_ENV=production` — this is also what makes every local-only bypass fail closed (see the environment contract, §8).
- The server binds via `server.listen(port)` with no explicit host, which binds all interfaces (`0.0.0.0`) — correct for a container/PaaS target. It reads `port` from `process.env.PORT`, defaulting to `3000` only if unset.
- **Known behavior to be aware of**: if the assigned `PORT` happens to already be in use at boot, the app silently tries up to 19 subsequent ports (`server/_core/index.ts`, `findAvailablePort`) rather than failing. In a fresh container this should never trigger, but if a deploy's health check fails against the expected port, check the startup log line (`Server running on http://localhost:<port>/`) for the actual bound port before assuming the process crashed.

## 6. Set the final public base URL

Set `MIRA_PUBLIC_APP_BASE_URL=https://www.mariacavali.com` (confirmed production domain, no separate MIRA subdomain or subpath origin — see §0) — never `localhost`. This drives every generated link: invitations, signed access links, Stripe checkout/portal returns, calendar entries. Every server-side URL builder (`server/_core/publicUrl.ts`) reads this at runtime rather than hard-coding the domain; only documentation and deployment configuration reference `www.mariacavali.com` directly. Restart the app after changing it.

## 7. Configure the Stripe Payment Link

In the Stripe dashboard:
- Price: **€33.33/month**, recurring.
- After-payment redirect: `https://www.mariacavali.com/mira/payment-success?session_id={CHECKOUT_SESSION_ID}`.
- Preserve the Payment Link's opaque `client_reference_id` pass-through — MIRA's checkout flow sets this and correlates it back to the pending photographer record; `session_id` itself is informational only (the app never trusts it to grant access — verified webhook processing is authoritative).
- Set `STRIPE_PAYMENT_LINK_URL` and `STRIPE_PRICE_ID` (and `STRIPE_CURRENCY=eur`) accordingly.

## 8. Configure the Stripe signed webhook

Webhook endpoint: `https://www.mariacavali.com/api/webhooks/stripe`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. The route is mounted with `express.raw()` ahead of the JSON body parser specifically so Stripe's signature check receives untouched bytes — do not front this route with anything that rewrites or re-encodes the request body (a Manus platform proxy that normalizes JSON bodies would break signature verification).

## 9. Stripe events currently handled

Exactly five, verified from `server/payment/stripeWebhook.ts`:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Any other event type is acknowledged with `200 { received: true, processed: false }` and otherwise ignored — configure the Stripe webhook to send only what's needed, or leave it on "all events"; unhandled types are safely no-ops either way.

## 10. Configure Stripe Customer Portal and dashboard return URL

Enable the Customer Portal in the Stripe dashboard for the production account. MIRA builds the return URL itself (`server/payment/stripePortal.ts`, `buildPortalReturnUrl`, via the shared `server/_core/publicUrl.ts` helpers) as `https://www.mariacavali.com/mira/dashboard`, and validates that any portal URL Stripe returns is `https://billing.stripe.com/...` before ever redirecting a browser to it — no manual return-URL configuration is needed beyond `MIRA_PUBLIC_APP_BASE_URL` already being set correctly (Step 6).

## 11. Configure a verified Resend sender

Verify the sending domain/address in Resend, then set `MIRA_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `MIRA_INVITATION_FROM` to the verified sender. Until all three are set, `getTransactionalEmailProvider()` returns `null` and invitation/reminder email sending fails closed rather than erroring.

## 12. Configure `MIRA_INVITATION_LINK_SECRET`

Generate a long random secret (e.g. `openssl rand -base64 48`) and set it. This is what the email outbox worker uses to mint `/prepare/access/:signedAccessToken` reminder links at send time — distinct from the raw invitation token in the first email, which is unaffected. Without this secret, the worker stays unavailable (verified: `buildProductionMiraEmailOutboxWorker()` returns `null`).

## 13. Configure `MIRA_EMAIL_WORKER_SECRET`

Generate a second, independent long random secret and set it. This authenticates calls to `POST /api/internal/mira/email-outbox/process` via the `X-MIRA-EMAIL-WORKER-SECRET` header, checked with a constant-time comparison. Keep it distinct from `MIRA_INVITATION_LINK_SECRET` — they protect different things (who may trigger the worker vs. what a client link proves).

## 14–15. Choose exactly one scheduler and point it at the worker endpoint

Pick **one**:
- **Manus scheduled request** — configure Manus to issue `POST https://www.mariacavali.com/api/internal/mira/email-outbox/process` with header `X-MIRA-EMAIL-WORKER-SECRET: <the secret>`, every 5 minutes, **or**
- **The existing inactive n8n workflow** (`workflows/mira-email-outbox-trigger.json`) — import it into n8n, set its `MIRA_PUBLIC_APP_BASE_URL` / `MIRA_EMAIL_WORKER_SECRET` credentials in n8n's own credential store (never as a literal value in the workflow JSON), and activate it on its existing 5-minute schedule trigger.

Do not configure both — a duplicate trigger firing the same batch window doesn't corrupt anything (the endpoint is idempotent and self-serializing: one `processing` flag prevents overlap, and jobs are claimed atomically), but it wastes calls and complicates monitoring for no benefit.

Each invocation claims a fixed batch of 10 due jobs, rechecks each invitation/shoot's live state before sending, and returns only aggregate counts (`claimed`, `sent`, `suppressed`, `failed`) — never job details, recipients, or links.

## 16. Verify health/readiness

- `GET [PUBLIC_MIRA_BASE_URL]/api/health` → `{"status":"ok"}` confirms the process is up. No component detail, no external call.
- `GET [PUBLIC_MIRA_BASE_URL]/api/internal/mira/readiness` → per-component `ready` / `not_ready` / `not_configured` states for `app`, `database`, `migrations`, `stripe`, `resend`, `invitationLinkSigning`, `emailWorker`. `database`/`migrations` run a `SELECT 1` and a zero-row probe against the four MIRA-specific tables — this is how the Step 4 migration audit finding would surface at runtime if it were ever missed (`migrations: not_ready` while `database: ready`). Neither endpoint calls Stripe, Resend, or sends anything; neither returns a value, identifier, or count — only state strings.

Confirm `readiness` reports `stripe: ready`, `resend: ready`, `invitationLinkSigning: ready`, and `emailWorker: ready` before proceeding to the smoke test — each is deliberately a config-presence check, not a live provider call.

## 17. Run the production smoke test

Follow `docs/MANUS_PRODUCTION_SMOKE_TEST.md` in full. Do not skip its explicit-approval gates — several of its steps cause a real email send or a real AI cost.

## 18. Rollback

| If this fails verification... | Do this |
|---|---|
| Migration application (Step 4) | Do not proceed further. If 0016/0017 partially applied, restore from the Step 2 backup (or, for a brand-new empty database, simply drop the four new tables — they carry no data yet and no other table references them outside the FKs *into* `users`/`mira_shoots`/`mira_client_invitations`, which are safe to leave). Re-run the migration audit remediation before retrying. |
| Stripe webhook signature verification | Leave `MIRA_PAYMENT_MODE` as previously set (or `local`, blocking real checkout) until the webhook secret is corrected; no payment state changes without a verified webhook, so nothing to unwind. |
| Resend/email-worker verification | Leave `MIRA_INVITATION_LINK_SECRET` / `MIRA_EMAIL_WORKER_SECRET` unset or the scheduler deactivated — the worker fails closed by design, so "rollback" here is simply not enabling the scheduler until fixed. |
| Authentication verification | Do not open the deployment to real photographer sign-ups; keep it unlinked from any public entry point until `OAUTH_SERVER_URL`/`JWT_SECRET`/`VITE_APP_ID` are confirmed working end-to-end. |
| Anything else in the smoke test | Stop, do not activate the scheduler, do not advertise the URL publicly, and report the specific failing step back for a fix-and-retry pass — this is a controlled rollout, not a race to finish. |

---

## Appendix: local QA test data note (not production-relevant, not deleted)

Local acceptance testing (`.mira-local-data`, local file-store mode — entirely separate from the production database this runbook provisions) left behind clearly-labelled test records that were intentionally **not** deleted per that testing's own constraints:

- **Two abandoned QA photographer accounts** — created mid-flow while diagnosing a since-fixed bug, never completed onboarding, hold no shoots, no payment beyond local `test_active` status.
- **One superseded QA shoot** — an early attempt that surfaced the (now-fixed) Duration field bug; a corrected replacement shoot exists alongside it.

All are named with an unambiguous `MIRA QA Acceptance` / `QA ACCEPTANCE TEST SHOOT — DO NOT USE` label and synthetic `@example.test` addresses — nothing here overlaps with real user data, and none of it exists in the production database this runbook targets (local file-store data never migrates).

**Safe future cleanup procedure** (not performed now, and not needed before this deployment):
1. Take a fresh timestamped backup of `.mira-local-data/store.json` (as was done before the acceptance-testing session that created these records).
2. Identify the exact records by their `MIRA QA Acceptance` name / `example.test` domain / `QA ACCEPTANCE TEST SHOOT` title — confirm the count and identifiers locally (do not print them into any shared document or chat).
3. Remove only those exact records, either through the application itself (if/when a delete-account or delete-shoot capability exists) or via a reviewed, one-off edit to the local JSON store with the fresh backup as a rollback point.
4. Diff the store before and after the edit to confirm nothing else changed.

This note exists so the QA data's origin and safe removal path are documented — not to instruct anyone to act on it now.

## Reference: what was verified before this runbook was written

- Production build (`pnpm build`) succeeds (Vite + esbuild). TypeScript (`pnpm check`) passes clean.
- Full test suite: 409 passed, 3 skipped, 17 failed — the 17 are the pre-existing, environment-gated MIRA V3 test failures (`MIRA_V3_ENABLED` not set for the test runner), unrelated to this work; confirmed identical before and after, including after adding the `/for-photographers` route and the shared `server/_core/publicUrl.ts` helpers (17 new passing tests).
- No duplicate client or server routes found. No unresolved imports (build/typecheck both clean). No MIRA-specific secret is exposed to the browser bundle.
- `DEV_LOCAL_AUTH_BYPASS` and `MIRA_LOCAL_FILE_STORE` are confirmed, by reading the guard functions directly, to fail closed under `NODE_ENV=production` regardless of their configured value.
- `/for-photographers` renders the same `MiraLanding` component as `/mira`; both purchase buttons on that page are plain links to `/mira/checkout` (no Stripe identifier or secret ever reaches the browser) and work identically regardless of which of the two paths the page was opened at, since the links are absolute paths, not relative ones.
