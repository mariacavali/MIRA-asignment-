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
| Round 1 presentation deck and its own known-discrepancy notes | `capstone/presentation/` |

No new screenshot was captured for this Round 2 package — no new live run was performed beyond what is already recorded in the files above. If a new screenshot or run is captured later, add it here with the same token-safety discipline already applied throughout this repository (no browser address bar, no invitation token, no client email address, no credentials, no private identifiers, no storage keys or signed URLs).

## User-owned items not yet in this repository

These exist locally on the user's machine but are not committed here — either because they are large binaries (this project's convention is to reference, not duplicate, large files) or because they have known accuracy issues still pending correction:

| Item | Status |
|---|---|
| 2–5 minute screen-recording of the live MIRA app (signup → shoot → invitation → Shoot Room → preparation) | **Missing.** Not producible in this coding environment (no screen-recording capability). See `capstone/automation/n8n_automation_poc.md`, "Honest gap: no video recording." |
| A ~69MB local file, `MIRA_Ironhack_Presentation_Workflow_Calendar_Evidence.pdf.mp4` | **Exists locally, not verified as the item above.** Its filename matches a presentation PDF exactly, suggesting a Canva slide-deck video export rather than an app screen-recording — unconfirmed either way. |
| An updated Canva presentation draft (multiple slide versions reviewed during this project) | **Exists locally, not submission-ready.** Contains at least one serious unresolved accuracy issue — a slide showing polished editorial photography captioned as MIRA's own generated output, when MIRA's actual verified output is a demo-local placeholder image — plus a repeated, unverified "Google Calendar VERIFIED" claim with no corresponding feature anywhere in this codebase. Deliberately not committed to this repository until corrected, so no inaccurate presentation ships as part of the submission. |
| Final Canva export (PDF/PPTX) once the above is corrected | **Pending user action.** Export from Canva (File → Download) once accuracy issues are resolved, then add here. |
| A photographer questionnaire run via n8n | **Unconfirmed.** Not documented anywhere in this repository; no artifact (workflow export, responses) has been supplied. Every existing document in this repository states willingness-to-pay/photographer feedback as unvalidated — this should only be added if real artifacts exist to document, not asserted from a slide claim alone. |
