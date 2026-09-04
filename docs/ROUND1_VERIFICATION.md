# MIRA Ironhack Capstone — Round 1 Verification

This document is the token-safe record of what has actually been observed for Round 1. It contains no invitation tokens, private URLs beyond the public preview hostname, client email addresses, credentials, storage keys, signed URLs, or private identifiers, and no screenshots are claimed or invented — every line below reflects only what was directly reported as verified.

Every status is one of exactly four categories:

- **Live-verified** — observed running, end to end, on a real hosted deployment.
- **Previously verified** — live-verified in an earlier, separately recorded pass; not re-run in this checkpoint.
- **Implemented but currently blocked** — the code path exists and was exercised, but it did not complete successfully.
- **Pending / unverified** — implemented but never exercised live, or explicitly out of scope for this round.

## Live-verified (this checkpoint)

**Deployment**
- Exact running commit: `6cf6b97c6dee65adc048d306b1131e691250f10a`
- Existing preview service restarted successfully at this commit
- `MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true` enabled (isolated-preview storage opt-in; see `docs/MANUS_ENVIRONMENT_CONTRACT.md`)
- Root path returned HTTP 200
- `/api/health` returned HTTP 200
- A pre-existing storage asset returned HTTP 200

**Client Shoot Room**
- Opened successfully
- Exactly five demo-local reference visuals rendered
- Exactly five ordered demo-local moodboard scenes rendered
- Creative DNA / preparation state visible
- "Ready to Shoot" state visible
- Shoot details visible
- Text fallback control visible
- Previously resolved crashes (MariaDB `Invalid Date` timestamp handling, Creative DNA string/object normalization, moodboard scenes not reaching the client) were absent

**What these visuals honestly are**
- The five reference visuals are locally created demo placeholders, generated without any external image API — **not original client photographs**.
- The five moodboard scenes are demo-local placeholder assets, generated the same way — **not AI-generated photography**.
- Real image generation was intentionally not invoked during this checkpoint. The five reference visuals and five moodboard scenes used token-safe demo-local placeholder assets, so no paid image-generation operation was performed.

**This round's own verification**
- Focused storage tests: 12/12 passed
- Focused client-room/reference/moodboard/readiness tests: 71/72 passed (1 pre-existing, unrelated failure — see "Honest, known limitation" below)
- Focused Resend webhook test: 8/8 passed
- TypeScript (`tsc --noEmit`): clean
- Production build (`vite build` + `esbuild`): succeeded

## Previously verified (separate, earlier pass — not re-run here)

- **Stripe checkout and webhook**: live-verified in an earlier pass on this codebase's Stripe integration (hosted payment and webhook flow confirmed, focused regression suite passed).
- **Resend invitation delivery**: a branded invitation was delivered to a real inbox on a stable preview; the Resend delivery-status webhook returned HTTP 200; the invitation's delivery status transitioned to `delivered` in the database.

These are recorded as previously verified because they were not re-exercised as part of this specific checkpoint; their code paths are unchanged by this round's work.

## Implemented but currently blocked

- **Calendar confirmation persistence**: the confirmation flow is implemented and was exercised live, but the attempt returned "We couldn't save your response. Please try again." Calendar confirmation must **not** be described as currently live-verified until this is resolved.

## Pending / unverified

- **Voice conversation**: the realtime voice implementation exists in the codebase but no live voice session has been observed as part of this or any prior round. Status is unchanged and remains pending.

## Honest, known limitation

One pre-existing test assertion (`server/miraCore/visualReferences.test.ts`, a source-text content check unrelated to storage, moodboard, or webhook behavior) fails identically on the unmodified target commit before any of this round's changes. It is reported here rather than hidden; it is not a regression introduced by this checkpoint.

## Scope note

This document intentionally does not claim a completely continuous production workflow. Each layer above (deployment/storage, visual demo pipeline, Stripe, Resend, calendar, voice) is recorded and verified independently, at its own level of confidence, per the project's staged-validation approach (see `capstone/evidence/staged_validation_evidence.md`).

## Git reference

- Verified integration commit: `6cf6b97c6dee65adc048d306b1131e691250f10a` (branch `fix/mira-resend-visual-integration`)
- Brought into the Round 1 submission branch `codex/capstone-round1-submission` via a non-destructive merge (both branches' full history preserved).
