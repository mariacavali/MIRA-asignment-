# Sector Research — Remote Photography & Client Preparation

**Status:** Author analysis, grounded in this repository's implemented product and existing project documentation. This is not third-party market research and contains no external market-sizing, survey, or customer data.

**Source evidence used:** `README.md`, `MIRA_SYSTEM_BRIEF_FOR_PEER_AUDIT.md`, `docs/MIRA_AI_AND_DATA_INVENTORY.md`, `docs/MIRA_ARCHITECTURE_FOR_AUDIT.md`, `docs/MIRA_V3_CONSTITUTION.md`, `ideas.md`, `docs/stripe-integration.md`, `server/miraCore/coreKnowledge.ts`, `server/miraCore/router.ts`, `server/miraCore/moodboardAdapter.ts`, `server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/visualReferences.ts`, and the supplied research pack `capstone/research/Ironhack_Capstone_Recommendation_MIRA_Shoot_Compass.docx` (see Citations at the end of this document).

## 1. The sector this product sits in

MIRA is built for **remote/virtual photography sessions** — a photographer directs a shoot while the client operates their own smartphone camera, in a different physical location. This is the workflow the product's own runtime knowledge describes directly:

> "Remote photoshoots use Clos. The client participates with a smartphone... The photographer connects remotely... to photograph through the client's back smartphone camera." — `server/miraCore/coreKnowledge.ts`

Three adjacent, already-solved problems sit around this workflow. MIRA does not attempt to re-solve any of them:

### a) Remote camera capture is already solved
**CLOS**[1] and **SHUTTER**[2] are the two specific remote-photography capture platforms this research references. Both already solve the mechanical problem of a photographer directing a client's smartphone camera in real time — connection, live framing, remote shutter control, and delivery of the captured frames:

| | CLOS | SHUTTER |
|---|---|---|
| Remote model | Photographer controls the client's phone camera in a virtual room. | Client shares a generated session ID; photographer controls the session from a portal. |
| Capture | High-resolution JPG; RAW/ProRAW on paid plans; actual sensor capture (not a screen recording). | High-resolution JPEG and RAW. |
| Devices | Officially supports iPhone and Android. | iOS and Android listed on the official site; the US Apple App Store listing reviewed was iPhone-only. |
| Published pricing | Free tier; Pro plan reported at US$7.99/month. | Client app reported as free; professional-side pricing was not clearly public in the pages reviewed. |
| Public API/SDK | None found publicly documented. | None found publicly documented. |

These comparative facts are reported in the supplied research pack[2] and have not been independently re-verified by fetching the original vendor pages during this documentation pass — they are cited to that document, not re-confirmed first-hand. MIRA's own product knowledge explicitly names Clos as the capture layer it assumes[1] and does not implement camera capture, live video direction, or image capture itself anywhere in this codebase. MIRA has no camera-control code, no live-video-session code, and no capture-app integration code.

### b) CRMs solve forms, reminders, and administration
Photography CRMs (studio-management and client-management tools) already solve scheduling, contracts, invoicing, reminder emails, and client record-keeping. MIRA's own implemented email system (`server/email/`, `server/miraCore/router.ts`'s `sendInvitation`) deliberately reuses this same category of capability — adaptive reminder scheduling, delivery-status tracking, a private client link — rather than treating it as MIRA's point of differentiation. MIRA's invitation/reminder email pipeline is closer to a narrow, purpose-built CRM feature than to a new category of product.

### c) Static checklists do not verify client readiness
The pre-shoot "checklist" pattern (a static list of things to bring/do/charge) is common in photography workflows, and MIRA's own knowledge base includes exactly this kind of list (charged phone, stable internet, clean lens, required app/permissions, suitable environment — `server/miraCore/coreKnowledge.ts`). A static checklist can be *shown* to a client, but it cannot **verify** that the client has actually understood the creative direction, resolved uncertainty about wardrobe/location/mood, or is practically ready. It is a passive artifact, not a verification step. Nothing in a static checklist confirms the client is prepared; it only lists what preparedness would require.

## 2. Where MIRA's opportunity sits

MIRA's implemented product does not compete with remote-capture apps or CRMs. Its opportunity, as built, is the **verification and creative-preparation layer that sits between "invitation sent" and "camera rolls"**:

