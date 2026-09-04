# MIRA — Project 3 & Ironhack Capstone

MIRA is a private, authenticated brand-recognition and creative-direction application. This repository now contains three separate, data-isolated product surfaces that share the same codebase but not the same routes, tables, or state:

- **MIRA Core (the Ironhack Capstone product)** — a photographer's Stripe-paid dashboard, a private per-shoot "Shoot Room" link for the client, bounded visual-reference upload, a Discovery conversation, and a resulting Creative DNA + five-image moodboard the photographer reviews before the shoot. This is the product documented in [`capstone/`](capstone/) (see the Capstone Round 1 section below) and is the most recently and actively developed surface.
- **MIRA V4** — the Project 3 Brand World path from structured creative evidence through Creative DNA to a five-image editorial moodboard, for an individual founder/creator building their own brand.
- **MIRA V3** — an active, separate recognition product in the same codebase; it has not been superseded in routing or persistence.

## Peer Audit — Start Here

These documents provide factual system information for an independent audit and intentionally exclude the builder's own legal classification or compliance conclusions:

- [System brief for peer audit](MIRA_SYSTEM_BRIEF_FOR_PEER_AUDIT.md)
- [Architecture for audit](docs/MIRA_ARCHITECTURE_FOR_AUDIT.md)
- [AI and data inventory](docs/MIRA_AI_AND_DATA_INVENTORY.md)
- [Detailed technical handoff](docs/MIRA_TECHNICAL_HANDOFF_FOR_CODEX.md)
- [V4 current state](docs/MIRA_V4_CURRENT_STATE.md)

## What the application does

- **MIRA Core** — a photographer creates an account (Stripe-verified purchase), creates a shoot, and sends one private client link. The client opens that link, uploads up to five visual references, and completes a Discovery conversation (voice or text) with MIRA. Once confirmed, MIRA synthesizes a structured Creative DNA record and a five-image moodboard, which the photographer reviews on their own dashboard before the shoot. See `capstone/automation/automation_poc.md` for the exact, honestly-labeled verification status of every stage of this flow.
- MIRA V3 guides a user through meditation, adaptive reflection, a reviewable Mirror, and confirmation-gated Brand Soul and visual-direction deliverables.
- MIRA V4 turns structured brand context and Creative DNA into visual directions and a five-image campaign moodboard.
- All three surfaces use owner-scoped authentication and persistence. Their routes, tRPC namespaces, state machines, and database tables remain separate.

## Architecture

The product application uses React and Vite in `client/`, Express and tRPC in `server/`, shared TypeScript contracts in `shared/`, and Drizzle migrations for MySQL/TiDB in `drizzle/`. Model, image, storage, authentication, and optional provider integrations are server-side boundaries.

n8n is an optional automation boundary, not the application source of truth. Two real, importable, inactive-by-default n8n workflow exports exist at [`workflows/`](workflows/) for MIRA's client email-milestone scheduling — documented in [`capstone/automation/n8n_automation_poc.md`](capstone/automation/n8n_automation_poc.md) and [`docs/n8n-email-sequence-setup.md`](docs/n8n-email-sequence-setup.md); neither authenticates users, stores payment instruments, sends email itself, or replaces MIRA persistence.

## Run locally

Requirements: Node.js and pnpm. **This is a TypeScript/Node.js project, not Python — there is no `requirements.txt`; [`package.json`](package.json) (locked by [`pnpm-lock.yaml`](pnpm-lock.yaml)) is the equivalent dependency manifest.**

1. Install dependencies with `pnpm install`.
2. Create a local `.env` using the blank variable template in [`.env.example`](.env.example) (or the fuller reference at [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md)). Every line in `.env.example` is a bare variable name or a non-secret default — never a real value. Never commit local credentials.
3. Configure the required database and platform services for your environment.
4. Apply database migrations with `pnpm db:push`.
5. Start development with `pnpm dev`.

Useful checks:

```bash
pnpm test
pnpm check
pnpm build
```

## Demo walkthrough (MIRA Core)

This is the real click-path through the implemented MIRA Core flow once the app is running locally. It requires `DATABASE_URL` for a real database, or `MIRA_LOCAL_FILE_STORE=true` for the local/demo persistence path (which has full coverage for accounts, shoots, invitations, and Stripe test mode, but not yet for Creative DNA/moodboard generation — see `capstone/automation/automation_poc.md`).

