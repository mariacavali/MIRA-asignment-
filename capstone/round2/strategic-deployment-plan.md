# Strategic Deployment Plan — Round 2

**Status:** Author's planning document. No phase below has a confirmed date — see `capstone/round2/cost-and-timeline.md` for why. This plan sequences *decision gates*, not a fixed calendar.

## Principle: stay narrow, gate every expansion on real evidence

Consistent with the Round 1 decision (`capstone/feedback/round1_decision.md`, **KEEP**) and this project's own staged-validation discipline (`capstone/evidence/staged_validation_evidence.md`), each phase below only opens once the previous phase's evidence exists — not once it is merely planned.

## Phase 0 — Current state (where this plan starts from)

- Full demo-mode MVP flow live-verified end-to-end on an isolated preview: Stripe (previously verified) → Resend invitation (previously verified) → private Shoot Room → five demo references → Creative DNA/preparation → five demo moodboard scenes → Ready to Shoot (`capstone/round2/mvp-verification.md`).
- Known, concrete blocker: Calendar confirmation persistence fails.
- Known, unverified: voice conversation, real (non-demo) generation quality and cost.
- Known, incomplete: data retention/erasure for most personal-data categories (`capstone/round2/gdpr-dpia.md`), per-asset AI-content labeling (`capstone/round2/eu-ai-act-assessment.md`).

**Nothing in Phase 1 or later should begin before Phase 0's known bugs (Calendar) are fixed** — shipping a pilot with a reproducible "can't save your response" error is a worse first impression than delaying.

## Phase 1 — Close the concrete gaps (engineering, no external dependency)

1. Fix Calendar confirmation persistence (reproducible bug, not a research question).
2. Extend the transcript-retention pattern already implemented (`mira_call_qa_events`) to visual references, Creative DNA, moodboard, and shoot contact details (`capstone/round2/gdpr-dpia.md` §3).
3. Add explicit per-asset "AI-generated" labeling to the client and photographer-facing moodboard/Creative DNA views (`capstone/round2/eu-ai-act-assessment.md`, "Gaps to close").
4. Run the MIRA-specific LangSmith monitoring sample (`capstone/langsmith/`) against real credentials to get the first real latency/token/cost numbers for the text-generation step — see `capstone/round2/evaluation-and-monitoring.md`.

**Exit criterion:** all four items above verified (not just implemented) before Phase 2 begins.

## Phase 2 — First real (non-demo) generation run

1. Configure a real `OPENAI_API_KEY` in a controlled, non-production environment.
2. Run one real Creative DNA synthesis and one real five-image moodboard generation against **synthetic** shoot data (no real client), specifically to answer: is generated quality good enough to show a paying client, and what does it actually cost per shoot?
3. Feed the result into `capstone/round2/roi-and-risk-assessment.md`'s open cost line items (§6–7 of `capstone/planning/cost_timeline.md`) with real, measured numbers — replacing `[TBD]`, not guessing.

**Exit criterion:** a real per-shoot text + image cost figure and a photographer-eye quality judgment exist. If quality is not acceptable, this phase repeats (prompt/model iteration) before Phase 3, not after.

## Phase 3 — Controlled pilot with real photographers

1. Recruit a small number (single digits) of real, consenting photographers — ideally from the three use-case shapes already documented (`capstone/research/use_cases.md`): solo, small studio, higher-volume.
2. Real Stripe transaction at a real (not €0.00) price point — the first real pricing signal this project will have.
3. Real invitations to real clients, with the itemized consent flow from Phase 1 in place.
4. Voice conversation exercised live for the first time with real users, specifically to close the "voice quality unverified" gap.
5. Instrument the dashboard metrics already specified (`capstone/dashboard/dashboard_documentation.md`) against this pilot's real data — this is the first time any of those seven metrics will have a real, non-zero value.

**Exit criterion:** enough pilot data to answer the two Round 1 open questions that matter most: will photographers pay, and does real generation quality hold up under a paying client's scrutiny (`capstone/feedback/round1_decision.md`, "Open questions").

## Phase 4 — Scale decision

A go/no-go/adjust decision, made from Phase 3's real data, not from this plan's assumptions. Out of scope for this document to pre-decide.

## What this plan deliberately does not do

- It does not commit to dates (`capstone/round2/cost-and-timeline.md` explains why).
- It does not assume Phase 3 succeeds — Phase 2's exit criterion exists specifically so a quality failure is caught before real clients see it, not after.
- It does not propose a hosting/infrastructure vendor decision — that remains `[TBD]` pending the cost inputs Phase 2 produces.
