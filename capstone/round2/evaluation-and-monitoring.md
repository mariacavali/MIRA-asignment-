# Evaluation & Monitoring — Round 2

**Status:** Consolidates three separate, previously scattered pieces of evidence into one current picture: the existing Ironhack course LangSmith experiment, the new MIRA-specific LangSmith monitoring sample, and the dashboard metrics specification. Each retains its own honest status — nothing here upgrades a status beyond what its own source document supports.

## 1. Existing Ironhack LangSmith evidence (course evidence, not MIRA)

| Field | Value |
|---|---|
| Dataset | `ironhack-support-ticket-priority-v1` |
| Dataset size | 12 examples |
| Experiment | `ticket-priority-baseline-32443137` |
| Result | 12/12 exact match, 10 tests passed |

This is a separate, completed Ironhack lab on a support-ticket-priority classification task — a different task and codebase from MIRA. It demonstrates a working evaluation methodology (dataset → experiment → scored result), not anything about MIRA's own model calls. Full detail: `capstone/monitoring/langsmith_monitoring.md`.

## 2. MIRA-specific LangSmith monitoring sample (built this round)

A minimum, runnable LangSmith monitoring sample now exists at `capstone/langsmith/`, tracing MIRA's real Creative DNA transformation (`synthesizeMiraV4CreativeDna`, `server/miraV4/creativeDna.ts`) — the same function the product itself calls, reused unchanged.

**What it monitors, per case:** success/failure, use of the photographer brief, use of client preferences/constraints, Creative DNA completeness, a heuristic scan for unsupported/invented personal details, response latency, token usage, and estimated cost (only when an operator-configured rate exists — no price is hardcoded). Full spec: `capstone/langsmith/README.md`.

**Dataset:** exactly 3 synthetic cases (`capstone/langsmith/synthetic_cases.json`) — founder personal-brand shoot, remote editorial portrait, product/creative-business campaign. No real client data anywhere in the dataset.

**Current run status: not yet run.** As of this document, `capstone/langsmith/results.json` reflects a real execution of the sample with `OPENAI_API_KEY` and LangSmith credentials unavailable in this environment — an honest `"not_run"` status naming the exact missing environment variables, with every metric left `null` rather than invented (per this project's explicit no-invented-results instruction). Configuring real credentials and re-running `npx tsx capstone/langsmith/mira_monitoring_sample.ts` is the direct, scoped next step — see Phase 1 of `capstone/round2/strategic-deployment-plan.md`.

**Why this matters:** this sample is the concrete mechanism that turns `capstone/round2/roi-and-risk-assessment.md`'s biggest remaining gap ("no real per-shoot text-generation cost or quality figure exists") into a measurable answer, without needing a production deployment first — it can be run against synthetic cases in any environment with credentials.

## 3. Dashboard metrics specification (still a spec, not a built dashboard)

Seven stakeholder metrics are fully specified with source tables and calculation logic in `capstone/dashboard/dashboard_documentation.md`: shoots created, invitations sent, invitation delivery rate, preparation completion rate, readiness rate, average preparation time, payment-to-active-account success rate. **No dashboard artifact exists, and no live data exists to populate it** — this is unchanged from Round 1 and remains explicitly pending. See `capstone/round2/use-case-definition.md`'s "Measurable success criteria" for how these map to this round's success definition.

## 4. What "evaluation and monitoring" honestly covers today, and what it doesn't

| Layer | Covered? |
|---|---|
| Text generation (Creative DNA) — traceable, scoreable once credentials exist | **Yes** — `capstone/langsmith/` |
| Image generation (moodboard) — traced or scored | **No.** The LangSmith sample is explicitly scoped to the text transformation only, per this round's instruction not to invoke paid image generation. Image quality/cost remains fully unmeasured. |
| Voice conversation — traced or scored | **No.** No tracing exists for `server/miraCore/realtime.ts`; voice remains pending per `capstone/round2/mvp-verification.md`. |
| Product usage (the dashboard metrics) | **Specified, not built, no data.** |
| A production error/uptime monitoring tool | **Not selected** (`capstone/planning/cost_timeline.md` §8). |

## 5. Immediate next step

Run the existing, already-built `capstone/langsmith/mira_monitoring_sample.ts` against real `OPENAI_API_KEY` and LangSmith credentials once they are securely available (never committed, never printed — `.env`, git-ignored). This is the single highest-leverage next action across this entire evaluation/monitoring picture: it produces the first real numbers for the biggest open question in `capstone/round2/roi-and-risk-assessment.md`, using code and a dataset that already exist.
