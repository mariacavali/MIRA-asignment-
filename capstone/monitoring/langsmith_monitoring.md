# LangSmith Monitoring — Ironhack Evidence & MIRA-Specific Plan

## Status

| Item | Status |
|---|---|
| Ironhack LangSmith evaluation evidence (below) | **Confirmed accurate by Maria (product owner), external to this repository.** This evidence comes from a separate, completed Ironhack lab — not yet from MIRA. The figures below were not independently re-run from inside this repository; they are recorded as confirmed by the product owner. **No shareable LangSmith URL was available to include in this repository** — the dataset name and experiment name below are the citable reference; per the brief's own fallback ("screenshots + export if link sharing is blocked"), no screenshot is included either, since none was captured. |
| MIRA-specific trace (Creative DNA / visual pipeline) | **Built, not yet run for real.** A complete, runnable sample now exists at `capstone/langsmith/` (dataset: 3 synthetic cases; `langsmith` added to `package.json`) — see §2 below. It has not produced a real trace yet because `OPENAI_API_KEY`/LangSmith credentials were not available when last executed; `capstone/langsmith/results.json` records this honestly as `"not_run"`, not as a fabricated result. |

## 1. Existing Ironhack LangSmith evidence

The following evaluation run is reported as existing on the LangSmith platform, produced as part of Ironhack coursework, separate from and prior to this MIRA codebase:

| Field | Value |
|---|---|
| Dataset | `ironhack-support-ticket-priority-v1` |
| Dataset size | 12 examples |
| Experiment | `ticket-priority-baseline-32443137` |
| Exact-match result | 12/12 |
| Test suite result | 10 tests passed |

This evidence demonstrates a working LangSmith evaluation methodology (a versioned dataset, a named baseline experiment, and an exact-match scoring result) applied to a **support-ticket-priority classification task** — a different task and a different codebase from MIRA's own creative-preparation pipeline. It is included here as evidence of monitoring/evaluation capability and prior experience, not as a claim that MIRA itself is currently instrumented with LangSmith.

**What this evidence does not establish:** it says nothing about MIRA's own model calls (Creative DNA synthesis, image generation, or realtime conversation), which run on separate providers (OpenAI direct and Forge — see `docs/MIRA_AI_AND_DATA_INVENTORY.md`) and have no tracing, dataset, or evaluation harness of their own today.

## 2. MIRA-specific trace — built, not yet run for real

**What exists today:** a complete, runnable LangSmith monitoring sample at `capstone/langsmith/mira_monitoring_sample.ts`, tracing MIRA's real Creative DNA transformation (`synthesizeMiraV4CreativeDna`, `server/miraV4/creativeDna.ts` — reused unchanged, not reimplemented) against exactly 3 synthetic cases (`capstone/langsmith/synthetic_cases.json`: a founder personal-brand shoot, a remote editorial portrait, a product/creative-business campaign). Per case it monitors success/failure, use of the photographer brief, use of client preferences/constraints, Creative DNA completeness, a heuristic scan for unsupported/invented personal details, response latency, token usage, and estimated cost (only when an operator-configured rate exists). Full detail: `capstone/langsmith/README.md`.

This closes what the plan below originally called for: the `langsmith` SDK is now a `package.json` devDependency, and `LANGCHAIN_TRACING_V2`/`LANGSMITH_API_KEY`/`LANGSMITH_PROJECT`-shaped configuration is read (names only, no values) exactly as originally planned.

**What has not happened yet:** a real, executed run. `capstone/langsmith/results.json` — produced by actually running the sample, not hand-written — currently records an honest `"not_run"` status naming the exact missing environment variables (`OPENAI_API_KEY`; `LANGCHAIN_API_KEY` or `LANGSMITH_API_KEY`; `LANGCHAIN_TRACING_V2`/`LANGSMITH_TRACING_V2` set to `"true"`), with every metric left `null` rather than invented. This is also why this section documents 3 synthetic cases rather than the shoot-pipeline handler boundary (`confirmRealtimeSummary`) originally scoped below — the sample traces the Creative DNA synthesis call directly, which is the actual model-call boundary worth monitoring, and does not require a real database to exercise (unlike the full `confirmRealtimeSummary` handler).

**Immediate next step:** configure real `OPENAI_API_KEY` and LangSmith credentials (never committed, never printed) and run `npx tsx capstone/langsmith/mira_monitoring_sample.ts`. This produces the project's first real trace, latency, token, and (if a cost rate is configured) cost figures — see `capstone/round2/evaluation-and-monitoring.md` for how this fits the broader Round 2 picture.
