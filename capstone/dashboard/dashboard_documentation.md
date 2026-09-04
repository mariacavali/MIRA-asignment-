# Dashboard Documentation — Stakeholder Metrics Specification

## Status

**No PowerBI/.pbix workspace exists.** In its place, a real, static HTML dashboard artifact now exists at [`dashboard.html`](dashboard.html) — the agreed alternative for this submission. **No live/production data exists to populate it**, so every metric card in that artifact honestly reads "No production data yet" rather than an example or placeholder number. This document is the specification behind it: what each metric measures and where its data already lives in the implemented schema.

| Item | Status |
|---|---|
| Dashboard artifact (real, static HTML file with all 7 metric cards) | **Exists** — [`dashboard.html`](dashboard.html) |
| Live/production data to populate metrics | **PENDING — no production deployment or live user base exists** |
| Underlying data model to support these metrics | **Exists** — see per-metric source tables below |
| Metric definitions and calculation logic | **Specified in this document** |

## How to navigate

Open [`dashboard.html`](dashboard.html) directly in any browser — it is fully static (no server, build step, or dependency required). Each of the 7 cards states the metric name, why it matters to a stakeholder, its current value ("No production data yet"), and the exact source table/column below. This document (`dashboard_documentation.md`) is the detailed reference each card's source note points back to: full calculation SQL, caveats, and the pending dependencies before real numbers can appear (see "Pending dependencies" below).

**Source evidence used:** `drizzle/schema.ts` (`mira_shoots`, `mira_client_invitations`, `mira_email_outbox`, `mira_pending_checkouts`, `mira_stripe_billing_identities`, `mira_shoot_moodboard`, `mira_shoot_creative_dna`), `server/miraCore/db.ts`, `server/miraCore/router.ts`, `server/payment/`, `docs/stripe-integration.md`.

## Metrics specification

Each metric below states: what it measures, why it matters to a stakeholder (photographer, MIRA operator, or investor), the exact source table(s)/field(s) already implemented, and the calculation logic. No metric here has been run against real data — every example number would be fabricated, so none is given.

### 1. Shoots created

- **Measures:** total number of shoot records created, and created-per-period (e.g. per week).
- **Why it matters:** top-of-funnel usage signal; the first thing that must be non-zero for any other metric to mean anything.
- **Source:** `mira_shoots` table, `createdAt` column (`drizzle/schema.ts`).
- **Calculation:** `COUNT(*) FROM mira_shoots WHERE createdAt BETWEEN <period_start> AND <period_end>`.

### 2. Invitations sent

