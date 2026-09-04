# Cost & Timeline — Round 2

**Status:** Extends `capstone/planning/cost_timeline.md` (the detailed, line-item template — still the canonical source for every cost category) with what has changed since Round 1 and a phase-gated timeline replacing fixed dates, consistent with `capstone/round2/strategic-deployment-plan.md`. **No real price, real date, or real usage volume is invented here.**

## What changed since Round 1's cost template

| Line item | Round 1 status | Round 2 status |
|---|---|---|
| Hosting/storage | `[TBD]` provider, no isolated-preview fallback | Provider still `[TBD]`, but an explicit, documented, off-by-default production fallback now exists (`MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION`) so an isolated preview can serve assets without a full Forge/S3 decision — this reduces near-term hosting risk, not cost. |
| Monitoring (LangSmith) | Not scoped, no dependency in `package.json` | `langsmith` is now an installed devDependency and a runnable MIRA-specific sample exists (`capstone/langsmith/`) — the engineering cost of building this is now sunk; only the plan-tier cost (`[TBD]/month`) and real trace volume remain open. |
| Model (text) real cost | No real call ever run to measure from | Still no real call has been run to measure from — see "Immediate blocker" below. The measurement mechanism now exists and is ready to run. |
| Image generation real cost | No real call ever run to measure from | Unchanged — out of scope for this round by explicit instruction (no paid image generation invoked). |

Every other line item in `capstone/planning/cost_timeline.md` (development effort, database, Stripe fees, Resend plan, maintenance) is unchanged and still `[TBD]`.

## Immediate blocker on real cost data

The MIRA-specific LangSmith monitoring sample (`capstone/langsmith/`) is built and ready, but has not produced a real run: `OPENAI_API_KEY` and LangSmith credentials were not available in this environment as of this document. Until it is run for real, the "cost per Creative DNA synthesis call" line in `capstone/planning/cost_timeline.md` §6 remains `[TBD]` — not because the work to measure it hasn't been done, but because the credentials to execute it were not yet in place at the time of this checkpoint. This is the single fastest-to-close `[TBD]` in the entire cost template.

## Phase-gated timeline (replaces fixed dates)

No calendar date is given anywhere in this document, for the same reason `capstone/planning/cost_timeline.md` gives none: no start date, team availability, or external account approval (Stripe live pricing, Resend sending-domain, hosting provider) has been confirmed. Instead, each phase from `capstone/round2/strategic-deployment-plan.md` is restated here against what it costs to *start*, not when it starts:

| Phase | Cost to start | Blocked on |
|---|---|---|
| Phase 1 — close concrete gaps (Calendar bug, retention extension, AI-content labeling, run the LangSmith sample) | Engineering time only; the LangSmith sample step also requires real API credentials (no additional engineering cost, since the code already exists) | Nothing external except credentials for the LangSmith step |
| Phase 2 — first real generation run | Real OpenAI text + image API usage against synthetic data only — the first real, measurable spend this project will incur | `OPENAI_API_KEY`, a controlled non-production environment |
| Phase 3 — controlled pilot | Real Resend sending-domain cost, real Stripe transaction fees, real hosting/database decision, photographer recruitment (non-monetary cost: time) | All of Phase 1 and 2's exit criteria met |
| Phase 4 — scale decision | Not estimated — depends entirely on Phase 3's real data | Phase 3 complete |

## What this document deliberately does not do

It does not assign a duration (days/weeks) to any phase — no team size or availability has been confirmed, and inventing one would misrepresent this as a committed schedule rather than a dependency-ordered plan. It does not restate the full line-item cost template — see `capstone/planning/cost_timeline.md` for that; this document only tracks what has changed and what is immediately actionable.
