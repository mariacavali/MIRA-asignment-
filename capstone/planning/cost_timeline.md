# Cost & Timeline — Assumptions-Based Template

## Status

**This is a planning template, not a costed budget.** No real pricing quote, real usage volume, or approved assumption has been confirmed for any line item below. Every `[PLACEHOLDER]` must be filled in and approved by Maria before this document can be used as an actual budget. Nothing in this document should be presented as a real cost figure.

**Source evidence used for what exists today (not for pricing):** `docs/stripe-integration.md`, `docs/ENVIRONMENT_VARIABLES.md`, `server/_core/imageGeneration.ts`, `server/miraCore/moodboardAdapter.ts`, this project's Resend integration and visual-pipeline implementation work.

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
