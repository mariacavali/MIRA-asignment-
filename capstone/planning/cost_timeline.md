# Cost & Timeline — Assumptions-Based Template

## Status

**This is a planning template, not a costed budget.** No real pricing quote, real usage volume, or approved assumption has been confirmed for any line item below. Every `[PLACEHOLDER]` must be filled in and approved by Maria before this document can be used as an actual budget. Nothing in this document should be presented as a real cost figure.

**Source evidence used for what exists today (not for pricing):** `docs/stripe-integration.md`, `docs/ENVIRONMENT_VARIABLES.md`, `server/_core/imageGeneration.ts`, `server/miraCore/moodboardAdapter.ts`, this project's Resend integration and visual-pipeline implementation work.

## Illustrative worked example (explicit assumptions — not confirmed prices)

The detailed line-item template below (Sections 1–9) intentionally leaves real prices as `[TBD]` because no real quote has been confirmed. This section instead gives one **fully worked, explicitly illustrative** example — every rate is labeled as an assumption, not a confirmed price, so the *shape* of the estimate (what drives cost, and how the pieces combine) is visible without presenting anything as real.

### Assumptions table

| Assumption | Value | Basis |
|---|---|---|
| Pilot scale | 50 shoots/month | Illustrative — sized for a small pilot across a handful of photographers, not a confirmed target |
| Creative DNA calls per shoot | 1 | **Confirmed from code** — idempotent, one call per confirmed shoot (`server/miraCore/creativeDnaAdapter.ts`) |
| Moodboard images per shoot | 5 | **Confirmed from code** — one coherent five-scene moodboard (`server/miraCore/moodboardAdapter.ts`) |
| Emails per shoot | 1–4 | **Confirmed from code** — adaptive schedule, invitation plus up to 3 reminders (`shared/miraEmailSequence.ts`); this example assumes 3 as a mid-range estimate |
| Illustrative text-generation cost | €0.02 / Creative DNA call | **ILLUSTRATIVE — not a confirmed OpenAI rate.** No real (non-demo) call has been run to measure an actual figure; this is a placeholder order-of-magnitude assumption only, for a short structured-JSON completion. |
| Illustrative image-generation cost | €0.08 / image | **ILLUSTRATIVE — not a confirmed rate.** Same caveat as above; assumes a small/standard generation tier. |
| Illustrative email cost | negligible (<€0.001/email at pilot volume) | Illustrative — most transactional-email providers' entry tiers cover this volume within a free/starter allowance |
| Illustrative hosting + database | €50/month | Illustrative — small-instance placeholder, not a vendor quote |

### Resulting illustrative monthly total (pilot scale, 50 shoots/month)

| Line | Calculation | Illustrative monthly total |
|---|---|---|
| Text generation | 50 × 1 × €0.02 | €1.00 |
| Image generation | 50 × 5 × €0.08 | €20.00 |
| Email | 50 × 3 × ~€0 | ~€0 (within a starter tier) |
| Hosting + database | flat | €50.00 |
| **Illustrative total** | | **≈ €71/month at 50 shoots/month** |

**This number must not be treated as a real budget figure or quoted to a stakeholder as a cost commitment.** It exists only to show the calculation shape (volume × per-shoot usage × unit rate + fixed hosting) so that once real rates are confirmed (Round 2 Phase 2, `capstone/round2/strategic-deployment-plan.md`), the same formula can be re-run with real numbers instead of illustrative ones.

### Rough implementation timeline (unconfirmed estimate, not a committed schedule)

| Phase | Rough estimate | Basis |
|---|---|---|
| Close known gaps (Calendar confirmation bug, data-retention extension, AI-content labeling) | 1–2 weeks | Illustrative — scoped, bounded engineering tasks with no external dependency |
| First real (non-demo) generation run, synthetic data only | 2–3 days | Illustrative — mostly credential setup and one measured run using the already-built LangSmith sample (`capstone/langsmith/`) |
| Controlled pilot setup (real Stripe price, real Resend domain, recruit photographers) | 2–4 weeks | Illustrative — dominated by external account approval and recruitment, not engineering |
| Pilot run and evaluation | 4–8 weeks | Illustrative — enough real shoots to produce a meaningful readiness-rate/delivery-rate signal |

**No calendar date is attached to any phase.** These are rough, unconfirmed duration estimates for planning purposes only — no start date, team availability, or external approval timeline has been confirmed. See `capstone/round2/cost-and-timeline.md` for the Round 2 phase-gated (dependency-ordered, not duration-estimated) version of this same plan.

## 1. Development

| Item | Assumption | Value |
|---|---|---|
| Remaining build effort to Round 2 (visual pipeline live-data path, real email test, voice verification) | [PLACEHOLDER — not estimated] | `[TBD]` |
| Hourly/day rate or salary basis, if applicable | [PLACEHOLDER — depends on team structure, not decided] | `[TBD]` |
| One-time setup cost (accounts, domains, initial config) | [PLACEHOLDER] | `[TBD]` |

## 2. Hosting

