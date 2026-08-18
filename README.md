# MIRA — Project 3

MIRA is a private, authenticated brand-recognition and creative-direction application. This repository contains the Project 3 implementation and verification evidence for the MIRA V3 journey, alongside the separately isolated V4 creative-direction surface that shares the same application platform.

## What the application does

- MIRA V3 guides a user through meditation, adaptive reflection, a reviewable Mirror, and confirmation-gated Brand Soul and visual-direction deliverables.
- MIRA V4 turns structured brand context and Creative DNA into visual directions and a five-image campaign moodboard.
- Both surfaces use owner-scoped authentication and persistence. Their routes, tRPC namespaces, state machines, and database tables remain separate.

## Architecture

The product application uses React and Vite in `client/`, Express and tRPC in `server/`, shared TypeScript contracts in `shared/`, and Drizzle migrations for MySQL/TiDB in `drizzle/`. Model, image, storage, authentication, and optional provider integrations are server-side boundaries.

n8n is not part of the current application architecture, and no n8n workflow export is included. The implemented workflow is encoded in the application routers, services, state transitions, and database schema.

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

## Deployment and demo limitations

The verified environment was private staging, not a public deployment. Provider credentials and service availability are required for live model, image, storage, OAuth, and optional birth-context integrations. Known boundaries—including disabled optional modules, the placeholder welcome video, and external image-provider availability—are documented in the status and handoff files.

## Security

Local `.env` files, credentials, dependencies, build output, logs, and private platform metadata are intentionally excluded from version control.
