# LangSmith Monitoring — Ironhack Evidence & MIRA-Specific Plan

## Status

| Item | Status |
|---|---|
| Ironhack LangSmith evaluation evidence (below) | **Confirmed accurate by Maria (product owner), external to this repository.** This evidence comes from a separate, completed Ironhack lab — not yet from MIRA. No LangSmith/LangChain code, config, trace export, or screenshot exists anywhere in this codebase (verified by a full-repository search during this project's own architecture audit; zero matches for "langsmith" or "langchain"). The figures below were not independently re-run from inside this repository; they are recorded as confirmed by the product owner. |
| MIRA-specific trace (Creative DNA / visual pipeline) | **Planned, not implemented, not verified.** No tracing library, MIRA-specific dataset, or experiment exists in this codebase today. |

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

## 2. Planned MIRA-specific trace (not yet implemented)

**Target:** one MIRA-specific LangSmith trace wrapping the shoot's visual/Creative DNA pipeline — specifically the boundary in `server/miraCore/router.ts`'s `confirmRealtimeSummary` handler, which already sequentially owns:

1. Creative DNA generation (`generateShootCreativeDnaForConfirmedMemory`, `server/miraCore/creativeDnaAdapter.ts`)
2. Moodboard generation (`generateShootMoodboardForCreativeDna`, `server/miraCore/moodboardAdapter.ts`)
3. Room-activation gating (`activatePreparationRoom`)

This single handler is the natural trace boundary because it already treats these three steps as one unit of work (single try/catch, single log point) — this was identified directly from the implemented code during this project's own architecture review, not assumed.

**Why this is not yet done:**
- No LangSmith SDK dependency exists in `package.json`.
- No `LANGCHAIN_*`/`LANGSMITH_*` environment variables are declared anywhere in this repository (`.env.example`, `docs/ENVIRONMENT_VARIABLES.md`).
- The pipeline it would wrap (Creative DNA + moodboard generation) itself has not yet been exercised against a real database or a real OpenAI key in this project — see `capstone/automation/automation_poc.md`, Stage 7. Instrumenting a pipeline that has not yet run end-to-end with real data would produce trace data with no real generation runs to show.

**What adding it would require (not yet approved or scoped):**
1. Add a LangSmith SDK dependency and the associated `LANGCHAIN_TRACING_V2`/`LANGSMITH_API_KEY`/`LANGSMITH_PROJECT` environment variables (names only, no values, following this project's existing `.env.example` convention).
2. Wrap the `confirmRealtimeSummary` handler's Creative DNA + moodboard sequence in a single named trace/run.
3. Define a MIRA-specific evaluation dataset (analogous in structure to `ironhack-support-ticket-priority-v1`, but built from real or realistic shoot-preparation inputs) once real Creative DNA outputs exist to evaluate against.
4. Run and record a first MIRA-specific experiment, following the same dataset → experiment → exact-match/test-suite pattern already demonstrated in the Ironhack evidence above.

None of the four steps above has been started in this codebase. This section is a plan, not a status report of work in progress.
