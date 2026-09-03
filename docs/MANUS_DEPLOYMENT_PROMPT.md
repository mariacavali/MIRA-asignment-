# MIRA — Manus Deployment Handover Prompt

Copy-paste this entire prompt to Manus to begin the controlled MIRA deployment.

---

You are deploying MIRA, a photographer preparation-room product, alongside the existing site at **www.mariacavali.com**. Preserve that existing site exactly as it is — MIRA is an addition, not a replacement, and it does **not** use a separate subdomain. The URL architecture is confirmed: route only `/for-photographers` (the public sales page), `/mira/*` (the photographer application), `/prepare/*` (the private client Shoot Room), and `/api/*` (MIRA's APIs, webhook, and worker endpoint) to this app; every other path on the domain, including `/`, stays with the existing site untouched. See `docs/MANUS_DEPLOYMENT_RUNBOOK.md` §0 for the full route map and the exact production URLs (Stripe redirect, webhook, email-worker endpoint, portal return).

**Read `docs/MANUS_DEPLOYMENT_RUNBOOK.md` in full before taking any action.** It is the single ordered procedure for this deployment, including a blocking migration-tooling finding you must resolve before applying any database migration. Do not skip or reorder its steps.

## Operating rules for this deployment

- **Minimize credits.** Perform one deployment pass. Do not re-run steps speculatively, do not iterate on infrastructure choices once a working one is found, and do not explore alternative hosting configurations "to compare" — pick the straightforward option and proceed.
- **Never guess an environment variable value.** Every variable this deployment needs is named and classified in `docs/MANUS_ENVIRONMENT_CONTRACT.md`. If a required value isn't provided to you, stop and ask for it by name — never invent, reuse a placeholder, or carry over a value from another project.
- **Pause only for missing secrets or irreversible actions.** Don't pause to ask about reversible, clearly-specified steps (e.g. "should I run `pnpm build`?") — the runbook already answers those. Do pause for: any secret you don't have, applying the database migrations, enabling the email-worker scheduler, or anything else that spends real money or sends a real message.
- **Back up before migrations.** Follow runbook Step 2 exactly. If the target database already has data in it, confirm the backup exists and is restorable before Step 4.
- **Apply only the audited migrations.** Follow the runbook's migration-tooling remediation before running `drizzle-kit migrate` against production. Do not run `drizzle-kit generate` against the production database at any point — the runbook explains why.
- **Configure and verify, don't assume.** After configuring environment variables, run `pnpm check:env` and resolve every startup-blocking gap. After starting the service, check `GET /api/health` and `GET /api/internal/mira/readiness` — both are safe, value-free, and don't call any external provider.
- **Report the public URL and readiness results** once the service is up — the actual readiness JSON (state strings only; it contains no secret or identifier, so it's safe to paste back in full).

## What you must NOT do without Maria's explicit, per-action approval

- Do not send a real test email.
- Do not charge real money (the smoke test uses Maria's `MARIATEST` 100%-discount coupon specifically so a real checkout can be verified at €0).
- Do not call OpenAI (Call MIRA voice, or moodboard generation).
- Do not activate the email-worker scheduler (Manus scheduled request or the n8n workflow — choose exactly one per the runbook, and leave it off until told to turn it on).
- Do not run the production smoke test (`docs/MANUS_PRODUCTION_SMOKE_TEST.md`) until Maria explicitly says to begin it. That document itself marks every cost-incurring step with its own approval gate — respect those too, individually, even mid-checklist.

## Deliverables when this pass is complete

1. Confirmation of which runbook steps were completed, in order, including the migration-tooling remediation outcome.
2. The production public URL.
3. The full `/api/internal/mira/readiness` response.
4. A clear list of anything still pending Maria's decision (secrets not yet provided, the scheduler choice, the smoke test approval) — see `docs/MANUS_DEPLOYMENT_RUNBOOK.md`'s own "exact remaining decisions" if one exists, otherwise compile this yourself from what you were unable to complete without a pause.
5. Explicit confirmation that no email was sent, no AI provider was called, no real charge occurred, and the scheduler is still off — unless Maria approved specific exceptions during this pass, in which case list exactly which ones and why.

Stop here and wait for Maria's response before proceeding to the smoke test.
