# MIRA — Project 3

MIRA is a private, authenticated brand-recognition and creative-direction application. MIRA V4 is the current Project 3 Brand World path from structured creative evidence through Creative DNA to a five-image editorial moodboard. MIRA V3 remains an active, separate recognition product in the same codebase; it has not been superseded in routing or persistence.

## Peer Audit — Start Here

These documents provide factual system information for an independent audit and intentionally exclude the builder's own legal classification or compliance conclusions:

- [System brief for peer audit](MIRA_SYSTEM_BRIEF_FOR_PEER_AUDIT.md)
- [Architecture for audit](docs/MIRA_ARCHITECTURE_FOR_AUDIT.md)
- [AI and data inventory](docs/MIRA_AI_AND_DATA_INVENTORY.md)
- [Detailed technical handoff](docs/MIRA_TECHNICAL_HANDOFF_FOR_CODEX.md)
- [V4 current state](docs/MIRA_V4_CURRENT_STATE.md)

## What the application does

- MIRA V3 guides a user through meditation, adaptive reflection, a reviewable Mirror, and confirmation-gated Brand Soul and visual-direction deliverables.
- MIRA V4 turns structured brand context and Creative DNA into visual directions and a five-image campaign moodboard.
- Both surfaces use owner-scoped authentication and persistence. Their routes, tRPC namespaces, state machines, and database tables remain separate.

## Architecture

The product application uses React and Vite in `client/`, Express and tRPC in `server/`, shared TypeScript contracts in `shared/`, and Drizzle migrations for MySQL/TiDB in `drizzle/`. Model, image, storage, authentication, and optional provider integrations are server-side boundaries.

n8n is an optional automation boundary, not the application source of truth. The importable synthetic photographer/model-client lifecycle POC is documented in [`capstone/round2/n8n/`](capstone/round2/n8n/); it does not authenticate users, store payment instruments, send email, or replace MIRA persistence.

## Run locally

Requirements: Node.js and pnpm.

1. Install dependencies with `pnpm install`.
2. Create a local `.env` using the blank variable template in [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md). Never commit local credentials.
3. Configure the required database and platform services for your environment.
4. Apply database migrations with `pnpm db:push`.
5. Start development with `pnpm dev`.

Useful checks:

```bash
pnpm test
pnpm check
pnpm build
```

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
- [Sector research](capstone/research/sector_research.md), [opportunities & risks](capstone/research/opportunities_risks.md), [use cases](capstone/research/use_cases.md)
- [Dashboard metrics specification](capstone/dashboard/dashboard_documentation.md) — spec only; no dashboard artifact or live data exists yet
- [Automation POC](capstone/automation/automation_poc.md) — Stripe → activation → shoot → invitation → Resend → Shoot Room → preparation → readiness, with an honest per-stage verification status
- [LangSmith monitoring](capstone/monitoring/langsmith_monitoring.md) — existing Ironhack evaluation evidence, plus the (not-yet-built) plan for a MIRA-specific trace
- [Cost & timeline template](capstone/planning/cost_timeline.md) — assumptions-based; all real figures are placeholders pending approval
- [Round 1 decision](capstone/feedback/round1_decision.md) — current recommendation: **KEEP**
- [Presentation outline](capstone/presentation/README.md)

These documents make no claims about deployment status, customer adoption, or willingness to pay beyond what is explicitly verified elsewhere in this repository; unverified items are marked as such throughout.

## Security

Local `.env` files, credentials, dependencies, build output, logs, and private platform metadata are intentionally excluded from version control.
