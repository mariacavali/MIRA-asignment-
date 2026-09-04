# Opportunities & Risks

**Status:** Author analysis only. Every rating in this document (Low/Medium/High, and the qualitative scoring table in Section 3) is **the author's own analytical judgment about the implemented codebase**, not a market statistic, survey result, or third-party analyst score. No external market data was used to produce these ratings.

**Source evidence used:** same as `sector_research.md`, plus `docs/stripe-integration.md`, `server/email/`, `server/miraCore/moodboardAdapter.ts`, `server/miraCore/creativeDnaAdapter.ts`, and this repository's own Stage 2/Stage 3 implementation history (Resend integration; visual preparation pipeline).

## 1. Opportunities

| Opportunity | Grounded in | Analyst note (author's assessment, not market data) |
|---|---|---|
| Verified client readiness before a paid shoot | `mira_shoots.roomState`, `mira_client_invitations.deliveryStatus`, `confirmRealtimeSummary` gating in `server/miraCore/router.ts` | The gating logic already exists and is real (Preparation only activates once Creative DNA + moodboard generation actually complete) — this is a genuine structural differentiator versus a static checklist, not a hypothetical one. |
| Photographer-approved creative plan, generated from real client evidence | `server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`, `shared/miraV4CreativeDna.ts` | The pipeline reuses an already-built, schema-validated Creative DNA + five-scene campaign compiler (`server/miraV4/campaignCompiler.ts`) rather than a new, unproven generation approach. |
| Single private link carries the whole client experience | `server/miraCore/invitationAccessLink.ts`, `/prepare/:token` route | Reduces the client's operational burden to "one link," which is a defensible, demonstrable UX property, not a claim requiring market validation. |
| Adaptive, honest-status email delivery instead of a blunt reminder blast | `server/email/`, `shared/miraEmailSequence.ts` (verified in this repository's Resend integration work) | Delivery status (queued/sent/delivered/failed) is tracked per invitation, not just "sent," which is a real technical property that supports a "we told you if it worked" pitch to photographers. |
| Local/demo fallback keeps the whole pipeline testable without paid API calls | `server/miraCore/demoCreativeDna.ts`, `server/_core/imageGeneration.ts`'s local placeholder generator | Lowers the cost and risk of demoing the product before committing to paid model/image spend — a real engineering property, not a market one. |

## 2. Risks

| Risk | Grounded in | Analyst note (author's assessment) |
|---|---|---|
| Willingness to pay is unvalidated | `docs/stripe-integration.md` (one €0.00 promo-code transaction only) | This is the single largest open risk for a Round 2 decision. No pricing signal exists yet. |
| No real end-to-end email has been sent | Resend integration stage of this project (code-verified only; `RESEND_API_KEY` not configured in this environment) | Delivery correctness in the real world (spam filtering, real inboxes, real sending domain reputation) is unverified. |
| Visual pipeline generates demo/placeholder images without a configured OpenAI key | `server/miraCore/moodboardAdapter.ts` demo fallback, `server/_core/imageGeneration.ts` | The "photographer-approved creative plan" claim currently degrades to a schema-valid but clearly-labeled placeholder object in any environment without a paid key configured — real creative quality is unverified outside a fully-configured environment. |
| Voice conversation quality is unverified in this repository | `server/miraCore/realtime.ts` exists in code but has not been exercised with a live verified call in this project's evidence set | The core client-facing "talk to MIRA" interaction is implemented but not evidenced as working end-to-end with real audio in production conditions. |
| No production deployment or real database has been exercised for the visual pipeline | `server/miraCore/creativeDnaAdapter.ts`/`moodboardAdapter.ts` require a real MySQL/TiDB connection (no local-file-store branch); this sandbox has none configured | The full client Discovery → Creative DNA → moodboard chain has not been run start-to-finish against a real database in this project. |
| MIRA depends on a third-party remote-capture app it does not control | `server/miraCore/coreKnowledge.ts` names Clos directly; Shutter is the second named platform in the same category (see `capstone/research/sector_research.md` §1a and its citations) | If the assumed capture workflow (Clos or Shutter) changes or becomes unavailable to a given photographer, MIRA's preparation step still works, but the shoot itself depends on tooling outside this codebase. |
| Two parallel, disconnected legacy product surfaces exist in the same codebase | `/mira-v3`, `/mira-v4`, `/mira-1` routes in `client/src/App.tsx`; confirmed disconnected from the private Shoot Room during this project's own Stage 3 audit | Product surface area is larger than the validated MIRA Core (Shoot Room) offer, which is a maintenance and clarity risk for a Round 1 pitch that should stay narrow. |

## 3. Qualitative risk/opportunity scoring (author's analysis only)

This is a simple High/Medium/Low framework applied by the author to reason about priority. **It is not a statistical model and carries no external validation.**

| Item | Impact if true/realized | Confidence it is currently true (from repo evidence) | Priority to validate before Round 2 |
|---|---|---|---|
| Readiness verification is a real differentiator | High | High (structurally implemented and gated) | Low — already demonstrable |
| Photographers will pay for this | High | **Unknown / not evaluated** — no data exists | **Highest** |
| Real email delivery works in practice | Medium | Medium (code-verified, not live-tested) | High |
| Real moodboard image quality is good enough to show a paying client | High | **Unknown** — only demo/placeholder images have been generated in this project | High |
| Voice conversation works reliably end-to-end | High | **Unknown** — not evidenced live in this project | Medium-High |

## 4. What this means for the Round 1 recommendation

The technical opportunity (verified readiness + photographer-approved creative plan, sitting between existing capture and CRM tools) is real and already partially implemented. The commercial opportunity (will a photographer pay for it) is completely unvalidated. See `capstone/feedback/round1_decision.md` for how this is reflected in the KEEP recommendation and its explicitly-flagged open questions.
