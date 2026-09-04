# MIRA staged validation evidence

MIRA is being validated in isolated, traceable stages so that new integrations do not destabilize previously working functionality.

| Stage | Verification evidence | Current status | Git reference |
|---|---|---|---|
| Stripe payments | 62/62 focused tests passed; production build passed; hosted payment and webhook flow confirmed | **Live-verified** | Branch: `fix/mira-final-ux-runtime` \| Commit: `e2e99e1f47c5d749d6ca91281e24c00a51f10931` |
| Resend email automation | Real invitation delivered to a real inbox on a stable preview; primary Shoot Room link returned HTTP 200; "Talk to MIRA" link returned HTTP 200 using the same signed invitation; responsive branded HTML and plain-text fallback both confirmed; Resend `email.delivered` webhook returned HTTP 200; database delivery status recorded as `delivered`; 34/34 Resend-focused tests passed; TypeScript clean; production build passed; 59/59 Stripe regression tests passed (existing Stripe deployment untouched) | **Live-verified.** Preview: `https://pc-6fh5ovldu7pa.manus.host` | Branch: `fix/mira-stable-resend-email` \| Commit: `8d6d2f8f755b1efbb1265a59500dea995a44c8d2` |
| Visual preparation pipeline | 35/35 focused visual tests passed; full suite recorded 460 passed, 24 identical pre-existing failures, and 3 skipped; TypeScript clean; production build passed | **Code-verified.** Real database execution, non-demo image generation, and a live deployment run remain pending — **do not mark live-verified until a real hosted run is observed**, per the same rule already applied to every other stage in this table. | Branch: `codex/mira-visual-stage3` \| Commit: `90baaff9b9930bc82f0e6e93129d97ee350ce641` |
| Combined code checkpoint (stable Resend + Stage 3 visual) | Stage 3 visual implementation cherry-picked cleanly onto the stable Resend commit (one auto-merged file, no manual conflict resolution needed); stable Resend files verified byte-identical to their source commit; TypeScript clean; production build passed; no secrets, generated images, local databases, logs, or local artifacts included | **Code-verified.** This is a combined checkpoint, not a new live verification — the Resend row above's live-verified status and the visual row above's code-verified/pending status each still apply to their own code on this branch individually. Visual live deployment is **not** verified merely because it now shares a branch with a live-verified Resend commit. | Branch: `fix/mira-resend-visual-integration` \| Commit: `b1e44b8bca5dd195f632356a49bdad92fd099abc` |
| LangSmith monitoring | Separate Ironhack experiment completed: dataset `ironhack-support-ticket-priority-v1`, 12 examples, experiment `ticket-priority-baseline-32443137`, 12/12 exact result, 10 tests passed | **Course evidence only — a separate Ironhack lab experiment, not MIRA tracing.** A MIRA-specific LangSmith trace remains pending and does not exist in this codebase. | Evidence location: `capstone/monitoring/langsmith_monitoring.md` (this repository's own record of the reported evidence; no external screenshot or link has been supplied) |
| Voice conversation | Existing implementation identified (`server/miraCore/realtime.ts`) | **Live verification pending.** No live voice session has been observed; this status is unchanged by the Resend and combined-checkpoint verification above. | `[ADD FUTURE BRANCH/COMMIT once a live voice session is verified]` |

## Validation approach

- Each product layer is developed on a separate Git branch and recorded at an exact commit.
- Automated tests and the production build are run before deployment.
- Database-changing work is rehearsed in an isolated preview before it can affect the working Stripe deployment.
- Secrets, personal data, local databases, logs and generated artifacts are excluded from GitHub.
- A stage is described as **live-verified** only after its real hosted flow has been successfully observed.

## Evidence screenshots

Use tightly cropped screenshots and review them before submission so they contain no API keys, webhook secrets, database credentials, invitation tokens, private email addresses or unrelated browser tabs.

Recommended filenames (none currently exist in this repository — add them here once captured):

1. `01-stripe-tests-and-build.png`
2. `02-stripe-hosted-payment-webhook.png`
3. `03-resend-isolated-preview.png`
4. `04-resend-migrations-through-0018.png`
5. `05-visual-tests-and-build.png`
6. `06-langsmith-experiment.png`

## Remaining proof required

Resend delivery, its webhook confirmation, and the Stripe regression check are now complete (see the Resend row above) and are removed from this list. Still outstanding:

- A live deployment run of the visual preparation pipeline (real database, non-demo image generation) — the combined checkpoint branch has not itself been deployed or observed live.
- MIRA-specific LangSmith trace and evaluation evidence (separate from the existing Ironhack course experiment).
- Live voice-conversation verification.

## Presentation takeaway

Staged validation protects working functionality, limits regression risk, and creates traceable GitHub evidence for every product layer.

## Provenance note

This document was originally supplied for the Round 1 submission and has since been updated twice from this repository's own verified checkpoints: first with the Stage 3 visual branch/commit and the LangSmith evidence location, and again with the live-verified Resend evidence (branch `fix/mira-stable-resend-email`, commit `8d6d2f8f755b1efbb1265a59500dea995a44c8d2`, preview `https://pc-6fh5ovldu7pa.manus.host`) and the combined code checkpoint (branch `fix/mira-resend-visual-integration`, commit `b1e44b8bca5dd195f632356a49bdad92fd099abc`). The Resend and combined-checkpoint figures (delivery confirmation, HTTP statuses, and test counts) are recorded as reported for that live verification pass and have not been independently re-run from inside this repository. The voice-conversation git reference remains an open placeholder because no live voice verification has occurred. This file previously lived at `capstone/validation/staged_validation_evidence.md`; it has been moved to `capstone/evidence/` and all cross-references updated accordingly.
