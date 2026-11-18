# MIRA local development

Start with [LOCAL_SETUP.md](LOCAL_SETUP.md) for the verified branch, a provider-free local run, database setup, and secure handover instructions.

MIRA is a TypeScript application with a React/Vite client, Express/tRPC server, shared TypeScript contracts and Drizzle migrations for MySQL-compatible databases. This repository contains several MIRA experiences and isolated research/review tools; the primary app starts with the commands below. Feature flags default off. Local setup does not configure or change production.

## Requirements

- Node.js 22.12 or newer (see `package.json`)
- pnpm 10.4.1 (pinned in `package.json`)
- Git
- A MySQL-compatible database (MySQL/TiDB) for the main app; do not point local development at production
- Optional provider accounts only for the corresponding integrations (Forge, OpenAI, Pinecone, Resend, Stripe, Notion, Dakidarts)

## Clone and install

```sh
git clone --branch codex/mira-agent-foundation https://github.com/mariacavali/MIRA-asignment-.git
cd MIRA-asignment-
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

On Windows, use PowerShell's `Copy-Item .env.example .env` instead of `cp`.

## Configure

Open `.env` and set only the values needed for your local task. See [Environment variables](docs/ENVIRONMENT_VARIABLES.md) for purpose, required/optional status, and credential sources. Never commit `.env` or paste credentials into issues or chat. `.env.example` is safe to commit and contains blank credential values and disabled feature flags.

For the base application, configure a dedicated local `DATABASE_URL`, `JWT_SECRET`, and platform OAuth/app values if your login flow requires them. Generate a new local JWT secret; never copy a production secret. Provider credentials are optional unless you enable the matching feature. Set local payment mode to `local`. Keep all paid/live integrations and feature flags disabled during ordinary setup.

## Database

Use a new disposable local MySQL-compatible database. Review `drizzle.config.ts` and migrations before applying them. `pnpm db:push` generates and applies migrations and can alter the configured database: verify `DATABASE_URL` points only to the disposable local database before running it. Existing migrations include legacy product tables and newer coach/knowledge tables. Do not run against an unknown or production database.

## Run

```sh
pnpm dev
```

The server starts on port 3000 by default (`PORT` can change it); Vite serves the client through the development server integration. Open the local URL printed in the terminal. To build production assets locally, use `pnpm build`; this does not deploy them.

Useful project commands (run only when you choose to validate a change):

```sh
pnpm check
pnpm test
pnpm build
```

The database, PDF and live-provider tests have opt-in gates. Do not enable them against production services. PDF extraction helpers require Python and the packages listed in `scripts/requirements-mira-pdf.txt`; see `scripts/LOCAL_BOOK_TOOLS.md` for the isolated local setup. These tools do not download or include private source books.

## Local-only review tools

Some scripts start isolated review applications on loopback ports and use local socket databases under ignored `.mira-local-data/`. Read each script's documentation before running it. In particular, the connected coach review and Pinecone conversation scripts can make provider calls when explicitly approved/configured; opening a page alone does not authorize such calls. Do not run duplicate services on occupied ports.

## Private files and credentials

`.env`, databases, `.mira-local-data/`, local Python environments and source PDFs are excluded from Git. Transfer required credentials through a password manager or the provider's own secure sharing process. Obtain fresh development credentials from each provider's console; do not reuse production credentials. Private book/source files must be transferred separately only where permitted. They are not needed to install or run the base application.

The cleanup archive referenced by older project notes is stored outside this repository and is not required to build the active application. The four private Brand Management PDFs and knowledge inbox contents are intentionally kept out of GitHub.

## Troubleshooting

- **Node/pnpm version errors:** use Node 22.12+ and the pnpm version pinned in `package.json`; run `corepack prepare pnpm@10.4.1 --activate`.
- **Install differs from lockfile:** use `pnpm install --frozen-lockfile`; do not regenerate the lockfile unless intentionally changing dependencies.
- **Database connection errors:** confirm the local database is running, its database exists, and `DATABASE_URL` names it. Never solve this by copying a production URL.
- **OAuth/login errors:** local OAuth settings depend on the platform configuration. Leave authentication-dependent flows off until local credentials and callback URLs are configured; use an isolated local auth bypass only where the code explicitly supports it.
- **Provider or Pinecone errors:** verify the server-side key and endpoint in `.env`, the account's free/paid quota, and that the relevant feature flags are intentionally enabled. Keep browser-exposed `VITE_*` values free of secrets.
- **Port already in use:** set a free `PORT` for the server or stop the duplicate local process after identifying it.
- **PDF tool errors:** create the documented isolated Python environment and install only `scripts/requirements-mira-pdf.txt`; do not put its directory in Git.

## Repository and branch

Canonical remote: https://github.com/mariacavali/MIRA-asignment-. The working branch for this handoff is `codex/mira-agent-foundation`; `main` is separate. Review the current branch and `git status` before committing further work.
