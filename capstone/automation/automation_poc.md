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
| 5. Resend delivery | **Live-verified** | The Resend provider integration (`server/email/resend.ts`) and delivery-status webhook (`server/email/resendWebhook.ts`) were verified on a stable preview (`https://pc-6fh5ovldu7pa.manus.host`, branch `fix/mira-stable-resend-email`, commit `8d6d2f8f755b1efbb1265a59500dea995a44c8d2`): a real invitation was delivered, the primary Shoot Room link and the "Talk to MIRA" link both returned HTTP 200 for the same signed invitation, the Resend `email.delivered` webhook returned HTTP 200, and the database recorded `delivered` status. 34/34 Resend-focused tests passed, TypeScript was clean, the production build passed, and 59/59 Stripe regression tests passed with the existing Stripe deployment untouched. Full detail in `capstone/evidence/staged_validation_evidence.md`. |
| 6. Private Shoot Room | **Partial — link reachability live-verified; full room flow code-verified only** | `/prepare/:token` and `/prepare/access/:signedAccessToken` routes (`client/src/pages/MiraShootRoom.tsx`) are implemented: consent, visual-reference upload (bounded to five client references, added and tested in this project), Discovery conversation entry, and moodboard display. The stable Resend verification confirmed the room's private link and its "Talk to MIRA" entry point both return HTTP 200 for a real signed invitation on a live preview — that is a real, live confirmation that the route resolves and renders. It does **not** by itself confirm the reference-upload, Discovery, or moodboard-display steps inside the room were exercised live; those remain covered only by this project's own automated tests, per Stage 7 below. |
| 7. Preparation | **Under development** | Text-based Discovery is implemented and tested (`server/miraCore/router.ts`'s realtime text-fallback path). Creative DNA and moodboard generation are implemented and unit-tested (`server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`) but currently require a real MySQL/TiDB database — no local/demo persistence path exists yet, so this stage has not been exercised end-to-end against live data in this project. Visual output in the absence of a configured `OPENAI_API_KEY` is a clearly-labeled, deterministic **demo/placeholder** artifact (`server/miraCore/demoCreativeDna.ts`; local SVG placeholder images), not a real generated moodboard. |
| 8. Readiness | **Code-verified** | `markShootReadyToShoot` (`server/miraCore/router.ts`) is implemented and gated on Preparation having actually activated (`shouldActivateShootPreparation`) — it cannot be reached by skipping Stage 7. Not exercised against a live deployment in this submission. |

## Explicit distinctions (as required for this submission)

- **Stripe: live-verified.** A real signed webhook event was processed and produced a real state change (payment → active account). This is the only stage in the chain with a live-transaction verification behind it, and even that transaction was €0.00 via a discount code, not a real-price payment.
- **Resend: live-verified.** A real invitation was delivered to a real inbox on a stable preview, with the Shoot Room and "Talk to MIRA" links both confirmed HTTP 200 and the Resend delivery webhook confirmed HTTP 200 end to end (branch `fix/mira-stable-resend-email`, commit `8d6d2f8f755b1efbb1265a59500dea995a44c8d2`; see `capstone/evidence/staged_validation_evidence.md`).
- **Visuals: under development.** The Creative DNA and moodboard generation pipeline is implemented, reuses the existing MIRA V4 visual compiler, and is unit-tested with mocked/demo generation — but has not been run against a real database, a real OpenAI key, or a real client's references in this project. Output today is either a schema-valid demo object or nothing (no DB configured).
- **Voice: pending.** `server/miraCore/realtime.ts` implements the realtime voice-call session logic, but no live, real-audio voice conversation has been evidenced as completed in this project's available records. Only the text-fallback conversation path has been directly exercised in this project's evidence.

## What "automation" means here

Every arrow in the flow above is implemented as a **direct code call or a persisted, gated state transition** — not a manual step, and not an external no-code automation tool. A separate, real, importable n8n workflow export *does* exist in this repository, for MIRA's client email-milestone scheduling specifically — see `capstone/automation/n8n_automation_poc.md` for what it does, why it fits the use case, and its limits vs. production. It is a genuine automation-boundary artifact, not part of the code chain documented in this file. The gap this document is honest about is not "is it automated" but "has each automated step been exercised against real external systems (a real inbox, a real database, a real paid model call, a real voice call)."
