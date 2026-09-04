# MIRA Ironhack Capstone — Round 2 Consulting Package

This is the Round 2 package built **around** the existing MIRA MVP. It does not rebuild or redesign the application — every technical claim below is either evidence already recorded in this repository or a clearly labeled, non-invented gap. Round 1's documents (`capstone/research/`, `capstone/dashboard/`, `capstone/automation/`, `capstone/monitoring/`, `capstone/planning/`, `capstone/feedback/`, `capstone/presentation/`, `capstone/evidence/`, `capstone/langsmith/`) remain the source evidence this package builds on and points back to — nothing here duplicates or contradicts them without saying so explicitly.

## Status discipline (applies to every document in this folder)

Every claim in this package is one of exactly four statuses, used consistently:

- **Live-verified** — observed running, end to end, on a real hosted deployment.
- **Previously verified** — live-verified in an earlier, separately recorded pass; not re-run in this round.
- **Implemented but currently blocked / pending** — the code path exists, but either it did not complete successfully (blocked) or has never been exercised live (pending).
- **Designed** — specified/planned but not built (e.g. the dashboard artifact, most of this round's compliance and deployment planning documents themselves).

## Contents

| Document | What it covers |
|---|---|
| [`use-case-definition.md`](use-case-definition.md) | Sector, company, problem, stakeholders, in/out of scope, measurable success criteria |
| [`poc-documentation.md`](poc-documentation.md) | The **early** n8n prototype (client input → OpenAI → JS parsing → Google Sheets → Google Docs) — explicitly not the current MVP, and explicitly not an image/moodboard generator |
| [`mvp-verification.md`](mvp-verification.md) | The current, authoritative status of the working MVP flow: Stripe → dashboard → shoot setup → Resend invitation → private Shoot Room → preparation → Creative DNA → five-scene demo moodboard → Ready to Shoot |
| [`roi-and-risk-assessment.md`](roi-and-risk-assessment.md) | Cost structure and risk register — no invented ROI number, because the inputs to compute one don't exist yet |
| [`eu-ai-act-assessment.md`](eu-ai-act-assessment.md) | Preliminary, non-legal risk classification under the EU AI Act (limited-risk / transparency obligations) and current compliance status |
| [`gdpr-dpia.md`](gdpr-dpia.md) | Preliminary, non-legal Data Protection Impact Assessment — what personal data is processed, legal basis, retention (real but partial), data-subject rights, processors, risks |
| [`strategic-deployment-plan.md`](strategic-deployment-plan.md) | A four-phase, evidence-gated deployment plan — no phase opens until the previous phase's exit criterion is real |
| [`evaluation-and-monitoring.md`](evaluation-and-monitoring.md) | Consolidates the Ironhack LangSmith course evidence, the new MIRA-specific LangSmith monitoring sample (built this round, not yet run for real), and the still-unbuilt dashboard specification |
| [`cost-and-timeline.md`](cost-and-timeline.md) | What changed in the cost picture since Round 1, the one concrete near-term blocker, and a phase-gated (not date-gated) timeline |
| [`final-presentation-outline.md`](final-presentation-outline.md) | A content outline for presenting this package honestly — no new deck was built |
| [`evidence/`](evidence/) | An index to the canonical evidence files this package cites, rather than duplicated copies of them |

## Required exact filenames (official Ironhack Round 2 submission page)

The official submission page discovers documents by exact filename. Each row below is a short index file that points to the full canonical content above (no content is duplicated or rewritten) — except `presentation.pdf`, which is a byte-identical copy of the Round 1 deck.

| Required filename | Points to |
|---|---|
| [`use_case_definition.md`](use_case_definition.md) | [`use-case-definition.md`](use-case-definition.md) |
| [`poc_documentation.md`](poc_documentation.md) | [`poc-documentation.md`](poc-documentation.md) + n8n workflow exports (`../automation/n8n_automation_poc.md`, `../../workflows/mira-client-email-sequence.json`, `../../workflows/mira-email-outbox-trigger.json`) |
| [`roi_risk_assessment.md`](roi_risk_assessment.md) | [`roi-and-risk-assessment.md`](roi-and-risk-assessment.md) |
| [`eu_ai_act_compliance.md`](eu_ai_act_compliance.md) | [`eu-ai-act-assessment.md`](eu-ai-act-assessment.md) |
| [`gdpr_documentation.md`](gdpr_documentation.md) | [`gdpr-dpia.md`](gdpr-dpia.md) |
| [`strategic_plan.md`](strategic_plan.md) | [`strategic-deployment-plan.md`](strategic-deployment-plan.md) |
| [`presentation.pdf`](presentation.pdf) | Byte-identical copy of [`../presentation/MIRA_Ironhack_Presentation_Final.pdf`](../presentation/MIRA_Ironhack_Presentation_Final.pdf) (Round 1 deck; sha1 `e862bd3fdcb955862c485297b1cce57fc5f60c91`) |
| [`mvp_documentation.md`](mvp_documentation.md) | [`mvp-verification.md`](mvp-verification.md) |

Demo video (required evidence, not a discoverable-name document): [`evidence/MIRA_Ironhack_Demo_Final.mp4`](evidence/MIRA_Ironhack_Demo_Final.mp4) — see `evidence/README.md` for exactly what it is and is not evidence of.

**Limitations that apply across this entire package, restated here for visibility:**

- Real LangSmith traces: **pending** — the MIRA-specific monitoring sample is built and ready but has not been run against real credentials.
- The demo video is a presentation recording — **not verified live n8n execution**, and not confirmed as a live-app screen-recording.
- Voice conversation and real (non-demo) AI image generation: **pending** — never exercised live in this project.
- Teaching staff / class feedback: **pending** — not yet received.

## Round 1 materials

Round 1's full document set remains present in this repository and is linked throughout this package rather than copied: `capstone/research/`, `capstone/dashboard/`, `capstone/automation/`, `capstone/monitoring/`, `capstone/planning/`, `capstone/feedback/`, `capstone/presentation/` (source of `presentation.pdf` above), `capstone/evidence/`, `capstone/langsmith/`. See `docs/ROUND1_VERIFICATION.md` for the Round 1 live-verification checkpoint and `capstone/ROUND1_SUBMISSION_CHECKLIST.md` for the Round 1 submission checklist.

## The single most important fact in this package

The working MVP flow is now **live-verified end to end in demo mode** — five demo references in, Creative DNA and a five-scene demo moodboard out, Ready to Shoot reached — on an isolated preview (`docs/ROUND1_VERIFICATION.md`, commit `6cf6b97c6dee65adc048d306b1131e691250f10a`). This is real progress from Round 1's "code-verified only" visual-pipeline status. **It does not mean real generation quality, real cost, or a real pilot exist** — those remain the explicit, named gaps this package is honest about, and `strategic-deployment-plan.md` sequences closing them.

## What this package explicitly does not claim

- No ROI figure, real usage volume, or validated price point exists anywhere in this package.
- No customer adoption, retention, or real pilot data exists.
- Neither the EU AI Act assessment nor the GDPR DPIA is a legal opinion or a certified compliance determination — both are preliminary self-assessments intended to prepare for, not replace, professional legal review.
- Real (non-demo) image generation was not invoked to produce this package, and no real client data, real invitation link, or real personal data appears anywhere in it.
