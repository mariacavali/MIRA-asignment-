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

## The single most important fact in this package

The working MVP flow is now **live-verified end to end in demo mode** — five demo references in, Creative DNA and a five-scene demo moodboard out, Ready to Shoot reached — on an isolated preview (`docs/ROUND1_VERIFICATION.md`, commit `6cf6b97c6dee65adc048d306b1131e691250f10a`). This is real progress from Round 1's "code-verified only" visual-pipeline status. **It does not mean real generation quality, real cost, or a real pilot exist** — those remain the explicit, named gaps this package is honest about, and `strategic-deployment-plan.md` sequences closing them.

## What this package explicitly does not claim

- No ROI figure, real usage volume, or validated price point exists anywhere in this package.
- No customer adoption, retention, or real pilot data exists.
- Neither the EU AI Act assessment nor the GDPR DPIA is a legal opinion or a certified compliance determination — both are preliminary self-assessments intended to prepare for, not replace, professional legal review.
- Real (non-demo) image generation was not invoked to produce this package, and no real client data, real invitation link, or real personal data appears anywhere in it.
