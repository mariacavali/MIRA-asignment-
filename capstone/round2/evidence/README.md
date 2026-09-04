# Round 2 Evidence — Index

**Status:** This folder deliberately does not duplicate evidence files that already exist elsewhere in this repository — copying them here would create a second, driftable copy of the same fact. Instead, this is an index pointing to the single source of truth for each piece of evidence referenced across `capstone/round2/`.

| Evidence | Canonical location |
|---|---|
| Latest live-verification checkpoint (isolated-preview deployment, live Shoot Room, five demo references, Creative DNA/preparation, five demo moodboard scenes, Ready to Shoot, Calendar blocker, voice pending) | `docs/ROUND1_VERIFICATION.md` |
| Per-stage git branch/commit references and test counts (Stripe, Resend, visual pipeline, combined checkpoint) | `capstone/evidence/staged_validation_evidence.md` |
| Stripe integration verification detail | `docs/stripe-integration.md` |
| MIRA-specific LangSmith monitoring sample, dataset, and actual run output | `capstone/langsmith/mira_monitoring_sample.ts`, `capstone/langsmith/synthetic_cases.json`, `capstone/langsmith/results.json`, `capstone/langsmith/README.md` |
| Existing Ironhack LangSmith course evidence (separate from MIRA) | `capstone/monitoring/langsmith_monitoring.md` |
| Round 1 submission checklist | `capstone/ROUND1_SUBMISSION_CHECKLIST.md` |
| Round 1 presentation deck, its newer PDF export, and both decks' own known-discrepancy notes | `capstone/presentation/` |
| Video file supplied by the user | [`MIRA_Ironhack_Demo_Final.mp4`](MIRA_Ironhack_Demo_Final.mp4) (this folder) — see "What this video is" below |

No new screenshot was captured for this Round 2 package — no new live run was performed beyond what is already recorded in the files above. If a new screenshot or run is captured later, add it here with the same token-safety discipline already applied throughout this repository (no browser address bar, no invitation token, no client email address, no credentials, no private identifiers, no storage keys or signed URLs).

## What this video is — and, importantly, what it is not evidence of

[`MIRA_Ironhack_Demo_Final.mp4`](MIRA_Ironhack_Demo_Final.mp4) was supplied by the user (copied from their local Downloads folder; checksum-verified identical to the source). **Its content has not been reviewed frame-by-frame in this session** — this environment can scan the file's embedded text/metadata (done: no secrets, tokens, private URLs, or personal data found) but cannot watch or transcribe video. Its filename, before renaming, matched a presentation PDF exactly (`MIRA_Ironhack_Presentation_Workflow_Calendar_Evidence.pdf.mp4`), which suggests it may be a Canva slide-deck video export rather than a screen-recording of the live application — **this has not been confirmed either way**.

**This file must not be treated as proof of any feature marked pending or blocked elsewhere in this repository.** In particular, it is not evidence that voice conversation works, that real (non-demo) image generation has been exercised, or that Google Calendar integration exists — none of those claims can be verified from an unreviewed video file, and each remains exactly as documented elsewhere (`capstone/round2/mvp-verification.md`, `docs/ROUND1_VERIFICATION.md`): voice pending, real generation unverified, no Google Calendar feature in this codebase. The **required** 2–5 minute screen-recording of the live app (signup → shoot → invitation → Shoot Room → preparation) remains a separate, still-missing item unless this file is confirmed by the user to actually be that recording.

## Other user-owned items not yet in this repository

| Item | Status |
|---|---|
| Confirmation of what `MIRA_Ironhack_Demo_Final.mp4` actually shows | **Pending user confirmation** — see above. |
| A photographer questionnaire run via n8n | **Unconfirmed.** Not documented anywhere in this repository; no artifact (workflow export, responses) has been supplied. Every existing document in this repository states willingness-to-pay/photographer feedback as unvalidated — this should only be added if real artifacts exist to document, not asserted from a slide claim alone. |
