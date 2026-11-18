# MIRA: independent local development

Verified repository: https://github.com/mariacavali/MIRA-asignment-

Use **`codex/mira-agent-foundation`** for the current coach, knowledge, and local-development implementation. `main` contains an older application. Other product/capstone branches remain available; this handover does not merge them or change production.

## 1. Clone the correct source

Install Git, Node.js **22.12.0 or newer**, and **pnpm 10.4.1**. Check `node --version` in the same terminal you will use for MIRA. This computer had two Node installations; an older one can take precedence in `PATH`.

If pnpm is unavailable, run `npm install --global pnpm@10.4.1`. If your Node installation includes Corepack, `corepack enable` followed by `corepack prepare pnpm@10.4.1 --activate` is another option.

```sh
git clone --branch codex/mira-agent-foundation https://github.com/mariacavali/MIRA-asignment-.git
cd MIRA-asignment-
git branch --show-current
pnpm --version
pnpm install --frozen-lockfile
cp .env.example .env
```

Use your GitHub account's normal authentication if requested. Never put a token in the clone URL. The commands use a POSIX shell (macOS/Linux, or WSL on Windows). In PowerShell, `Copy-Item .env.example .env` copies the template, but the package's existing `NODE_ENV=...` scripts require a compatible shell.

`package.json`, `pnpm-lock.yaml`, and `patches/wouter@3.7.1.patch` together define the JavaScript dependencies. Install development dependencies too: Vite, TypeScript, tsx, and the build tools are needed locally. Python and MariaDB are optional for the corresponding tools below.

## 2. Configure a provider-free first run

Edit the new `.env`. Leave API keys, platform OAuth settings, and `DATABASE_URL` blank initially. Set:

```dotenv
PORT=3000
MIRA_LOCAL_FILE_STORE=true
DEV_LOCAL_AUTH_BYPASS=true
DEV_LOCAL_VISUAL_PLACEHOLDERS=true
MIRA_PAYMENT_MODE=local
MIRA_EMAIL_PROVIDER=
LANGSMITH_TRACING=false
MIRA_COACH_TELEMETRY_ENABLED=false
```

Keep the other feature flags at their template defaults (`false`). Generate a unique local session secret directly into `.env`, without printing it:

```sh
node --input-type=module -e 'import fs from "node:fs"; import {randomBytes} from "node:crypto"; const p=".env"; const s=fs.readFileSync(p,"utf8"); fs.writeFileSync(p,s.replace(/^JWT_SECRET=.*$/m,"JWT_SECRET="+randomBytes(32).toString("hex")),{mode:0o600}); fs.chmodSync(p,0o600);'
```

Use fictional accounts and content for this local mode. It stores local state in ignored `.mira-local-data/store.json`. These development authentication settings apply only to development/test and do not implement production authentication. This mode supports the photographer development flow; the SQL-backed coach/workspace catalogue requires its separate database configuration. A running UI does not prove live AI or every integration works.

## 3. Run frontend and backend

```sh
pnpm dev
```

Open the URL printed by the server, normally `http://localhost:3000/mira`. **One command runs both** the Express/tRPC backend and the Vite/React frontend. There is no separate Python backend. The server selects a nearby port if the requested port is occupied. Stop only your process with Ctrl-C when finished.

For the local photographer flow, open `/mira/signup`, create a fictional account, continue to local test checkout, and complete onboarding. No Stripe credentials are needed for local payment mode. Generated visual placeholders require no image provider.

```sh
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/internal/mira/readiness
```

Health should return `{"status":"ok"}`. In file-store mode readiness can report SQL and provider components as `not_configured`; this is expected. Readiness does not test live provider calls.

## 4. SQL-backed development

Use a new **local, disposable MySQL-compatible database**, never an existing live database. The schema is under `drizzle/` and `drizzle/schema.ts`. For example, in your local MySQL administrative console:

```sql
CREATE DATABASE mira_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mira_dev'@'localhost' IDENTIFIED BY '<new-local-password>';
GRANT ALL PRIVILEGES ON mira_dev.* TO 'mira_dev'@'localhost';
```

Replace the placeholder privately. Set `DATABASE_URL=mysql://mira_dev:<URL-encoded-local-password>@127.0.0.1:3306/mira_dev` in `.env`. For SQL mode, set `MIRA_LOCAL_FILE_STORE=false` and `DEV_LOCAL_AUTH_BYPASS=false`. The photographer/platform OAuth flow needs authorized development app configuration; a workspace/grant is server-controlled, and enabling a coach flag alone does not grant access.

Review the migrations, then apply the **existing** migrations only to that fresh local database:

```sh
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
```

The explicit env-file argument matters: `drizzle.config.ts` reads `process.env.DATABASE_URL` and does not load `.env` itself. `pnpm db:push` also generates new migrations; use it only when intentionally changing the schema. Do not reapply migrations manually to an existing database or change production tables to make local setup work.

On an Apple Silicon Mac with local MariaDB installed at `/opt/homebrew/opt/mariadb/bin`, the existing test helper runs SQL integration checks in a newly created, socket-only temporary database:

```sh
python3 scripts/test-workspace-db.py
```