1. **Create a photographer account** at `/mira/signup` (or `/mira/login` if one exists), then complete onboarding at `/mira/onboarding`.
2. **Activate payment** — in local/test mode this uses the local test-checkout path; in Stripe mode it uses the hosted Stripe Checkout link, verified end-to-end in `docs/stripe-integration.md`.
3. **Create a shoot** from `/mira/dashboard`, then open it at `/mira/shoots/:shootId`.
4. **Send the client invitation** — this creates the private Shoot Room link and (if `RESEND_API_KEY` is configured) attempts real email delivery; otherwise the link is available to copy directly from the dashboard.
5. **Open the private Shoot Room** at `/prepare/:token` as the client would. Upload up to five visual references, then start the Discovery conversation.
6. **Confirm Discovery** — this triggers Creative DNA and moodboard generation. Without a configured `OPENAI_API_KEY`, this produces clearly-labeled demo/placeholder output (no external API is called); with a real key and a real database, it produces real generated output.
7. **Review the result** back on the photographer's dashboard (`getShootMoodboard`) and in the client's Shoot Room (`MoodboardGallery`).

For the exact, currently-verified status of each of these steps (live-verified / code-verified / pending), see `capstone/automation/automation_poc.md` and `capstone/evidence/staged_validation_evidence.md` rather than assuming every step above has been exercised live. Steps 1–2 and the invitation/Shoot Room link in step 5 are live-verified (branch `fix/mira-stable-resend-email`, commit `8d6d2f8f755b1efbb1265a59500dea995a44c8d2`, preview `https://pc-6fh5ovldu7pa.manus.host`); steps 6–7 (Creative DNA/moodboard generation) are code-verified only (branch `codex/mira-visual-stage3`, commit `90baaff9b9930bc82f0e6e93129d97ee350ce641`) and have not been run live.

## Key deliverables

- `client/` — MIRA product interface
- `server/` — authenticated workflows, model/provider adapters, persistence, PDF generation, and tests
- `shared/` — shared schemas and campaign contracts
- `drizzle/` — database schema and migrations
- `docs/` — architecture, implementation, prompt, environment, and validation documentation
- `evidence/` — connected journey screenshots and generated-output evidence
- [`MIRA_V3_STAGING_STATUS.md`](MIRA_V3_STAGING_STATUS.md) — concise V3 status and verification summary
- [`FINAL_PRIVATE_MVP_VERIFICATION.md`](FINAL_PRIVATE_MVP_VERIFICATION.md) — consolidated acceptance evidence

## Repository Map

- `client/` — React/Vite routes and user interfaces for V3, V4, and the partial level-based extension
- `server/` — Express/tRPC APIs, owner-scoped workflows, model/provider adapters, storage, PDF generation, and tests
- `shared/` — shared schemas and deterministic campaign contracts
- `drizzle/` — MySQL/TiDB schema, relations, and migrations
- `docs/` — current-state, architecture, prompt, environment, provider, and validation documentation
- `evidence/` — connected V3 journey screenshots, PDFs, transcript material, and validation records
- `capstone/` — Ironhack Capstone Round 1 submission package (research, dashboard spec, automation POC, monitoring, planning, feedback, presentation, and staged validation evidence) — see the Capstone Round 1 section below

## Current Status

- **Implemented:** V3 recognition and confirmed document outputs; V4 Brand World journey, structured Creative DNA, initial visual directions, one refinement, and final five-image moodboard generation.
- **Partial:** the `/mira-1` Level 1/Level 2 extension, optional Notion retrieval, provider-dependent live revalidation, and some schema-declared V4 stages without customer-facing implementations.
- **Optional:** V3 Dakidarts numerology context and consent-gated reference-image analysis.
- **Not implemented:** an active Human Design provider, automatic V3-to-V4 data transfer, V4 Brand Book/PDF export, or production n8n integration. A synthetic, local-only n8n POC is included for assignment evidence.
- **Legacy/retained:** older route and field names remain for compatibility; current behavior should be verified from client routing, tRPC procedures, schemas, and tests rather than inferred from names alone.

Useful evidence includes the [V3 screenshot/PDF journey](evidence/journey-30001/), the [V3 transcript package](evidence/journey-60001/), and the [V4 refinement validation](docs/V4_REFINEMENT_RETRY_VALIDATION.md).

## Deployment and demo limitations

The verified environment was private staging, not a public deployment. Provider credentials and service availability are required for live model, image, storage, OAuth, and optional birth-context integrations. Known boundaries—including disabled optional modules, the placeholder welcome video, and external image-provider availability—are documented in the status and handoff files.

## Capstone Round 1 — Ironhack Submission

The Round 1 business/research submission documents live in [`capstone/`](capstone/) and are separate from the application code above — they do not affect and are not affected by anything else in this README. Start with the checklist:

