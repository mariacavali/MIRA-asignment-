# Presentation — Round 1

## Status

**The validated-stages slide deck is included:** [`MIRA_Ironhack_Presentation_Validated_Stages.pptx`](MIRA_Ironhack_Presentation_Validated_Stages.pptx) (22 slides, supplied for this submission and copied in unmodified — verified by checksum match against the source file at copy time). This README remains as a content-traceability outline: every point below links to the document in this repository that grounds it, so the deck's claims can be checked against real evidence.

## Suggested outline

1. **What MIRA is** — one-line positioning: verified client readiness plus a photographer-approved creative plan for remote photography sessions. See `../research/sector_research.md` §2, §5.

2. **The sector gap** — what's already solved (remote capture: Clos/Shutter-class tools; administration: CRMs) versus what isn't (verified readiness — static checklists don't verify anything). See `../research/sector_research.md` §1.

3. **What's already built** — the implemented flow from Stripe payment through readiness, with an honest per-stage status (live-verified / code-verified / under development / pending). See `../automation/automation_poc.md`.

4. **Who it's for** — three use cases (solo photographer, small studio, larger business). See `../research/use_cases.md`.

5. **What's measured** — the seven stakeholder metrics this project is designed to produce once live, and why each matters. See `../dashboard/dashboard_documentation.md`. State plainly that no dashboard artifact or live data exists yet.

6. **Monitoring approach** — the existing Ironhack LangSmith evaluation evidence, and the plan (not yet built) for a MIRA-specific trace. See `../monitoring/langsmith_monitoring.md`.

7. **Risks and open questions** — willingness to pay is unvalidated; real moodboard-image and voice quality remain unverified. Email delivery is now live-verified (see `../evidence/staged_validation_evidence.md`), but that is one delivered invitation, not a volume or quality signal. State this directly rather than glossing over it. See `../research/opportunities_risks.md`.

8. **Recommendation** — KEEP, with explicit conditions for Round 2. See `../feedback/round1_decision.md`.

## Presenting honestly

Every "status" label used across this document set (live-verified / code-verified / under development / pending / not implemented) should be used consistently in the live presentation and in any slide content built from this outline. Do not describe a "code-verified" or "under development" item as "working" or "live" when presenting — the distinction is the point of this submission's evidence discipline, and collapsing it in slide form would misrepresent what has actually been verified.

## Known discrepancies between the supplied deck and this repository's documented evidence

The deck's text was extracted and reviewed against this repository's own verified evidence before finalizing this submission. Two points need attention before presenting:

1. **Slide 17 ("MIRA AI EVALUATION")** presents specific numbers — "4.2/5 · 5 cases · 0 failures," "Consistency 5/5," "Hallucination 3/5" — labeled "VERIFIED LAB EVIDENCE" from a "Custom MIRA LLM-as-judge" evaluation, and states LangSmith "traces AI stages, prompt version, latency, errors and token usage" for MIRA. **No such evaluation harness, LLM-as-judge rubric, evaluation dataset, or LangSmith integration exists anywhere in this codebase** — this was independently confirmed by a full-repository search (zero matches for "langsmith"/"langchain") during this project's own documentation work. This directly overlaps with two things this submission was explicitly told not to invent: MIRA-specific LangSmith tracing and real visual-generation evaluation results. Slide 16 ("MIRA MONITORING"), by contrast, is honest — it labels the same topic "EVIDENCE NEEDED" and asks for a dataset/experiment link or screenshots. **Do not present slide 17's numbers as real without first confirming their actual source with Maria; if no such evaluation was actually run, that slide should be corrected or removed before Round 1 is presented.**
2. **Slide 9** shows a specific price, "PAYMENT €33.33 · MIRADEMO €0 test." `capstone/planning/cost_timeline.md` documents all pricing as `[TBD]` placeholders per explicit instruction (no price has been approved). If €33.33 is a real, approved price point, `cost_timeline.md` should be updated to say so explicitly; if it is illustrative/placeholder, the slide should say that too. This submission has not changed `cost_timeline.md` to reflect €33.33, since doing so without confirmation would itself be inventing a cost figure.

Everything else reviewed in the deck (Stripe: live-verified with the same commit/branch this repository records; Resend/voice/moodboard/n8n: labeled "IN IMPLEMENTATION," "PARTIAL," or "EVIDENCE NEEDED"; the dashboard slide labeled "PLANNED") is consistent with this repository's own documented status.

## Still to do

- [x] ~~Build the actual slide deck / presentation artifact~~ — supplied deck included (see Status above).
- [ ] Decide presentation format (live demo vs. recorded vs. static deck) — depends on whether a stable staging environment is available at presentation time.
- [ ] If a live demo is planned, confirm in advance which stages can actually be demonstrated (Stripe checkout, real Resend email delivery, and the private Shoot Room link are now live-verified and demonstrable; real moodboard generation is not, per `../automation/automation_poc.md`).
- [ ] Cross-check the deck's slide content against `../evidence/staged_validation_evidence.md` before presenting, since this outline was not used to author the supplied deck and has not been diffed slide-by-slide against it.
