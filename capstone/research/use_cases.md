# Use Cases

**Status:** Author-written scenarios describing how the *already-implemented* MIRA Core flow (private Shoot Room → visual references → Creative DNA → moodboard → photographer dashboard) applies to three different photography-business shapes. These are illustrative use cases derived from the product's real, implemented capabilities — they are not verified customer stories, testimonials, or adoption data. No named business, real client, or real transaction is referenced.

**Source evidence used:** `server/miraCore/router.ts`, `server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`, `server/miraCore/visualReferences.ts`, `client/src/pages/MiraShoot.tsx`, `client/src/pages/MiraShootRoom.tsx`, `docs/stripe-integration.md`.

**Selected use case for Round 1 focus: Use case 1 — Solo photographer.** All live-verification work this round (Stripe, Resend, the demo Shoot Room flow — see `docs/ROUND1_VERIFICATION.md`) was exercised against exactly this shape: one photographer, one client, one shoot. Use cases 2 and 3 remain illustrative extensions of the same implemented flow, not separately verified.

## Use case 1 — Solo photographer

**Shape:** One photographer, no assistants, books and manages every shoot personally, has limited time between paid sessions to chase client preparation.

**How the implemented flow applies:**
1. The photographer creates a shoot and sends one private invitation (`sendInvitation` in `server/miraCore/router.ts`), reusing the existing duplicate-send protection so a second click can't confuse the client with two links.
2. The client opens their one private Shoot Room link, uploads up to five visual references, and either talks to or texts MIRA to complete Discovery — no phone call or back-and-forth email from the photographer is required for this step.
3. Once the client confirms their summary, Creative DNA and a five-image moodboard are generated automatically and appear on the photographer's own dashboard (`getShootMoodboard` in `server/miraCore/router.ts`) before the shoot date.
4. The photographer reviews the moodboard once, at a time that suits them, instead of holding a live pre-shoot creative-direction call.

**Why this matters for a solo operator:** the time cost of pre-shoot creative alignment is the scarcest resource for a one-person business. The implemented flow moves that cost from a live, scheduled interaction into an asynchronous one the photographer reviews on their own time.

## Use case 2 — Small studio (2–5 photographers/coordinators)

**Shape:** A small studio with a booking coordinator and multiple shooting photographers; shoots are often booked by one person and shot by another.

**How the implemented flow applies:**
1. Every shoot, invitation, reference upload, Creative DNA record, and moodboard is stored per-shoot and scoped to the owning photographer account (`photographerUserId` scoping verified throughout `server/miraCore/db.ts`, `creativeDnaAdapter.ts`, and `moodboardAdapter.ts`, and directly tested for isolation in this project's own test suite).
2. Because the confirmed creative plan lives on the shoot record itself (not in the booking coordinator's head or a separate messaging thread), whichever photographer actually shoots the session can open the same shoot in the dashboard and see the same photographer-approved plan the coordinator originally reviewed.
3. The adaptive reminder-email sequence (`shared/miraEmailSequence.ts`) keeps the client on track between booking and shoot day without the coordinator needing to manually track and send reminders for every booking.

**Why this matters for a small studio:** the handoff between the person who books a shoot and the person who shoots it is a common failure point for creative-brief continuity. A persisted, shoot-scoped creative plan removes the dependency on a single person's memory or a side conversation.

## Use case 3 — Larger photography business (multiple locations or a high shoot volume)

**Shape:** A business running many remote shoots per week/month, where standardizing client preparation and reducing no-shows/underprepared sessions has a direct effect on studio throughput.

**How the implemented flow applies:**
1. Every invitation's delivery status (queued/sent/delivered/failed) and every shoot's readiness state are structured, queryable data (`mira_client_invitations.deliveryStatus`, `mira_shoots.roomState`), not something that has to be manually tracked shoot-by-shoot.
2. This is the direct foundation for the stakeholder metrics specified in `capstone/dashboard/dashboard_documentation.md` (preparation completion rate, readiness rate, average preparation time) — a higher-volume business is exactly the case where an aggregate view across many shoots becomes operationally valuable rather than a "nice to have."
3. The payment → account-activation → shoot-creation chain is fully automated end-to-end in code (see `capstone/automation/automation_poc.md`), which matters more as shoot volume grows and manual account provisioning stops scaling.

**Why this matters at higher volume:** the value of "verified readiness" compounds with volume — a single underprepared client costs one shoot's worth of time for a solo photographer, but an unmeasured pattern of underprepared clients costs measurable throughput for a business running many shoots. The dashboard metrics specified in this submission are aimed specifically at making that pattern visible.

## What is common to all three use cases

In every case, MIRA's role is the same: it verifies readiness and produces a photographer-reviewed creative plan **before** the shoot, using the client's own smartphone-capture workflow (assumed to be handled by a platform such as Clos or Shutter — see `capstone/research/sector_research.md` §1a and its citations) and the photographer's own account and business relationship. MIRA does not book the capture session, does not replace the photographer's creative judgment, and does not verify or estimate what any of these businesses would actually pay for it — see `capstone/research/sector_research.md` §4 and `capstone/research/opportunities_risks.md` for the explicit limits of what is validated.