- A structured conversation (voice or text) with the client that gathers real creative-discovery evidence and a confirmable summary (`server/miraCore/realtime.ts`, `server/miraCore/router.ts`'s `confirmRealtimeSummary`), rather than a static form.
- A **photographer-approved creative plan**: the client's confirmed evidence and up to five visual references (`server/miraCore/visualReferences.ts`) are synthesized into a structured, versioned Creative DNA object and a five-image moodboard (`server/miraCore/creativeDnaAdapter.ts`, `server/miraCore/moodboardAdapter.ts`), which the photographer sees in their own dashboard before the shoot.
- A **readiness state** (`preparation_active` → completion, tracked in `mira_shoots.roomState` and `mira_client_invitations.deliveryStatus`) that is a real, gated system state — not a checkbox the client ticks themselves.

This is the specific, narrow gap identified from the implemented codebase: existing tools solve *capture* and *administration*, but nothing in the assumed toolchain (Clos[1], Shutter[2], CRMs, static checklists) verifies that the client and photographer arrive at the shoot with a shared, confirmed creative plan.

## 3. What MIRA is not

**MIRA does not replace the photographer.** Every creative artifact MIRA produces is explicitly framed as evidence and direction for the photographer to review, not a final creative decision made on the photographer's behalf:
- The moodboard is generated from the *photographer's own* profile, style, and shoot notes combined with the client's evidence (`buildShootCreativeDnaSource` in `server/miraCore/creativeDnaAdapter.ts`), and is visible on the **photographer's dashboard** for their own review (`getShootMoodboardForOwner`).
- The system prompt/product philosophy documented in `ideas.md` and `docs/MIRA_V3_CONSTITUTION.md` is explicit that the product "notices patterns" and "leaves responsibility with the user" rather than making decisions for anyone.
- MIRA has no code path that books a shoot, directs a camera, delivers final images, or interacts with a client without a photographer-owned shoot record behind it.

MIRA sits **inside** the photographer's existing workflow (their Stripe purchase, their client relationship, their shoot) as a preparation and readiness layer, not as a replacement for the photographer's judgment or the tools that already handle capture and administration.

## 4. What is not yet validated

- **Willingness to pay has not been validated.** This repository contains one verified €0.00 Stripe test transaction using a 100%-discount promotion code (`docs/stripe-integration.md`, "MIRADEMO Verification"). No paying customer, no real-price transaction, and no pricing research exists in this repository. Any statement about photographers' willingness to pay a specific price is unverified and requires direct validation with real photographers before Round 2.
- **No customer adoption or usage data exists.** There is no production deployment, no live user base, and no retention/engagement data in this repository. All adoption claims in this document set are explicitly out of scope and are not made.
- **Any scored or ranked assessment in this document set (see `opportunities_risks.md`) is the author's own analytical judgment**, produced by reasoning about the implemented product against the sector context above. It is not a market statistic, survey result, or third-party analyst report, and should not be read as one.

## 4a. Public data sources (identified, not yet analyzed)

The rest of this document is grounded in the implemented codebase and the supplied research pack, not in external public datasets. Per the brief's request for "public data (Kaggle, Hugging Face, etc.) relevant to your sector/size," two real, currently-available public datasets were identified as directly relevant to this sector/company-size context:

| Dataset | Platform | Relevance |
|---|---|---|
| [Freelance Contracts Dataset (1.3M entries)](https://www.kaggle.com/datasets/asaniczka/freelance-contracts-dataset-1-3-million-entries) | Kaggle | Freelance/independent-contractor market structure — directly relevant to MIRA's "independent photographer" segment (`capstone/round2/use-case-definition.md`, "Company"). |
| [Small Business Data](https://www.kaggle.com/datasets/anneezeh/small-business-data) | Kaggle | Small-business operating characteristics — relevant to the "small studio" use case (`capstone/research/use_cases.md`, Use case 2). |

**Honest status: identified, not downloaded, not analyzed.** No figure, statistic, or claim anywhere in this document set is drawn from either dataset — doing so without actually running the analysis would be inventing a result. This section exists so the gap is explicit rather than silently absent, and to name the concrete next step (download + analyze against the freelance/small-studio segmentation already used in `use_cases.md`) rather than leave "public data" unaddressed entirely. Portrait/face-image datasets on Hugging Face (e.g. computer-vision training sets for face segmentation or generation) were also reviewed and deliberately **not** cited here — they are training data for a different technical purpose (facial recognition/generation models) than MIRA's own image-generation approach (a general-purpose text-to-image API, not a fine-tuned face model — see `capstone/round2/eu-ai-act-assessment.md` §1, which confirms MIRA performs no biometric processing), and citing them would misrepresent what they're for.

## 5. Summary positioning statement

> MIRA's addressable opportunity is not "better remote photography" (Clos[1] and Shutter[2] already solve capture) or "better studio administration" (CRMs already solve that). It is the specific, currently-unverified gap between "invitation sent" and "camera rolls": confirming the client is genuinely prepared, and giving the photographer a creative plan they have reviewed and can trust, before the shoot begins.

## Citations

[1]: `server/miraCore/coreKnowledge.ts` — CLOS is named directly in MIRA's own product runtime knowledge as the assumed remote-capture layer ("Remote photoshoots use Clos."). This is a repository-code citation, independently verifiable in this codebase.

[2]: `capstone/research/Ironhack_Capstone_Recommendation_MIRA_Shoot_Compass.docx` (supplied research pack, authored 28 August 2026) — the source for SHUTTER as a named platform and for the CLOS/SHUTTER comparison table above (remote model, capture format, devices, pricing, public API availability). This document contains its own internal numbered citation markers (1–17) for these claims, but its "References" section was empty in the file as supplied — those underlying vendor/App Store sources are therefore not independently resolvable from this repository and have not been re-fetched or re-verified during this documentation pass. Confirmed by Maria (product owner) as accurate.
