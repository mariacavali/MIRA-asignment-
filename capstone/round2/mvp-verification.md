# MVP Verification — Round 2

**Status:** This document is the authoritative, current status record for the working MIRA Core MVP. It supersedes older per-stage status language in `capstone/automation/automation_poc.md` and `README.md`'s "Verified checkpoints" table where they conflict, because it reflects the most recent live verification pass (`docs/ROUND1_VERIFICATION.md`, isolated-preview commit `6cf6b97c6dee65adc048d306b1131e691250f10a`). Where this document and an older one agree, both are cited; where they differ, this document reflects the newer evidence.

## The implemented flow

```
Stripe → photographer dashboard → shoot setup → Resend invitation
→ private Shoot Room → structured preparation → Creative DNA
→ five-scene demo moodboard → Ready to Shoot
```

Every arrow above is a real, persisted, gated state transition implemented in this codebase — not a manual step and not an external no-code tool (see `capstone/automation/automation_poc.md`, "What 'automation' means here").

## Verification status, stage by stage

| Stage | Status | Evidence |
|---|---|---|
| **Stripe payment → photographer activation** | **Previously live-verified** (separate, earlier pass; not re-run in this checkpoint) | One real, signed `checkout.session.completed` event (MIRADEMO 100%-discount promotion, €0.00), webhook signature verified, event idempotency confirmed, focused payment suite (10 files / 62 tests) passing. Branch `fix/mira-final-ux-runtime`, commit `e2e99e1f47c5d749d6ca91281e24c00a51f10931` (`docs/stripe-integration.md`). |
| **Photographer dashboard / shoot setup** | **Code-verified** | `createCanonicalShoot` and dashboard routes are implemented and unit-tested; not independently re-exercised live in this checkpoint. |
| **Resend invitation delivery** | **Previously live-verified** (separate, earlier pass) | A real invitation was delivered to a real inbox on a stable preview; the Resend `email.delivered` webhook returned HTTP 200; the database recorded `delivered` status; 34/34 Resend-focused tests passed. Branch `fix/mira-stable-resend-email`, commit `8d6d2f8f755b1efbb1265a59500dea995a44c8d2` (`capstone/evidence/staged_validation_evidence.md`). |
| **Live client Shoot Room** | **Live-verified (this checkpoint)** | The private Shoot Room opened successfully on the isolated-preview deployment at commit `6cf6b97c6dee65adc048d306b1131e691250f10a`, with `MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true` enabled and root/`/api/health`/a pre-existing storage asset all returning HTTP 200. Previously resolved crashes (MariaDB `Invalid Date` handling, Creative DNA string/object normalization, moodboard scenes not reaching the client) were confirmed absent. (`docs/ROUND1_VERIFICATION.md`) |
| **Five demo reference visuals** | **Live-verified (this checkpoint)** | Exactly five uploaded reference visuals rendered in the live Shoot Room. **Honest labeling:** these are locally created demo placeholders, not original client photographs — no external image API was called (`docs/ROUND1_VERIFICATION.md`). |
| **Structured preparation / Creative DNA** | **Live-verified (this checkpoint)** | Creative DNA / preparation state was visible and complete in the live Shoot Room, using the `demo-local` synthesis path (no `OPENAI_API_KEY` configured for that checkpoint). The underlying real-synthesis code path (`synthesizeMiraV4CreativeDna`, `server/miraV4/creativeDna.ts`) is implemented and unit-tested but was not exercised live in this checkpoint — see `capstone/round2/evaluation-and-monitoring.md`. |
| **Five ordered demo moodboard scenes** | **Live-verified (this checkpoint)** | Exactly five ordered moodboard scenes rendered, produced by the real deterministic prompt-compilation pipeline (`server/miraV4/moodboard.ts`, `server/miraV4/campaignCompiler.ts`) with locally rendered placeholder images (`createLocalPlaceholderImage`), since no `OPENAI_API_KEY` was configured for that checkpoint. **Honest labeling:** these are demo-local placeholder assets, not AI-generated photography (`docs/ROUND1_VERIFICATION.md`). |
| **Ready to Shoot** | **Live-verified (this checkpoint)** | The "Ready to Shoot" state was visible in the live Shoot Room, correctly gated on Creative DNA and moodboard generation both having actually completed (`shouldActivateShootPreparation`, `shared/miraCore.ts`). |
| **Shoot details / text fallback control** | **Live-verified (this checkpoint)** | Both were visible and functional in the same live Shoot Room pass (`docs/ROUND1_VERIFICATION.md`). |

## Implemented but currently blocked

- **Calendar confirmation persistence.** The confirmation flow is implemented and was exercised live, but the attempt returned "We couldn't save your response. Please try again." This must **not** be described as currently live-verified (`docs/ROUND1_VERIFICATION.md`).

## Pending / unverified

- **Voice conversation.** `server/miraCore/realtime.ts` implements the realtime voice-call session logic, but no live, real-audio voice conversation has been evidenced as completed anywhere in this project's records. Only the text-fallback conversation path has been directly exercised.
- **Real (non-demo) Creative DNA synthesis and real (non-demo) image generation.** Both code paths exist and are unit-tested (`synthesizeMiraV4CreativeDna`, `generateMoodboardImageViaOpenAI`), gated identically on `OPENAI_API_KEY`, but neither has been exercised live in any checkpoint recorded in this repository. See the MIRA-specific LangSmith monitoring sample (`capstone/langsmith/`) for the current status of instrumenting a real run once credentials are available.
- **Real (non-€0.00) Stripe transaction, real production database, and a real deployed (not isolated-preview) environment.** None exists in this project's evidence.

## What "demo-local" honestly means for this MVP

Both the five reference visuals and the five moodboard scenes exist because no `OPENAI_API_KEY` was configured in the verified checkpoint — not because the pipeline is unfinished. The same code path, gated on the identical environment check (`ENV.embeddingApiKey`), calls the real OpenAI Creative DNA synthesis and real `gpt-image-2` moodboard generation when a key is present (`server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`). This is a deliberate, documented fallback so the full pipeline is demonstrable without any paid API call — not a missing feature. Round 2 should not present the demo-local run as evidence of real generated-image quality; that remains explicitly unverified.

## Storage fix underlying this checkpoint

The isolated preview's assets (references and moodboard) were previously broken (HTTP 500 on every image) because the storage layer failed closed under `NODE_ENV=production` without Forge storage configured. `MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION` (default disabled) was added as an explicit, off-by-default opt-in so this isolated preview could serve its existing local-disk assets, without weakening production behavior when the flag is unset and without touching Forge-configured behavior. Full detail: `docs/MANUS_ENVIRONMENT_CONTRACT.md`, commit `6cf6b97c6dee65adc048d306b1131e691250f10a`.
