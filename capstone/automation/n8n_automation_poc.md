# Automation POC — n8n Workflow Export

**Status:** This document covers the required "Automation POC" deliverable specifically: a real, importable n8n workflow export with annotated documentation. It is separate from `capstone/automation/automation_poc.md`, which documents MIRA's own in-application automation chain (Stripe → Shoot Room → readiness) — that chain is direct code, not an n8n workflow, and remains documented on its own terms there.

## The exports

Two real, importable n8n workflow JSON files exist in this repository at `workflows/`:

| File | Workflow name | Nodes | Active |
|---|---|---|---|
| `workflows/mira-client-email-sequence.json` | MIRA Client Email Sequence | 3 (`Webhook` → `Code` → `Code`) | No — inactive by design |
| `workflows/mira-email-outbox-trigger.json` | MIRA Email Outbox Trigger | 2 (`Schedule Trigger` → `HTTP Request`) | No — inactive by design |

Both are described in full, with import instructions, in `docs/n8n-email-sequence-setup.md`. This document restates the required "what it does / why it fits / limits vs production" framing the brief asks for specifically.

## What it does

**MIRA Client Email Sequence** receives one shoot's event data (shoot ID, client name, email, shoot date/time, timezone, room URL, invitation-sent time, and optional acceptance/completion timestamps) via a webhook, and computes which of MIRA's four client email milestones is next due:

1. `shoot_room_invitation` — sent immediately when the invitation goes out.
2. `preparation_guidance` — sent once the client accepts the invitation.
3. `call_mira_reminder` — sent 48 hours after acceptance.
4. `shoot_day_reminder` — sent 24 hours before the shoot.

The workflow suppresses milestones that don't apply yet (preparation not accepted), don't apply anymore (already completed, invitation invalid/cancelled, shoot already passed), or were already processed (idempotency key based on shoot ID + milestone ID). Its output is always `prepared_not_sent` with `externalSendPerformed: false` — **this workflow computes what should be sent and when; it never sends an email itself.**

**MIRA Email Outbox Trigger** is a five-minute schedule trigger that calls `POST /api/internal/mira/email-outbox/process` on the real MIRA application — i.e. it is a scheduler for MIRA's own durable, provider-neutral email outbox (`server/email/outbox.ts`), not a replacement for it.

## Why it fits the use case

The core problem this capstone targets is repeated, manual client preparation work (`capstone/round2/use-case-definition.md`). Email reminders are a concrete instance of that: without automation, a photographer (or MIRA) would need to manually track which of four milestones is due for every open shoot, every day. This workflow encodes that scheduling logic once, declaratively, in a tool (n8n) separate from the application's own codebase — demonstrating the automation-boundary pattern this capstone's brief asks for, using synthetic webhook payloads only.

## Limits vs. production

- **Inactive by design.** Both workflows are shipped inactive; only the webhook test URL should ever be used, and only with synthetic data — never a real client's data.
- **No external send capability.** The email-sequence workflow deliberately never calls a real email provider itself; MIRA remains the sole source of truth for actually sending anything (`docs/n8n-email-sequence-setup.md`).
- **No production idempotency storage, retries, or dead-lettering.** The idempotency key computed here is not backed by durable storage inside n8n; production requires MIRA's own outbox (already implemented, `server/email/outbox.ts`) as the durable boundary, not this workflow.
- **No signed delivery from MIRA, no consent/lawful-basis check, no CLOS-link verification gate.** All of these remain MIRA-side responsibilities, not something this workflow performs.
- **Never receives sensitive data.** Neither workflow ever receives authentication cookies, passwords, API keys, payment instruments, private Shoot Room tokens, client conversations, recordings, visual references, Creative DNA, or moodboard data (`docs/MIRA_AI_AND_DATA_INVENTORY.md`).
- **The outbox-trigger workflow reads only non-secret configuration** (`MIRA_PUBLIC_APP_BASE_URL`, `MIRA_EMAIL_WORKER_SECRET`) from n8n's own credential store — no literal secret is ever embedded in the exported JSON file itself.

## How to import and inspect

1. Import either `.json` file into a local or sandbox n8n instance (Workflows → Import from File).
2. Leave it inactive.
3. Trigger the webhook (email-sequence workflow) or manually execute the workflow once (outbox-trigger) with synthetic payload values only, per `docs/n8n-email-sequence-setup.md`'s exact field list.
4. Inspect the `Prepared Not Sent Result` node's output to confirm `prepared_not_sent` / `externalSendPerformed: false`.

## Relationship to the separate, unrelated early PoC

This is not the same thing as the *earlier*, pre-application n8n prototype described in `capstone/round2/poc-documentation.md` (client input → OpenAI → JavaScript parsing → Google Sheets → Google Docs), which predates the current MIRA application entirely and is documented purely as historical context. This document covers the current, real, importable n8n automation artifact that exists in this repository today.

## Honest gap: no video recording

Round 2's brief asks for a 2–5 minute demo recording of the POC alongside its documentation. **No recording of this n8n workflow, or of the live MIRA app, exists in this repository or was produced as part of this work** — this coding environment has no screen-recording capability. The reproducible steps in "How to import and inspect" above are the honest substitute: importing either workflow and triggering it per those steps produces the same execution this recording would show.

**A related file exists outside this repository, not yet verified as this recording:** `MIRA_Ironhack_Presentation_Workflow_Calendar_Evidence.pdf.mp4` (~69MB, in the user's local Downloads folder, not committed here — large binaries are referenced, not duplicated, per this project's own evidence-indexing convention). Its filename matches a presentation PDF exactly, which suggests a Canva slide-deck video export rather than a screen-recording of the live application — this has not been confirmed either way. **The exact missing item is: a screen-recording of the actual running MIRA app (signup → shoot → invitation → Shoot Room → preparation), 2–5 minutes, produced by the user** (this environment cannot produce or verify one). If the file above is confirmed to be that recording, it should be added to `capstone/round2/evidence/` (or linked from there) with that confirmation noted.