This helper never uses `DATABASE_URL`. Its installation path is Mac-specific; on another OS, adapt that path to your local MariaDB binaries before using it.

## 5. The green connected coach preview

For the existing isolated coach review (separate from the main photographer app), read `server/miraCoach/CONNECTED_SESSION.md` first. On the Mac/MariaDB setup described above, use two terminals:

```sh
# Terminal 1: isolated SQL-backed API, loopback port 5184
python3 scripts/start-mira-connected-review.py
```

```sh
# Terminal 2: frontend, loopback port 5183
pnpm exec vite --config scripts/mira-coach-preview-vite.config.ts
```

Open `http://127.0.0.1:5183/mira/coach-preview`. On a fresh machine this creates a new local review database/session under `.mira-local-data/connected-review/`. It does not restore this computer's saved conversations. Existing occupied ports cause an explicit failure; identify existing processes before restarting anything.

Live text, voice, image interpretation, and Pinecone retrieval remain separately gated. Do not copy approval files or resume old spending allowances. Provider keys by themselves do not authorize paid requests. The review launcher has a Mac-specific MariaDB path and the PDF extractor expects `.mira-pdf-venv/bin/python`.

## 6. Connect optional services when needed

Use [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) and `.env.example` for the variable names. Obtain development credentials through the existing account owners or provider consoles. Do not change account settings, live callbacks, indexes, or subscriptions as part of setup.

| Feature | Development configuration |
| --- | --- |
| Platform OAuth | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, unique `JWT_SECRET`; authorized development app/callback configuration is required for `/api/oauth/callback`. |
| Coach / Forge | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`; SQL workspace/grant plus the relevant `MIRA_COACH_*` flags. Provider selection is explicit. |
| OpenAI features | Server-only `OPENAI_API_KEY` and the relevant model/feature settings; calls can be billed. Keep disabled for initial verification. |
| Knowledge / Pinecone | SQL catalogue plus reviewed, permitted knowledge; `PINECONE_API_KEY`, index host/namespace, backend/read flags. Do not seed or publish existing book drafts during setup. |
| Email | Resend development configuration and a permitted sender. Keep `MIRA_EMAIL_PROVIDER` blank for the first run; do not start email workers or send real invitations. |
| Payments | Keep `MIRA_PAYMENT_MODE=local`. Any future Stripe testing needs test-mode keys/prices and a separate local webhook setup; do not reuse or modify live payment settings. |
| Notion, Dakidarts, LangSmith | Optional account credentials and flags; keep disabled until that integration is intentionally tested. |

All `VITE_*` values are browser-visible. Never place a private provider key in them, including the legacy `VITE_FRONTEND_FORGE_API_KEY` field.

Knowledge/source rights are independent of having credentials. Follow `AGENTS.md`: the Pearson/Keller material is withdrawn and excluded; private source PDFs and local catalogue data are not part of the source backup.

## 7. Verify a change

```sh
pnpm check
pnpm test
pnpm build
```

`pnpm build` creates `dist/public/` and `dist/index.js` locally; it does not deploy. `pnpm start` runs the built server in production mode, where file-store development auth is unavailable. Use `pnpm dev` for the first local run above.

Default tests use fake providers. SQL/PDF/live-provider tests are opt-in; do not enable live/runtime test flags as part of ordinary setup. Optional PDF tooling uses `scripts/requirements-mira-pdf.txt`; optional book tooling has `scripts/requirements-mira-books.txt` and `scripts/LOCAL_BOOK_TOOLS.md`. Python environments and books must not be committed.

## 8. Transfer private configuration separately

The project audit found one real application env file on the original computer:

```text
/Users/mariacavali/Desktop/Projects/Mira/.env
```

`.env.example` is the committed placeholder template. No additional frontend/backend/API environment files were found outside installed dependency/Python environments. The real file remains in place and is ignored by Git. It can contain service keys even when the corresponding flags are disabled.

Transfer `.env` separately through an end-to-end encrypted password-manager attachment/secure share or an encrypted removable volume. Do not add it to the source ZIP, Drive, GitHub, email, chat, screenshots, or setup logs. On the new computer save it with owner-only permissions (`chmod 600 .env`). Review it privately and replace machine-specific paths, production URLs/credentials, and flags with isolated development values before starting the app. Prefer newly issued development credentials where possible. Do not overwrite a newly configured `.env` without first preserving it securely.

Saved sessions, databases, uploads, knowledge drafts, raw source books, and provider approval state in `.mira-local-data/` and other ignored folders stay on the original machine. They are intentionally excluded from the unencrypted source package. If continuity of that private data is needed, use a separate encrypted transfer; stop the relevant local database and make a consistent export before copying it. Do not copy a running database directory or transfer withdrawn content into retrieval.

## 9. Continue coding

```sh
git status
git switch -c feature/my-next-change
# Edit and run the checks above.
git add <specific-source-files>
git diff --cached --stat
git commit -m "Describe the change"
git push -u origin feature/my-next-change
```

Check staged content privately for credentials before committing. Keep `.env`, data, generated output, and dependency directories ignored. The handover audit records the exact pushed commit and source archive checksum; it is separate from this reusable setup guide.
