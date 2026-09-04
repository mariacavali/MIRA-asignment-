# Round 1 Submission Checklist

Status legend: **Complete** = the deliverable exists and is finished as scoped. **Partial** = the deliverable exists but depends on something not yet available (real data, real infrastructure, external feedback). **Pending** = the deliverable does not exist yet.

| # | Requirement | Document(s) | Status | Why |
|---|---|---|---|---|
| 1 | Sector research (CLOS/SHUTTER, CRMs, static checklists, MIRA's opportunity, "does not replace photographer") | `research/sector_research.md` | **Complete** | Written and grounded in existing repo evidence; all required points addressed. |
| 1a | Use cases (solo, small studio, larger business) | `research/use_cases.md` | **Complete** | Three use cases written, grounded in implemented code paths. |
| 1b | Opportunities & risks, analyst scores labeled as analysis | `research/opportunities_risks.md` | **Complete** | Written; all scoring explicitly labeled author analysis, not market data. |
| 1c | Willingness-to-pay validation | *(not a document — a real-world activity)* | **Pending** | Explicitly flagged as unvalidated throughout; requires direct outreach to real photographers, not something this submission can produce. |
| 2 | Dashboard metrics specification (5–7 metrics) | `dashboard/dashboard_documentation.md` | **Complete** | Seven metrics fully specified with source tables and calculation logic. |
| 2a | Dashboard artifact (UI/build) | *(does not exist)* | **Pending** | No dashboard UI has been built. Explicitly marked pending in the specification itself. |
| 2b | Live data to populate the dashboard | *(does not exist)* | **Pending** | No production deployment or live usage exists. |
| 3 | Automation POC documentation (Stripe → activation → shoot → invitation → Resend → Shoot Room → preparation → readiness) | `automation/automation_poc.md` | **Complete** (as documentation) | Full chain documented stage-by-stage with evidence citations. |
| 3a | Stripe stage | — | **Complete** | Live-verified (`docs/stripe-integration.md`). |
| 3b | Photographer activation stage | — | **Complete** | Live-verified, same webhook event as 3a. |
| 3c | Shoot creation / invitation scheduling stages | — | **Partial** | Code-verified and tested; not independently re-verified live in this submission. |
| 3d | Resend delivery stage | — | **Partial** | Code-verified (56 focused tests passing); no real email sent — pending `RESEND_API_KEY` and Maria's approval. |
| 3e | Private Shoot Room stage | — | **Partial** | Implemented and tested; not exercised against a real deployed database in this submission. |
| 3f | Preparation stage (visuals) | — | **Partial / under development** | Implemented, unit-tested with demo fallback; requires a real database and real API key for a non-demo run. |
| 3g | Preparation stage (voice) | — | **Pending** | Implemented in code (`server/miraCore/realtime.ts`); no live voice-conversation evidence exists in this project. |
| 3h | Readiness stage | — | **Partial** | Implemented and gated correctly in code; not exercised live. |
| 4 | LangSmith monitoring — existing Ironhack evidence documented | `monitoring/langsmith_monitoring.md` | **Complete** | Dataset, experiment, and result values recorded as given, with clear external-evidence labeling. |
| 4a | MIRA-specific LangSmith trace | — | **Pending** | Not implemented; no LangSmith code exists anywhere in this repository. Plan documented, not built. |
| 5 | Cost & timeline template | `planning/cost_timeline.md` | **Complete** (as a template) | All required cost categories present with explicit placeholders. |
| 5a | Real cost figures | — | **Pending** | No pricing has been approved for any line item. |
| 6 | Round 1 decision (KEEP recommendation) | `feedback/round1_decision.md` | **Complete** | Recommendation stated with explicit basis and explicit non-claims. |
| 6a | Teaching staff feedback | — | **Pending** | Placeholder only; no feedback received yet. |
| 6b | Class/peer feedback | — | **Pending** | Placeholder only; no feedback received yet. |
| 7 | Submission checklist | `ROUND1_SUBMISSION_CHECKLIST.md` (this file) | **Complete** | — |
| 8 | Presentation outline | `presentation/README.md` | **Complete** (as an outline) | Content outline written, sourced from other documents. |
| 8a | Presentation artifact (slides/recording) | — | **Pending** | Not started. |
| 9 | Root README updated with Capstone Round 1 section | `../README.md` | **Complete** | Section added; existing setup/application instructions preserved unchanged. |

## Summary

- **Fully complete as documentation:** sector research, use cases, opportunities/risks, dashboard specification, automation POC documentation, LangSmith evidence documentation, cost/timeline template, Round 1 decision, this checklist, presentation outline, README update.
- **Explicitly and correctly marked pending:** willingness-to-pay validation, dashboard artifact + live data, MIRA-specific LangSmith trace, teaching staff/class feedback, presentation artifact, real cost figures, live voice verification, live Resend delivery.
- **Partial (implemented in code, not yet live-exercised):** shoot creation, invitation scheduling, private Shoot Room, visual preparation pipeline, readiness gating.

No item in this checklist is marked complete unless a real document or a real, previously-verified piece of evidence exists to support that status.
