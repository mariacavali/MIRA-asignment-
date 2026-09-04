# Use-Case Definition — Round 2

**Status:** Author-written definition, grounded in the implemented product and Round 1's own research (`capstone/research/sector_research.md`, `capstone/research/use_cases.md`). Not third-party market research.

## Sector

**Creative services / remote photography.** Specifically, remote/virtual photography sessions where a photographer directs a shoot while the client operates their own smartphone camera in a different physical location — the workflow MIRA's own product knowledge names directly (`server/miraCore/coreKnowledge.ts`: "Remote photoshoots use Clos... The photographer connects remotely... to photograph through the client's back smartphone camera.").

## Company

**Independent photographers and small studios** offering remote sessions — a single-operator business up through a small team (a booking coordinator plus a handful of shooting photographers). Not a large studio chain, not an in-person-only photography business, and not a company that builds its own remote-capture tooling (MIRA assumes an existing platform such as Clos or Shutter handles the capture itself — see `capstone/research/sector_research.md` §1a).

## Problem

**Repeated client preparation and uncertainty.** Before every remote shoot, the photographer currently re-explains the same things by message or call: what to expect, what to wear, what mood/direction the shoot is going for, and what practically needs to be ready (device, lighting, space). Clients arrive at the shoot uncertain about the process and the creative direction, which costs the photographer time before every single session and creates avoidable underpreparedness on shoot day. A static checklist can be shown to a client but cannot *verify* they actually understood the direction or resolved their own uncertainty — it is a passive artifact, not a verification step (`capstone/research/sector_research.md` §1c).

## Stakeholders

| Stakeholder | Interest |
|---|---|
| **Photographer** | Wants less repeated, unpaid pre-shoot preparation work; wants a client who arrives genuinely ready; wants final creative say over any AI-produced direction before it reaches the client. |
| **Client** | Wants to understand what's expected of them and to feel that their preferences and constraints were actually heard, without a lengthy live call. |
| **MIRA operator (Maria)** | Wants a validated, narrow product wedge — verified readiness plus a photographer-approved creative plan — that photographers will actually pay for. |
| **Ironhack teaching staff / reviewers** | Need an honest, evidence-traceable account of what is verified versus designed, per the capstone's own evidence discipline. |

## In scope

- One photographer's paid account, one client, one shoot, one private link.
- Structured client preparation: up to five visual references, a Discovery conversation (voice or text fallback), a confirmed summary.
- Synthesis of that evidence plus the photographer's own brief into a structured **Creative DNA** object and a five-scene moodboard.
- A photographer-reviewed **readiness** state (`ready_to_shoot`) that only activates once the above has actually completed — a real gated system state, not a self-reported checkbox.
- Transactional email (invitation, reminders) with real delivery-status tracking.
- Payment: one Stripe-verified purchase path for the photographer's own access.

## Out of scope

- Remote camera capture itself (assumed to be handled by a third-party platform such as Clos or Shutter — MIRA has no camera-control or live-video code).
- Studio administration, invoicing, and contract management (the domain of existing photography CRMs).
- Final image delivery, editing, or post-production.
- Booking/scheduling logistics beyond the shoot record MIRA already holds (no calendar-provider integration is live-verified — see `capstone/round2/mvp-verification.md`).
- Any claim of validated pricing, adoption, or retention — none of this exists yet (see `capstone/round2/roi-and-risk-assessment.md`).
- Real, non-demo image generation and real, live-verified voice conversation are implemented in code but explicitly out of this round's verified-evidence scope — see `mvp-verification.md`.

## Measurable success criteria

These are the metrics the product is designed to produce once real usage exists — none has a real value yet (no production deployment, no live users). Full definitions, source tables, and calculation logic are specified in `capstone/dashboard/dashboard_documentation.md`; restated here as the success criteria this use case is judged against:

1. **Invitation delivery rate** — share of sent invitations confirmed delivered by the email provider (not just "sent").
2. **Preparation completion rate** — share of invited clients who complete Discovery and reach a completed room state.
3. **Readiness rate** — share of shoots that reach `ready_to_shoot` before the scheduled date.
4. **Average preparation time** — elapsed time from invitation sent to preparation completed.
5. **Payment-to-active-account conversion rate** — share of started Stripe checkouts that convert to an active paid account.

A sixth, qualitative criterion specific to Round 2: **photographer acceptance of the generated Creative DNA/moodboard without requiring regeneration** — this has no source table yet because no real (non-demo) generation run has occurred; it is listed here as a target metric to instrument once real generation is exercised (see `capstone/round2/evaluation-and-monitoring.md`).

## What this use case explicitly does not claim

Consistent with every other document in this repository's evidence set: this document does not claim willingness to pay has been validated, does not claim any customer adoption exists, and does not claim the full flow has been exercised end-to-end with a real paying client. See `capstone/round2/mvp-verification.md` for the exact, current verification status of each stage.
