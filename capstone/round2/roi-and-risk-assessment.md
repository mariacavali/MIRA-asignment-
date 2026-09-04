# ROI & Risk Assessment — Round 2

**Status:** Author analysis only, extending `capstone/research/opportunities_risks.md` and `capstone/planning/cost_timeline.md`. Every judgment below is qualitative reasoning about the implemented codebase, not a market statistic, financial model, or third-party analyst report. **No quantitative ROI figure is given anywhere in this document** — computing one requires a validated price point and real usage volume, neither of which exists (see "Why no ROI number is given" below).

## Why no ROI number is given

ROI requires, at minimum: a validated price a photographer will actually pay, an estimated conversion rate from trial to paying, and a real per-shoot cost (model tokens, image generation, email, hosting). None of these exist:

- **Price:** only one €0.00 100%-discount Stripe test transaction exists (`docs/stripe-integration.md`). No real price point has been validated with a real photographer.
- **Per-shoot model cost:** no real (non-demo) Creative DNA synthesis or moodboard image generation call has ever been run in this project, so no real token/image cost figure exists to build a per-shoot cost from (`capstone/planning/cost_timeline.md` §6–7; `capstone/langsmith/results.json` — the MIRA-specific monitoring sample built for exactly this purpose has not yet produced a real run either, see `capstone/round2/evaluation-and-monitoring.md`).
- **Volume/conversion:** no production deployment or live user base exists.

Any ROI number produced without these inputs would be invented. This document instead states the cost *structure* (what needs pricing, and from where) and a qualitative risk assessment, consistent with the "no invented numbers" instruction governing this entire submission.

## Cost structure (from `capstone/planning/cost_timeline.md`, restated for decision-making)

| Cost category | What's confirmed | What's still `[TBD]` |
|---|---|---|
| Development | Remaining build effort to close the pending items below | Effort estimate, rate basis |
| Hosting | S3-backed storage already implemented (`server/storage.ts`); an isolated-preview local-storage fallback now exists as a documented, explicit opt-in (`MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION`, `docs/MANUS_ENVIRONMENT_CONTRACT.md`) — **not** a substitute for a real production hosting/storage decision | Provider, monthly cost, storage volume pricing |
| Database | MySQL/TiDB via Drizzle, engine confirmed | Volume, backup/retention cost |
| Stripe | One-time purchase, current implementation confirmed | Real price point, negotiated processing rate |
| Resend | Adaptive 1–4 emails/shoot schedule confirmed in code | Plan tier, real send volume |
| Model (text) | `gpt-5-mini`, 1 Creative DNA call per confirmed shoot, confirmed in code | Real per-call cost (no real call has been run to measure from) |
| Image generation | `gpt-image-2`, 5 images per shoot, confirmed in code; demo fallback is €0 | Real per-image cost (no real call has been run to measure from) |
| Monitoring | LangSmith SDK now added as a dependency and a runnable MIRA-specific sample exists (`capstone/langsmith/`) | Plan tier cost; real trace volume once run |

## Risk register

Extends `capstone/research/opportunities_risks.md` with what has changed since Round 1 and what is new for Round 2.

| Risk | Status since Round 1 | Priority to resolve |
|---|---|---|
| Willingness to pay is unvalidated | **Unchanged.** Still the single largest open risk. | **Highest** |
| Real email delivery works in practice | **Improved.** Now previously live-verified (real invitation delivered, delivery webhook confirmed) — see `mvp-verification.md`. Residual risk is volume/reputation at scale, not basic delivery. | Medium (was High) |
| Visual pipeline produces demo/placeholder output without a paid key | **Unchanged, but now more precisely evidenced.** The live-verified checkpoint confirms the *pipeline* works end-to-end (five references in, five ordered moodboard scenes out, readiness gated correctly) — but real image *quality* remains completely unverified, because no real (non-demo) generation call has been run. | **High** — this is now the most concrete blocking gap between "pipeline works" and "product is demoable to a paying client" |
| Voice conversation quality is unverified | **Unchanged.** No live voice session evidenced. | Medium-High |
| Calendar confirmation is broken | **New finding this round.** A confirmation attempt returned an error and could not be saved (`docs/ROUND1_VERIFICATION.md`). This is a concrete, reproducible bug, not an unvalidated assumption — lower uncertainty, but a real blocker on the "shoot details confirmed" path. | High (concrete bug, not speculative risk) |
| No production deployment or real database exercised for the visual pipeline | **Unchanged in kind; narrowed in scope.** The isolated-preview storage fix (`MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION`) resolved the *asset-serving* failure, but this is explicitly documented as an isolated-preview fallback, not a production storage decision (`docs/MANUS_ENVIRONMENT_CONTRACT.md`). A real production storage/database decision remains open. | High |
| MIRA depends on a third-party remote-capture app it does not control | **Unchanged.** | Medium |
| Two parallel, disconnected legacy product surfaces (`/mira-v3`, `/mira-v4`) share the codebase | **Unchanged.** | Low-Medium (maintenance/clarity risk, not a Round 2 blocker) |

## Qualitative scoring (author's analysis only — not a statistical model)

| Item | Impact if true/realized | Confidence it is currently true | Priority to validate before broader rollout |
|---|---|---|---|
| Readiness verification is a real differentiator | High | High (structurally implemented and now live-verified end to end in demo mode) | Low — already demonstrable |
| Photographers will pay for this | High | **Unknown** — no data exists | **Highest** |
| Real email delivery works in practice | Medium | High (previously live-verified) | Low |
| Real moodboard image quality is good enough to show a paying client | High | **Unknown** — only demo/placeholder images exist anywhere in this project's evidence | **High** |
| Voice conversation works reliably end-to-end | High | **Unknown** — not evidenced live | Medium-High |
| Calendar confirmation works | Medium | **Known false** — reproducibly broken | High (concrete fix, not a validation question) |

## What this means for Round 2

The gap this round narrows is *pipeline correctness*: the full MVP flow, including moodboard generation and readiness gating, is now live-verified end-to-end in demo mode, and email delivery moved from code-verified to previously live-verified. The gap this round does **not** close — and which now stands out as the single most concrete blocker to a credible pilot — is *real generation quality and cost*: no real (non-demo) Creative DNA synthesis or image generation has ever been run and measured. A MIRA-specific LangSmith monitoring sample now exists specifically to close this gap once credentials are configured (`capstone/round2/evaluation-and-monitoring.md`); running it against real cases is the highest-value next step for turning this risk assessment into real numbers.
