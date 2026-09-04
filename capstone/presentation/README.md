# Presentation — Round 1

## Status

**No slide deck or recorded presentation exists in this repository.** This file is a content outline for building one, sourced entirely from the other documents in `capstone/`. It contains no new claims — every point below links to the document that grounds it.

## Suggested outline

1. **What MIRA is** — one-line positioning: verified client readiness plus a photographer-approved creative plan for remote photography sessions. See `../research/sector_research.md` §2, §5.

2. **The sector gap** — what's already solved (remote capture: Clos/Shutter-class tools; administration: CRMs) versus what isn't (verified readiness — static checklists don't verify anything). See `../research/sector_research.md` §1.

3. **What's already built** — the implemented flow from Stripe payment through readiness, with an honest per-stage status (live-verified / code-verified / under development / pending). See `../automation/automation_poc.md`.

4. **Who it's for** — three use cases (solo photographer, small studio, larger business). See `../research/use_cases.md`.

5. **What's measured** — the seven stakeholder metrics this project is designed to produce once live, and why each matters. See `../dashboard/dashboard_documentation.md`. State plainly that no dashboard artifact or live data exists yet.

6. **Monitoring approach** — the existing Ironhack LangSmith evaluation evidence, and the plan (not yet built) for a MIRA-specific trace. See `../monitoring/langsmith_monitoring.md`.

7. **Risks and open questions** — willingness to pay is unvalidated; real image/voice/email delivery quality is unverified. State this directly rather than glossing over it. See `../research/opportunities_risks.md`.

8. **Recommendation** — KEEP, with explicit conditions for Round 2. See `../feedback/round1_decision.md`.

## Presenting honestly

Every "status" label used across this document set (live-verified / code-verified / under development / pending / not implemented) should be used consistently in the live presentation and in any slide content built from this outline. Do not describe a "code-verified" or "under development" item as "working" or "live" when presenting — the distinction is the point of this submission's evidence discipline, and collapsing it in slide form would misrepresent what has actually been verified.

## Still to do

- [ ] Build the actual slide deck / presentation artifact (not started).
- [ ] Decide presentation format (live demo vs. recorded vs. static deck) — depends on whether a stable staging environment is available at presentation time.
- [ ] If a live demo is planned, confirm in advance which stages can actually be demonstrated (Stripe checkout and the private Shoot Room UI are the most demonstrable today; real email delivery and real moodboard generation are not, per `../automation/automation_poc.md`).
