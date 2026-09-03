# MIRA Client Email Sequence

MIRA remains the source of truth. This n8n workflow is an inactive, importable automation boundary for preparing client email milestones. It does not send email in local development and stores no MIRA transcripts, references, Creative DNA, moodboard data, or private tokens.

## Import

1. Import `workflows/mira-client-email-sequence.json` into n8n.
2. Keep it inactive and use the webhook test URL only with synthetic data.
3. Send: `shootId`, `clientFirstName`, `clientEmail`, `shootDateTime`, `clientTimezone`, `roomUrl`, `invitationSentAt`, optional `acceptedAt`, `preparationCompletedAt`, `invitationValid`, `shootCancelled`, and `processedMilestones`.
4. Inspect `Prepared Not Sent Result`. The output is `prepared_not_sent` and `externalSendPerformed: false`.

The four milestones are `shoot_room_invitation` (immediately when sent), `preparation_guidance` (after acceptance), `call_mira_reminder` (48 hours after acceptance), and `shoot_day_reminder` (24 hours before the shoot). Preparation-dependent milestones wait for `acceptedAt`. Completed preparation, invalid or cancelled invitations, post-shoot times, already processed milestones, and close-to-shoot day reminders are suppressed. Each result includes a stable idempotency key based on shoot ID and milestone ID. Rescheduling is represented by sending the updated shoot date/time with the same shoot ID.

Production requires signed delivery from MIRA, durable idempotency storage, provider credentials, consent/lawful basis, retry/dead-letter handling, cancellation/hold checks, and a real CLOS-link verification gate. Every CTA returns to the same secure `roomUrl`.

## Local preview

The photographer shoot page is the local preview surface. It derives the same milestone schedule from the shoot date/time and timezone, labels every item `scheduled`, and never sends a message. Use the real shoot route after creating a dated shoot to inspect the preview.

The production email outbox is the durable provider-neutral scheduling boundary. A future Manus scheduled job or secured n8n call may enqueue and process due jobs, but neither scheduler is activated by this workflow. The outbox stores no recipient, private room URL, token, rendered body, or provider payload; those values are resolved only at processing time.

The separate inactive workflow `workflows/mira-email-outbox-trigger.json` is a future five-minute trigger for `POST /api/internal/mira/email-outbox/process`. It reads `MIRA_PUBLIC_APP_BASE_URL` and `MIRA_EMAIL_WORKER_SECRET` from n8n environment/credential configuration and contains no literal secret. Use either the Manus scheduler or this secured n8n trigger in production, never both. The endpoint uses a fixed batch limit, leases jobs before processing, and returns aggregate counts only.
