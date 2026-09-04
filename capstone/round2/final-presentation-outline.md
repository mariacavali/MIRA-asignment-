# Final Presentation Outline — Round 2

**Status:** Content outline only. No slide deck artifact was built for Round 2 as part of this task — this outline sources every point from a specific Round 2 document so a deck (or a live walkthrough) can be built from it without inventing content. The Round 1 deck (`capstone/presentation/MIRA_Ironhack_Presentation_Validated_Stages.pptx`) remains the presentation artifact of record for what it already covers; this outline is scoped to what's *new* in Round 2 plus a full-picture recap.

## Suggested slide sequence

1. **Recap: the use case** — sector, company, problem, in/out of scope. See `use-case-definition.md`.
2. **From PoC to MVP** — the early n8n prototype (client input → OpenAI → JS parsing → Google Sheets → Google Docs) versus the current working product. Be explicit that the PoC never generated a moodboard or an image. See `poc-documentation.md`.
3. **The working MVP, stage by stage** — Stripe → dashboard → shoot setup → Resend invitation → private Shoot Room → preparation → Creative DNA → five-scene demo moodboard → Ready to Shoot, each stage labeled live-verified / previously verified / blocked / pending exactly as recorded. See `mvp-verification.md`. **Do not upgrade any status for the presentation** — the demo-local moodboard is demo-local, the Calendar bug is a bug, voice is pending.
4. **ROI and risk** — no invented ROI number; state the cost structure and the risk register, with willingness-to-pay named as the single highest-priority open question. See `roi-and-risk-assessment.md`.
5. **Compliance posture** — EU AI Act classification (limited-risk, transparency obligations under Article 50, not high-risk) and the GDPR preliminary DPIA findings (consent gate implemented; retention implemented for transcripts only; several gaps to close before a real pilot). Frame both explicitly as preliminary self-assessment, not legal sign-off. See `eu-ai-act-assessment.md`, `gdpr-dpia.md`.
6. **Deployment plan** — the four-phase, evidence-gated plan (close concrete gaps → first real generation run → controlled pilot → scale decision), each phase's exit criterion stated plainly. See `strategic-deployment-plan.md`.
7. **Evaluation and monitoring** — the existing Ironhack LangSmith evidence (clearly labeled as a separate course experiment), the new MIRA-specific monitoring sample and its current honest "not yet run" status, and the still-unbuilt dashboard specification. See `evaluation-and-monitoring.md`.
8. **Cost and timeline** — what changed since Round 1's cost template, the one concrete near-term blocker (running the LangSmith sample for real numbers), and the phase-gated (not date-gated) timeline. See `cost-and-timeline.md`.
9. **Recommendation, restated** — KEEP, with the same explicit non-claims as Round 1 (`capstone/feedback/round1_decision.md`), updated with this round's narrowed risk picture (pipeline correctness now demonstrated; real quality/cost and compliance completeness now the named remaining gaps).

## Presenting honestly (unchanged rule from Round 1)

Every status label used in this outline (live-verified / previously verified / code-verified / implemented but blocked / pending / designed) must be used consistently and never upgraded for presentation effect — see `capstone/presentation/README.md`'s "Presenting honestly" section, which governs this outline equally. In particular:

- The five reference visuals and five moodboard scenes are demo-local placeholders — say so if shown live or in a screenshot.
- Calendar confirmation is currently blocked, not pending — it is a known, reproduced bug.
- The EU AI Act and GDPR sections are the author's own preliminary analysis, not legal advice — say so out loud, not just in the footnote.
- No ROI figure should ever be spoken or shown as a number — say explicitly that none exists yet and why.

## What this outline deliberately does not do

It does not propose slide design, imagery, or timing. It does not assume every point above fits on one slide — some (the MVP stage table, the risk register) are dense enough to warrant their own slide or an appendix. It does not modify or replace the Round 1 deck.