- [Round 1 submission checklist](capstone/ROUND1_SUBMISSION_CHECKLIST.md) — status of every requirement (complete/partial/pending)
- [Sector research](capstone/research/sector_research.md) (with the supplied research pack, [`Ironhack_Capstone_Recommendation_MIRA_Shoot_Compass.docx`](capstone/research/Ironhack_Capstone_Recommendation_MIRA_Shoot_Compass.docx)), [opportunities & risks](capstone/research/opportunities_risks.md), [use cases](capstone/research/use_cases.md)
- [Dashboard metrics specification](capstone/dashboard/dashboard_documentation.md) — includes a real, static dashboard artifact, [`dashboard.html`](capstone/dashboard/dashboard.html) (the agreed alternative to a PowerBI/.pbix file), with all 7 stakeholder metrics shown in an honest "no production data yet" state — no fabricated numbers
- [Automation POC](capstone/automation/automation_poc.md) — Stripe → activation → shoot → invitation → Resend → Shoot Room → preparation → readiness, with an honest per-stage verification status; the real, importable n8n workflow exports are documented separately in [`capstone/automation/n8n_automation_poc.md`](capstone/automation/n8n_automation_poc.md)
- [LangSmith monitoring](capstone/monitoring/langsmith_monitoring.md) — existing Ironhack evaluation evidence, clearly labeled as a separate course experiment, plus a now-built (not yet run for real) [MIRA-specific monitoring sample](capstone/langsmith/README.md)
- [Cost & timeline](capstone/planning/cost_timeline.md) — an explicitly-labeled illustrative worked example (assumptions table, resulting estimate, rough timeline) alongside the detailed placeholder-based template; no figure is presented as a confirmed real price
- [Round 1 decision](capstone/feedback/round1_decision.md) — current recommendation: **KEEP**, including what Round 2 deepens and the first MVP scope idea
- [Presentation](capstone/presentation/README.md) — includes the supplied deck, [`MIRA_Ironhack_Presentation_Validated_Stages.pptx`](capstone/presentation/MIRA_Ironhack_Presentation_Validated_Stages.pptx)
- [Staged validation evidence](capstone/evidence/staged_validation_evidence.md) — per-stage git branch/commit references and test results
- [Round 1 verification (latest checkpoint)](docs/ROUND1_VERIFICATION.md) — the most recent live-verification pass, superseding older per-stage status language below where they differ

These documents make no claims about deployment status, customer adoption, or willingness to pay beyond what is explicitly verified elsewhere in this repository; unverified items are marked as such throughout.

### Verified checkpoints referenced by the Round 1 evidence

| Layer | Branch | Commit | Status |
|---|---|---|---|
| Stripe payments | `fix/mira-final-ux-runtime` | `e2e99e1f47c5d749d6ca91281e24c00a51f10931` | Previously live-verified |
| Resend email delivery | `fix/mira-stable-resend-email` | `8d6d2f8f755b1efbb1265a59500dea995a44c8d2` | Previously live-verified — preview `https://pc-6fh5ovldu7pa.manus.host` |
| Visual preparation pipeline | `codex/mira-visual-stage3` | `90baaff9b9930bc82f0e6e93129d97ee350ce641` | Code-verified; superseded by the row below |
| Combined Resend + visual checkpoint | `fix/mira-resend-visual-integration` | `b1e44b8bca5dd195f632356a49bdad92fd099abc` | Code-verified combination only |
| **Isolated-preview deployment (latest)** | `fix/mira-resend-visual-integration` | `6cf6b97c6dee65adc048d306b1131e691250f10a` | **Live-verified** — live Shoot Room, five demo references, Creative DNA/preparation, five demo moodboard scenes, and Ready to Shoot all confirmed live; Calendar confirmation currently blocked; voice remains pending. See `docs/ROUND1_VERIFICATION.md`. |

Full detail, including exact test counts and what remains pending for each row, is in [`capstone/evidence/staged_validation_evidence.md`](capstone/evidence/staged_validation_evidence.md) and [`docs/ROUND1_VERIFICATION.md`](docs/ROUND1_VERIFICATION.md).

## Capstone Round 2 — Consulting Package

The Round 2 consulting package lives in [`capstone/round2/`](capstone/round2/), built around the existing MVP above without rebuilding or redesigning it. Start with [`capstone/round2/README.md`](capstone/round2/README.md), which indexes: use-case definition, early-PoC documentation, current MVP verification status, a no-invented-numbers ROI/risk assessment, a preliminary EU AI Act classification, a preliminary GDPR DPIA, a four-phase evidence-gated deployment plan, an evaluation/monitoring rollup, a cost/timeline update, and a presentation outline.

## Security

Local `.env` files, credentials, dependencies, build output, logs, and private platform metadata are intentionally excluded from version control.
