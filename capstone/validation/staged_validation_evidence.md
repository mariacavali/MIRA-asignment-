# MIRA staged validation evidence

MIRA is being validated in isolated, traceable stages so that new integrations do not destabilize previously working functionality.

| Stage | Verification evidence | Current status | Git reference |
|---|---|---|---|
| Stripe payments | 62/62 focused tests passed; production build passed; hosted payment and webhook flow confirmed | **Live-verified** | Branch: `fix/mira-final-ux-runtime` \| Commit: `e2e99e1f47c5d749d6ca91281e24c00a51f10931` |
| Resend email automation | 56/56 focused tests passed; isolated preview database created; ordered migrations applied through `0018`; preview health verified | **Code-verified and isolated-preview verified.** One controlled real-email delivery and delivery webhook confirmation remain pending — **verification in progress**, to be updated once that controlled send is completed. | Branch: `codex/mira-next` \| Commit: `17c061db4b4b0557bd1cd3c8be21f89593fafba1` |
| Visual preparation pipeline | 35/35 focused visual tests passed; full suite recorded 460 passed, 24 identical pre-existing failures, and 3 skipped; TypeScript clean; production build passed | **Code-verified.** Real database execution and non-demo image generation remain pending. | Branch: `codex/mira-visual-stage3` \| Commit: `90baaff9b9930bc82f0e6e93129d97ee350ce641` |
| LangSmith monitoring | Separate Ironhack experiment completed: dataset `ironhack-support-ticket-priority-v1`, 12 examples, experiment `ticket-priority-baseline-32443137`, 12/12 exact result, 10 tests passed | **Course evidence only.** A MIRA-specific LangSmith trace remains pending. | Evidence location: `capstone/monitoring/langsmith_monitoring.md` (this repository's own record of the reported evidence; no external screenshot or link has been supplied) |
| Voice conversation | Existing implementation identified (`server/miraCore/realtime.ts`) | **Live verification pending** | `[ADD FUTURE BRANCH/COMMIT once a live voice session is verified]` |

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

- One controlled Resend email sent to an approved address (**verification in progress**).
- Resend delivery status confirmed through the webhook (`sent` to `delivered`).
- Stripe regression check after the email preview is configured.
- Real visual generation connected to a real database without paid calls during development.
- MIRA-specific LangSmith trace and evaluation evidence.
- Live voice-conversation verification.

## Presentation takeaway

Staged validation protects working functionality, limits regression risk, and creates traceable GitHub evidence for every product layer.

## Provenance note

This document was supplied for the Round 1 submission and is reproduced here with the Stage 3 branch/commit and the LangSmith evidence location filled in from this repository's own verified checkpoints (see `capstone/ROUND1_SUBMISSION_CHECKLIST.md` and the individual Stage commit messages). The voice-conversation git reference remains an open placeholder because no live voice verification has occurred.
