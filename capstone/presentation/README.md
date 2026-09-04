# Presentation — Round 1

## Status

**The validated-stages slide deck is included:** [`MIRA_Ironhack_Presentation_Validated_Stages.pptx`](MIRA_Ironhack_Presentation_Validated_Stages.pptx) (22 slides). Slide 7 was updated and verified as part of this submission's own accuracy pass — its Creative Pipeline status now reads "LIVE-VERIFIED · Five demo references → Creative DNA → five-scene demo moodboard," reflecting the demo-local moodboard that actually rendered live (see `docs/ROUND1_VERIFICATION.md`); no other slide content, slide count, or design was changed. This README remains as a content-traceability outline: every point below links to the document in this repository that grounds it, so the deck's claims can be checked against real evidence.

**A second, newer deck export is also included:** [`MIRA_Ironhack_Presentation_Final.pdf`](MIRA_Ironhack_Presentation_Final.pdf) (15 pages). **This file is included as supplied and has two unresolved accuracy issues that should be corrected before this deck is presented or graded as final:**

1. **Page 10** labels "Google Calendar" as "VERIFIED" (date, location, one-day reminder). No Google Calendar integration exists anywhere in this codebase — this contradicts the documented, live-tested finding that MIRA's own shoot-schedule confirmation is **currently blocked**, not verified (`docs/ROUND1_VERIFICATION.md`).
2. **Page 13** capitions polished editorial/stock photography as "five connected editorial scenes — not generic AI images" produced by MIRA. MIRA's actual, live-verified moodboard output is a demo-local placeholder image (a labeled gradient graphic), not the photography shown — no real (non-demo) image generation has ever been run in this project (`capstone/round2/mvp-verification.md`).

Everything else in this file (Stripe, Resend, the demo moodboard's "five-scene demo moodboard" label, the honestly-caveated 4.2/5 evaluation score) is consistent with documented evidence.

## Suggested outline

1. **What MIRA is** — one-line positioning: verified client readiness plus a photographer-approved creative plan for remote photography sessions. See `../research/sector_research.md` §2, §5.

2. **The sector gap** — what's already solved (remote capture: Clos/Shutter-class tools; administration: CRMs) versus what isn't (verified readiness — static checklists don't verify anything). See `../research/sector_research.md` §1.

3. **What's already built** — the implemented flow from Stripe payment through readiness, with an honest per-stage status (live-verified / code-verified / under development / pending). See `../automation/automation_poc.md`.

4. **Who it's for** — three use cases (solo photographer, small studio, larger business). See `../research/use_cases.md`.

5. **What's measured** — the seven stakeholder metrics this project is designed to produce once live, and why each matters. See `../dashboard/dashboard_documentation.md`. State plainly that no dashboard artifact or live data exists yet.

6. **Monitoring approach** — the existing Ironhack LangSmith evaluation evidence, and the plan (not yet built) for a MIRA-specific trace. See `../monitoring/langsmith_monitoring.md`.

7. **Risks and open questions** — willingness to pay is unvalidated; the demo-local five-scene moodboard visibly rendered on a live preview, but real AI image generation remains unverified, as does voice quality. Email delivery is now live-verified (see `../evidence/staged_validation_evidence.md`), but that is one delivered invitation, not a volume or quality signal. State this directly rather than glossing over it. See `../research/opportunities_risks.md`.

8. **Recommendation** — KEEP, with explicit conditions for Round 2. See `../feedback/round1_decision.md`.

## Presenting honestly

Every "status" label used across this document set (live-verified / code-verified / under development / pending / not implemented) should be used consistently in the live presentation and in any slide content built from this outline. Do not describe a "code-verified" or "under development" item as "working" or "live" when presenting — the distinction is the point of this submission's evidence discipline, and collapsing it in slide form would misrepresent what has actually been verified.

## Known discrepancies between the supplied deck and this repository's documented evidence

The deck's text was extracted and reviewed against this repository's own verified evidence before finalizing this submission. Two points need attention before presenting:

1. **Slide 17 ("MIRA AI EVALUATION")** presents specific numbers — "4.2/5 · 5 cases · 0 failures," "Consistency 5/5," "Hallucination 3/5" — labeled "VERIFIED LAB EVIDENCE" from a "Custom MIRA LLM-as-judge" evaluation. This codebase's own repository search still finds no evaluation harness, LLM-as-judge rubric, or evaluation dataset inside it — **but the verified evaluation exists in a separate public repository**, [`mariacavali/lab-llms-grading-llms-mira`](https://github.com/mariacavali/lab-llms-grading-llms-mira), which records 5 cases, 0 failures and a 4.2/5 average, consistent with the slide's headline numbers. Slide 17's LangSmith claim — that LangSmith "traces AI stages, prompt version, latency, errors and token usage" for MIRA — remains **unconfirmed and should not be presented as real**: no LangSmith integration exists in this codebase or in the linked evaluation repository (zero matches for "langsmith"/"langchain" in either), and it is not separately evidenced anywhere. Slide 16 ("MIRA MONITORING"), by contrast, is honest about this — it labels the topic "EVIDENCE NEEDED." **Present the 4.2/5 · 5 cases · 0 failures numbers as verified (linking the evaluation repository above); do not present the LangSmith-tracing claim as real until it is separately evidenced.**
2. **Slide 9** shows a specific price, "PAYMENT €33.33 · MIRADEMO €0 test." €33.33/month is Maria's approved Round 1 demo price — this is confirmed, not a placeholder, and the slide's figure is accurate. `capstone/planning/cost_timeline.md` still documents pricing as `[TBD]` and has not been updated to reflect this approved figure as part of this accuracy-only correction; that file should be updated separately to say so explicitly.

Everything else reviewed in the deck (Stripe: previously live-verified, with the same commit/branch this repository records — not claimed as a currently continuous payment-to-account path; Resend: live-verified — branded invitation delivered, delivery webhook HTTP 200; the demo visual pipeline: live-verified — five demo references → Creative DNA → five-scene demo moodboard; voice: pending; calendar confirmation: currently blocked; n8n: labeled "PARTIAL" or "EVIDENCE NEEDED"; the dashboard slide labeled "PLANNED") is consistent with this repository's own documented status.

## Still to do

- [x] ~~Build the actual slide deck / presentation artifact~~ — supplied deck included (see Status above).
- [ ] Decide presentation format (live demo vs. recorded vs. static deck) — depends on whether a stable staging environment is available at presentation time.
- [ ] If a live demo is planned, confirm in advance which stages can actually be demonstrated (Stripe checkout, real Resend email delivery, and the private Shoot Room link are now live-verified and demonstrable; real moodboard generation is not, per `../automation/automation_poc.md`).
- [ ] Cross-check the deck's slide content against `../evidence/staged_validation_evidence.md` before presenting, since this outline was not used to author the supplied deck and has not been diffed slide-by-slide against it.
