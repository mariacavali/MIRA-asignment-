# ROI & Risk Assessment — Round 2

**Status:** Author analysis only, extending `capstone/research/opportunities_risks.md` and `capstone/planning/cost_timeline.md`. Every judgment below is qualitative reasoning about the implemented codebase, not a market statistic, financial model, or third-party analyst report. **No confirmed, real ROI figure exists anywhere in this document.** A fully worked 12/36-month projection is included below (see "Illustrative 12/36-month ROI") specifically because a real one requires a validated price point and real usage volume that don't exist yet — every input in that projection is explicitly labeled as an assumption, never as a confirmed number.

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

## Illustrative 12/36-month ROI (explicit assumptions — not a confirmed projection)

Consistent with "Why no ROI number is given" above, a real ROI figure cannot be produced without a validated price and real usage. This section instead gives one **fully worked, explicitly illustrative** projection — every input labeled — so the shape of the return (not its accuracy) is visible, mirroring the same illustrative-worked-example pattern already used in `capstone/planning/cost_timeline.md`.

| Assumption | Value | Basis |
|---|---|---|
| Illustrative price | €25/photographer/month | Illustrative — not validated; roughly between MIRA's current one-time-purchase implementation and a plausible subscription reframe |
| Illustrative adoption | 20 photographers by month 12; 80 by month 36 | Illustrative — no marketing/sales motion has been run to estimate real adoption |
| Illustrative monthly cost per photographer | ≈ €1.42 at 50-shoots/month pilot scale (from `capstone/planning/cost_timeline.md`'s illustrative worked example, ≈€71/month ÷ 50 shoots, assuming ~1 shoot/photographer/month at this stage) | Derived from the already-illustrative cost worked example, not a new invented figure |
| One-time build cost to close Round 2 Phase 1 gaps | `[TBD]` — no engineering-time estimate has been approved | Not assumed; left blank rather than invented |

| Horizon | Illustrative revenue | Illustrative variable cost | Illustrative gross margin | Note |
|---|---|---|---|---|
| 12 months | 20 × €25 × 12 ≈ **€6,000** | 20 × €1.42 × 12 ≈ **€341** | ≈ **€5,659** | Excludes the `[TBD]` one-time build cost above — this is *contribution margin*, not net ROI |
| 36 months | 80 × €25 × 12 ≈ **€24,000/yr** by year 3 | 80 × €1.42 × 12 ≈ **€1,363/yr** | ≈ **€22,637/yr** by year 3 | Assumes linear adoption growth to 80, which is itself an unvalidated assumption |

**This projection must not be quoted to a stakeholder as a real forecast.** It exists only to demonstrate the ROI calculation shape (price × adoption − variable cost) using the same honest-assumptions discipline as the rest of this document set. The single input that would most change this picture — a validated real price point — is also the single highest-priority open question in the risk register below.

## Risk register

Extends `capstone/research/opportunities_risks.md` with what has changed since Round 1 and what is new for Round 2. Every mitigation below is the author's own proposed next step, not a completed action.

| Risk | Status since Round 1 | Priority to resolve | Mitigation |
|---|---|---|---|
| Willingness to pay is unvalidated | **Unchanged.** Still the single largest open risk. | **Highest** | Run Round 2 Phase 3's controlled pilot with a real (non-€0.00) Stripe price and a small group of real photographers (`strategic-deployment-plan.md`) — no amount of further internal analysis substitutes for a real pricing signal. |
| Real email delivery works in practice | **Improved.** Now previously live-verified (real invitation delivered, delivery webhook confirmed) — see `mvp-verification.md`. Residual risk is volume/reputation at scale, not basic delivery. | Medium (was High) | Monitor delivery-rate metric (`capstone/dashboard/dashboard_documentation.md`) once real invitation volume exists; verify sending-domain reputation before scaling send volume. |
| Visual pipeline produces demo/placeholder output without a paid key | **Unchanged, but now more precisely evidenced.** The live-verified checkpoint confirms the *pipeline* works end-to-end (five references in, five ordered moodboard scenes out, readiness gated correctly) — but real image *quality* remains completely unverified, because no real (non-demo) generation call has been run. | **High** — this is now the most concrete blocking gap between "pipeline works" and "product is demoable to a paying client" | Run the MIRA-specific LangSmith sample (`capstone/langsmith/`) against real credentials on synthetic data first (Round 2 Phase 2) — catch a quality problem before any real client sees output. |
| Voice conversation quality is unverified | **Unchanged.** No live voice session evidenced. | Medium-High | Exercise the existing `server/miraCore/realtime.ts` implementation with a real test call before including voice in the Phase 3 pilot's default path; keep the text-fallback path as the safe default until it is. |
| Calendar confirmation is broken | **New finding this round.** A confirmation attempt returned an error and could not be saved (`docs/ROUND1_VERIFICATION.md`). This is a concrete, reproducible bug, not an unvalidated assumption — lower uncertainty, but a real blocker on the "shoot details confirmed" path. | High (concrete bug, not speculative risk) | Fix directly — this is Round 2 Phase 1's first named task (`strategic-deployment-plan.md`), not a research question. |
| No production deployment or real database exercised for the visual pipeline | **Unchanged in kind; narrowed in scope.** The isolated-preview storage fix (`MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION`) resolved the *asset-serving* failure, but this is explicitly documented as an isolated-preview fallback, not a production storage decision (`docs/MANUS_ENVIRONMENT_CONTRACT.md`). A real production storage/database decision remains open. | High | Make the real hosting/storage/database vendor decision before Phase 3's pilot — currently `[TBD]` in `capstone/planning/cost_timeline.md`. |
| MIRA depends on a third-party remote-capture app it does not control | **Unchanged.** | Medium | Document the assumed capture-app dependency explicitly in any client-facing pitch, so it is a known constraint rather than a surprise; monitor Clos/Shutter-class platform availability as an ongoing operational check, not a one-time task. |
| Two parallel, disconnected legacy product surfaces (`/mira-v3`, `/mira-v4`) share the codebase | **Unchanged.** | Low-Medium (maintenance/clarity risk, not a Round 2 blocker) | Defer — not blocking a pilot; revisit as a cleanup task once pilot data justifies further investment in the product. |

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
