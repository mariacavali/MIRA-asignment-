# Automation POC — End-to-End Flow

## Full flow documented

```
Stripe payment → photographer activation → shoot creation → invitation scheduling
→ Resend delivery → private Shoot Room → preparation → readiness
```

This document traces each stage against the actual implemented code in this repository, and states, per stage, exactly what has been verified versus what remains pending. **No stage below is described as working unless it is either live-verified evidence in this repository or directly traceable to implemented, tested code.**

**Source evidence used:** `docs/stripe-integration.md`, `server/payment/`, `server/miraCore/router.ts`, `server/miraCore/db.ts`, `server/email/`, `server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`, `server/miraCore/realtime.ts`, this repository's own Resend-integration and visual-preparation implementation stages.

## Stage-by-stage status

| Stage | Status | Evidence |
|---|---|---|
| 1. Stripe payment | **Live-verified** | `docs/stripe-integration.md`: one real, signed `checkout.session.completed` event (MIRADEMO 100%-discount promotion, €0.00), webhook signature verified, event idempotency confirmed, focused payment test suite (10 files / 62 tests) passing. |
| 2. Photographer activation | **Live-verified** (same event) | The same verified webhook event consumed the pending checkout and activated the linked photographer's `mira_stripe_billing_identities.paymentState`, confirmed reaching `/mira/dashboard` (`docs/stripe-integration.md`). |
| 3. Shoot creation | **Code-verified** | `createCanonicalShoot` (`server/miraCore/router.ts` → `server/miraCore/db.ts`) is implemented, tested, and reachable only after onboarding completion; exercised in this project's own automated test suite. Not independently re-verified live in this submission. |
| 4. Invitation scheduling | **Code-verified** | `sendInvitation` (`server/miraCore/router.ts`) creates the invitation record and schedules the adaptive reminder sequence (`shared/miraEmailSequence.ts`, `server/email/outbox.ts`) — implemented and unit-tested in this repository (7-day/3-day/1-day and compressed schedules, idempotent scheduling). Duplicate-send protection (`invitationAlreadySentToClient`) added and tested in this project. |
| 5. Resend delivery | **Code-verified; real delivery pending** | The Resend provider integration (`server/email/resend.ts`), delivery-status webhook (`server/email/resendWebhook.ts`), and honest status lifecycle (`queued → sent → delivered/failed`) are implemented and covered by this project's own test suite (56 focused tests passing at the time of that work). **No real email has been sent**: `RESEND_API_KEY` is not configured in this environment, and sending was explicitly withheld pending Maria's approval of a real recipient/sender. |
| 6. Private Shoot Room | **Code-verified** | `/prepare/:token` and `/prepare/access/:signedAccessToken` routes (`client/src/pages/MiraShootRoom.tsx`) are implemented: consent, visual-reference upload (bounded to five client references, added and tested in this project), Discovery conversation entry, and moodboard display. Not exercised against a real deployed database in this submission. |
| 7. Preparation | **Under development** | Text-based Discovery is implemented and tested (`server/miraCore/router.ts`'s realtime text-fallback path). Creative DNA and moodboard generation are implemented and unit-tested (`server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`) but currently require a real MySQL/TiDB database — no local/demo persistence path exists yet, so this stage has not been exercised end-to-end against live data in this project. Visual output in the absence of a configured `OPENAI_API_KEY` is a clearly-labeled, deterministic **demo/placeholder** artifact (`server/miraCore/demoCreativeDna.ts`; local SVG placeholder images), not a real generated moodboard. |
| 8. Readiness | **Code-verified** | `markShootReadyToShoot` (`server/miraCore/router.ts`) is implemented and gated on Preparation having actually activated (`shouldActivateShootPreparation`) — it cannot be reached by skipping Stage 7. Not exercised against a live deployment in this submission. |

## Explicit distinctions (as required for this submission)

- **Stripe: live-verified.** A real signed webhook event was processed and produced a real state change (payment → active account). This is the only stage in the chain with a live-transaction verification behind it, and even that transaction was €0.00 via a discount code, not a real-price payment.
- **Resend: code-verified but real delivery pending.** The provider integration, honest delivery-status tracking, and duplicate-send protection are implemented and unit-tested. No email has actually been delivered to a real inbox from this project.
- **Visuals: under development.** The Creative DNA and moodboard generation pipeline is implemented, reuses the existing MIRA V4 visual compiler, and is unit-tested with mocked/demo generation — but has not been run against a real database, a real OpenAI key, or a real client's references in this project. Output today is either a schema-valid demo object or nothing (no DB configured).
- **Voice: pending.** `server/miraCore/realtime.ts` implements the realtime voice-call session logic, but no live, real-audio voice conversation has been evidenced as completed in this project's available records. Only the text-fallback conversation path has been directly exercised in this project's evidence.

## What "automation" means here

Every arrow in the flow above is implemented as a **direct code call or a persisted, gated state transition** — not a manual step, and not an external no-code automation tool. (A separate, explicitly synthetic n8n proof-of-concept exists for a different, unrelated onboarding scenario — see `README.md`'s reference to `capstone/round2/n8n/` — and is not part of this automation chain; it is out of scope for this Round 1 submission.) The gap this document is honest about is not "is it automated" but "has each automated step been exercised against real external systems (a real inbox, a real database, a real paid model call, a real voice call)."