- **Measures:** total number of client invitations actually sent (not merely created/link-only).
- **Why it matters:** distinguishes "photographer set up a shoot" from "photographer actually invited a client to prepare."
- **Source:** `mira_client_invitations` table, `deliveryStatus` column and `sentAt` column. An invitation counts as "sent" once `deliveryStatus` has progressed past `created`/`queued`/`failed` (i.e. `sent`, `delivered`, `opened`, `preparation_in_progress`, or `completed` — see `server/miraCore/db.ts`'s `invitationAlreadySentToClient`).
- **Calculation:** `COUNT(*) FROM mira_client_invitations WHERE sentAt IS NOT NULL AND createdAt BETWEEN <period_start> AND <period_end>`.

### 3. Invitation delivery rate

- **Measures:** of invitations sent, what share were confirmed **delivered** by the email provider (not merely accepted for sending).
- **Why it matters:** distinguishes "the system attempted to send" from "the email actually reached an inbox" — a direct signal of email infrastructure health. This is the metric most directly enabled by this project's Resend integration work (honest `queued → sent → delivered/failed` status tracking). A first real instance of this — one delivered invitation, confirmed via the delivery webhook — is now live-verified (see `capstone/automation/automation_poc.md` and `capstone/evidence/staged_validation_evidence.md`); a *rate* still requires the invitation volume this project has not yet produced.
- **Source:** `mira_client_invitations.deliveryStatus` (`delivered` vs. `sent`/`failed`), updated by the Resend delivery-status webhook (`server/email/resendWebhook.ts`).
- **Calculation:** `COUNT(deliveryStatus = 'delivered') / COUNT(deliveryStatus IN ('sent','delivered','failed')) FROM mira_client_invitations`.
- **Caveat:** this rate can only be non-zero once `RESEND_WEBHOOK_SECRET` is configured and Resend is actually delivering to real inboxes in a deployed environment — see Section "Pending dependencies" below.

### 4. Preparation completion rate

- **Measures:** of invitations sent, what share of clients completed preparation (confirmed Discovery **and** reached a completed/ready shoot room state).
- **Why it matters:** the core "did the client actually do the work" signal — the metric a static checklist can never produce (see `capstone/research/sector_research.md` §1c).
- **Source:** `mira_client_invitations.deliveryStatus = 'completed'` and/or `mira_client_invitations.completedAt IS NOT NULL`, joined against `mira_shoots.roomState`.
- **Calculation:** `COUNT(completedAt IS NOT NULL) / COUNT(sentAt IS NOT NULL) FROM mira_client_invitations`.

### 5. Readiness rate

- **Measures:** of shoots created, what share actually reached the `ready_to_shoot` state before the scheduled shoot date.
- **Why it matters:** this is the metric closest to the product's core promise — verified readiness, not merely "an invitation existed."
- **Source:** `mira_shoots.status` enum (`draft` → ... → `ready_to_shoot`, `drizzle/schema.ts`), set via `markShootReadyToShoot` (`server/miraCore/router.ts`).
- **Calculation:** `COUNT(status = 'ready_to_shoot') / COUNT(*) FROM mira_shoots WHERE scheduledAt IS NOT NULL`.

### 6. Average preparation time

- **Measures:** the average elapsed time from invitation sent to preparation completed.
- **Why it matters:** operational signal for both the photographer (how much lead time to give clients) and MIRA (whether the Discovery conversation is appropriately paced).
- **Source:** `mira_client_invitations.sentAt` and `mira_client_invitations.completedAt` (both already-persisted timestamp columns).
- **Calculation:** `AVG(completedAt - sentAt) FROM mira_client_invitations WHERE completedAt IS NOT NULL`.

### 7. Payment-to-active-account success rate

- **Measures:** of pending Stripe checkouts created, what share successfully converted to an active, paid photographer account.
- **Why it matters:** the commercial funnel's core conversion signal, and the one metric here with a real, verified reference data point — this project's own MIRADEMO checkout (`docs/stripe-integration.md`) is exactly one instance of a pending checkout successfully consuming into active access. That is one verified event, not a rate; a rate requires volume this project has not produced.
- **Source:** `mira_pending_checkouts.status` (`pending`/`consumed`/`expired`) and `mira_stripe_billing_identities.paymentState` (`pending`/`active`/`past_due`/`cancelled`/`expired`), both in `drizzle/schema.ts`; consumption logic in `server/payment/paymentEventProcessor.ts`.
- **Calculation:** `COUNT(mira_pending_checkouts.status = 'consumed') / COUNT(*) FROM mira_pending_checkouts`.

## Pending dependencies before this dashboard can show real numbers

1. A production or staging deployment with a real MySQL/TiDB database (Creative DNA/moodboard generation currently has no local-file-store path — see `capstone/automation/automation_poc.md`).
2. `RESEND_WEBHOOK_SECRET` configured against a real Resend sending domain, so delivery-rate data can populate.
3. Real invitations sent to real clients (none have been sent in this project — see `capstone/automation/automation_poc.md`).
4. A decision on the dashboard's implementation surface (new photographer-facing page, internal operator tool, or exported report) — not yet made and out of scope for this document, which specifies *what* to measure, not *how* to render it.

## Honest alternative: no Power BI (PBIX) file exists

There is no `.pbix` file and no Power BI workspace anywhere in this repository or supplied for this submission. In its place, [`dashboard.html`](dashboard.html) is the agreed alternative BI artifact:

- **What exists today:** a real, static HTML dashboard (`dashboard.html`) rendering all seven metric cards — name, stakeholder rationale, exact source column, and an honest "No production data yet" value on every card — plus this specification document and the underlying schema those calculations run against (`drizzle/schema.ts`), real and already exercised by this project's own test suite.
- **What does not exist:** any connected data source, live query, or real populated number. No screenshot image of the dashboard accompanies this submission — the HTML file itself is the artifact, directly viewable by opening it in any browser, which this project treats as more honest than a static image that could go stale or be mistaken for real data.
- **Path to real data, when it exists:** the same read-only SQL calculations already specified below can populate this exact HTML artifact (or a scheduled CSV/Markdown export feeding it) once the "Pending dependencies" below are met — no rebuild of the dashboard's structure is needed, only wiring it to a real data source.

## What this document deliberately does not do

It does not propose a chart library, a UI design, or a build plan for the dashboard artifact itself — that is Round 2/build scope. It does not include any example or placeholder numeric values, because any such value would be invented data, which this submission is explicitly instructed not to produce.
