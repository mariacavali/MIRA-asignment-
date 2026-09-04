# Round 1 Decision

## Current recommendation

> **KEEP — remote photography sector and MIRA readiness/creative-preparation use case.**

## Basis for this recommendation

This recommendation is based on the implementation evidence gathered across this repository and summarized in `capstone/research/sector_research.md` and `capstone/research/opportunities_risks.md`:

- The specific gap MIRA targets — verified client readiness plus a photographer-approved creative plan, sitting between already-solved remote-capture tools (Clos/Shutter-class apps) and already-solved CRM/administration tools — is real, narrow, and not already solved by the assumed toolchain.
- A meaningful share of the technical pipeline for this use case is already implemented and tested: private Shoot Room, bounded visual-reference upload, Creative DNA synthesis, moodboard generation, adaptive email reminders, and a Stripe-verified payment path.
- MIRA does not replace the photographer — every output is framed as evidence and direction for the photographer's own review, which keeps the product inside the photographer's existing workflow rather than competing with their judgment.

## What this recommendation explicitly does not claim

- It does not claim willingness to pay has been validated. It has not — see `capstone/research/sector_research.md` §4 and `capstone/research/opportunities_risks.md` §2.
- It does not claim any customer adoption, retention, or usage data exists. None exists.
- It does not claim the full pipeline has been run end-to-end with real data (real email delivery, real database-backed visual generation, real voice conversation). It has not — see `capstone/automation/automation_poc.md`.
- It is not based on any third-party market research, survey, or analyst report. All scoring in `capstone/research/opportunities_risks.md` is explicitly labeled as the author's own analysis.

## Open questions this recommendation depends on validating before Round 2

1. Will photographers actually pay for verified readiness + a creative plan, at any price point?
2. Does real (non-demo) moodboard image quality hold up against a real photographer's review standard?
3. Does the voice conversation work reliably enough for a real client to complete Discovery unassisted?
4. Does real Resend email delivery reach real inboxes reliably (not just queue/send successfully)?

## What Round 2 will deepen, and the first MVP scope idea

Round 2 does not change the industry or use case (decision remains **KEEP**, unchanged). It deepens exactly the gaps this Round 1 evidence already names as open, in this order:

1. **Real (non-demo) generation quality and cost.** The visual pipeline (Creative DNA + five-scene moodboard) is now live-verified end-to-end in demo mode — five references in, five ordered moodboard scenes out, readiness correctly gated — but every asset shown so far is a local placeholder, not real AI output. The first concrete Round 2 step is running one real generation pass (real `OPENAI_API_KEY`, synthetic shoot data, no real client) to answer whether quality and per-shoot cost are good enough to show a paying client.
2. **The two concrete blockers found during Round 1's own live-verification pass:** a Calendar-confirmation bug (reproducible "couldn't save your response" error) and unverified live voice conversation. Both are named, scoped engineering tasks, not open research questions.
3. **Compliance groundwork.** A preliminary, non-legal EU AI Act classification and GDPR DPIA were produced during Round 2 preparation, surfacing real gaps (most personal-data categories have no retention/deletion policy yet, only realtime transcripts do) that should close before any real pilot, not after.

**First MVP scope idea for Round 2:** a small (single-digit), consenting photographer pilot — real Stripe transaction at a real (non-€0.00) price, real invitations to real clients, voice conversation exercised live for the first time, and the seven already-specified dashboard metrics (`capstone/dashboard/dashboard_documentation.md`) instrumented against real pilot data for the first time. This is deliberately narrow: it is designed to produce the two data points this recommendation is currently missing — real willingness-to-pay signal, and real generation-quality judgment from an actual paying client's photographer — not to scale the product. Full detail: `capstone/round2/strategic-deployment-plan.md`.

---

## Teaching staff feedback

**Not yet received as of this document.** Recorded honestly rather than filled in with invented commentary — see `capstone/round2/README.md`'s status discipline, which governs this document equally.

- `[PLACEHOLDER]` — no dated instructor comment exists yet to summarize.
- `[PLACEHOLDER]`
- `[PLACEHOLDER]`

| Date | Reviewer | Feedback | Response/action |
|---|---|---|---|
| `[TBD]` | `[TBD]` | `[PLACEHOLDER — no feedback received yet]` | `[TBD]` |

## Class / peer feedback

**Not yet received as of this document.**

- `[PLACEHOLDER]` — no dated peer comment exists yet to summarize.
- `[PLACEHOLDER]`
- `[PLACEHOLDER]`

| Date | Reviewer | Feedback | Response/action |
|---|---|---|---|
| `[TBD]` | `[TBD]` | `[PLACEHOLDER — no feedback received yet]` | `[TBD]` |

---

*This document should be updated with real feedback as it is received, and the recommendation revisited if feedback surfaces evidence not already reflected in `capstone/research/opportunities_risks.md`.*