| Item | Assumption | Value |
|---|---|---|
| Application hosting provider | Not yet selected. This project was verified in private staging only (`README.md`, "Deployment and demo limitations"); no production hosting decision exists. | `[TBD]` |
| Expected monthly hosting cost | [PLACEHOLDER — depends on provider and traffic tier, neither decided] | `[TBD]/month` |
| Object storage (generated images, uploaded references, PDFs) | S3-backed storage is already implemented (`server/storage.ts`) but the production bucket/provider/region is not confirmed | `[TBD]/month` |

## 3. Database

| Item | Assumption | Value |
|---|---|---|
| Database engine | MySQL/TiDB, already implemented via Drizzle (`drizzle/schema.ts`) — engine choice is real, cost is not | `[TBD]/month` |
| Expected data volume at launch | [PLACEHOLDER — no production usage exists yet to estimate from] | `[TBD]` |
| Backup/retention cost | [PLACEHOLDER] | `[TBD]` |

## 4. Stripe fees

| Item | Assumption | Value |
|---|---|---|
| Stripe processing fee (standard card rate) | [PLACEHOLDER — Maria's actual negotiated/regional Stripe rate not confirmed] | `[TBD]% + [TBD]/transaction` |
| Price point per MIRA purchase | Not decided. Only a €0.00 100%-discount test transaction has been verified (`docs/stripe-integration.md`) — this is explicitly **not** a real price point | `[TBD]` |
| Subscription vs. one-time | Current implementation is a one-time purchase (`docs/stripe-integration.md`) | Confirmed as one-time in current build; subject to change |

## 5. Resend

| Item | Assumption | Value |
|---|---|---|
| Resend plan tier | Not selected. `RESEND_API_KEY` is not configured in this environment. | `[TBD]/month` |
| Expected email volume per shoot | Based on the implemented adaptive schedule (`shared/miraEmailSequence.ts`): 1–4 emails per shoot depending on lead time (invitation, plus up to 3 reminders) | `[TBD]` emails/month at `[TBD]` shoots/month |
| Sending-domain verification cost | Typically free with Resend, but not confirmed for Maria's account | `[TBD]` |

## 6. Model / API usage (text — Creative DNA, Discovery)

| Item | Assumption | Value |
|---|---|---|
| Provider | OpenAI direct, `gpt-5-mini` (`server/miraV4/creativeDna.ts`, `docs/MIRA_AI_AND_DATA_INVENTORY.md`) | Confirmed model choice in current code |
| Cost per Creative DNA synthesis call | [PLACEHOLDER — no real (non-demo) synthesis call has been run in this project to measure token usage from] | `[TBD]` |
| Expected calls per shoot | 1 Creative DNA synthesis call per confirmed shoot (idempotent — see `server/miraCore/creativeDnaAdapter.ts`) | 1 per shoot (confirmed from code; volume not confirmed) |

## 7. Image generation

| Item | Assumption | Value |
|---|---|---|
| Provider | OpenAI Images API direct (`server/miraCore/openAiMoodboardImage.ts`), model `gpt-image-2` | Confirmed model choice in current code |
| Images per shoot | 5 (one coherent five-scene moodboard per confirmed shoot — `server/miraCore/moodboardAdapter.ts`) | Confirmed from code |
| Cost per image | [PLACEHOLDER — no real (non-demo) image generation call has been run in this project] | `[TBD]` |
| Demo/local fallback cost | €0 — local placeholder images are generated with no external API call when no key is configured (`server/_core/imageGeneration.ts`) | Confirmed €0 in demo mode |

## 8. Monitoring

| Item | Assumption | Value |
|---|---|---|
| LangSmith plan tier for a MIRA-specific trace | Not yet scoped — see `capstone/monitoring/langsmith_monitoring.md` | `[TBD]/month` |
| Application error/uptime monitoring | Not yet selected/implemented | `[TBD]/month` |

## 9. Maintenance

| Item | Assumption | Value |
|---|---|---|
| Ongoing engineering time (bug fixes, dependency updates) | [PLACEHOLDER — no team structure or run-rate decided] | `[TBD]` |
| Support/operations time for photographer accounts | [PLACEHOLDER] | `[TBD]` |

## Timeline template (assumptions-based)

| Phase | Depends on | Status |
|---|---|---|
| Round 1 submission (this document set) | Existing implementation evidence | Complete as of this document |
| Real email delivery test | `RESEND_API_KEY`, verified sending domain, Maria's explicit approval of recipient/sender | Not started |
| Real database for visual pipeline | Production/staging MySQL/TiDB instance | Not started |
| Real (non-demo) Creative DNA + moodboard run | `OPENAI_API_KEY`, real database, one real shoot | Not started |
| Voice conversation live verification | Working realtime session against a real client device | Not started |
| First real (non-€0.00) Stripe transaction | Price decision, live Stripe account configuration | Not started |
| MIRA-specific LangSmith trace | Real (non-demo) generation runs to trace | Not started |
| Round 2 submission | All of the above | Not started |

**No dates are given** because no start date, team availability, or external dependency (Stripe/Resend account approval, hosting selection) has been confirmed. Add real dates only once these are approved.
