# PoC Documentation — Round 2 (Index)

**This is a discoverable-filename index, required by the official Ironhack Round 2 submission page.** It does not duplicate or rewrite content — the complete, canonical documents are linked below, reused unchanged.

## Summary

Proof-of-concept status for MIRA's automated stages: the AI journey pipeline (readiness confirmation, Creative DNA, moodboard) and the n8n client-email-milestone automation, each with a live-verified / code-verified / pending status per component.

## Full documents

- → [`poc-documentation.md`](poc-documentation.md) — main PoC write-up
- → [`../automation/n8n_automation_poc.md`](../automation/n8n_automation_poc.md) — n8n automation PoC detail
- → [`../../workflows/mira-client-email-sequence.json`](../../workflows/mira-client-email-sequence.json) — n8n workflow export (client email milestones)
- → [`../../workflows/mira-email-outbox-trigger.json`](../../workflows/mira-email-outbox-trigger.json) — n8n workflow export (scheduled outbox trigger)
- → [`../../docs/n8n-email-sequence-setup.md`](../../docs/n8n-email-sequence-setup.md) — setup/import instructions for both exports

## Explicit limitations (unchanged from the canonical documents this package cites)

- Real LangSmith traces: **pending** — the MIRA-specific monitoring sample is built and ready but has not been run against real credentials (`capstone/langsmith/README.md`, `evaluation-and-monitoring.md`).
- The supplied video (`evidence/MIRA_Ironhack_Demo_Final.mp4`) is a presentation recording — **not verified live n8n execution** or a confirmed app screen-recording (`evidence/README.md`).
- Voice conversation and real (non-demo) AI image generation: **pending** — never exercised live in this project (`mvp-verification.md`).
- Teaching staff / class feedback: **pending** — not yet received (`../feedback/round1_decision.md`).
- The n8n workflow exports are real and importable but inactive by default and have only been exercised with synthetic webhook payloads during testing — not a production integration on their own (`docs/MIRA_AI_AND_DATA_INVENTORY.md`).
