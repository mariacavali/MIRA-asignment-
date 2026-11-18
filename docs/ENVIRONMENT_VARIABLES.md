# Local Environment Variable Template

The complete copyable template is [`../.env.example`](../.env.example). Copy it to `.env`; do not commit `.env`. Blank values are intentional. Most variables are optional and their associated features are disabled by default. Configure only what your isolated local task requires.

## Minimum local setup

For the main application, use a disposable local MySQL/TiDB database and set `DATABASE_URL`, a newly generated local `JWT_SECRET`, and the app/OAuth identifiers and URLs needed by the configured login flow (`VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`). Set `PORT` only if 3000 is occupied. No provider API key is needed to install dependencies. Some platform-specific auth configurations cannot be reproduced without access to that platform's app console.

## Credential sources and flags

| Variables | Required when | Obtain/configure from |
| --- | --- | --- |
| `DATABASE_URL` | Running app features that persist to SQL | A dedicated local MySQL/TiDB instance; never production |
| `JWT_SECRET` | Signing local sessions/tokens | Generate a unique random value locally; do not reuse another environment's secret |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | Platform OAuth login | The app/platform administrator's development app configuration |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Forge-backed model, image, storage, or coach features | The authorized Forge/platform console; server-side key |
| `OPENAI_API_KEY` and `OPENAI_*` | OpenAI embeddings, realtime, coach voice/vision or other enabled OpenAI features | OpenAI developer account; usage may be billed |
| `PINECONE_API_KEY`, `PINECONE_INDEX_HOST`, `PINECONE_NAMESPACE` | Explicitly enabled Pinecone retrieval | Pinecone console; use the existing compatible index host only if authorized. Read/write feature flags remain off by default |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MIRA_EMAIL_PROVIDER`, `MIRA_INVITATION_FROM`, `MIRA_PUBLIC_APP_BASE_URL` | Transactional email and delivery status | Resend account, verified sending domain and local callback configuration |
| `MIRA_EMAIL_WORKER_SECRET`, `MIRA_INVITATION_LINK_SECRET` | Secured email worker and signed invitation links | Generate independent random secrets locally; server-side only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` / `MIRA_STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_PAYMENT_LINK_URL` | Stripe payment integration | Stripe test-mode dashboard and webhook endpoint; keep `MIRA_PAYMENT_MODE=local` unless intentionally testing Stripe |
| `DAKIDARTS_API_KEY`, `DAKIDARTS_API_BASE_URL` | Optional V3 birth-context integration | Dakidarts provider account |
| `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `NOTION_API_BASE_URL` | Optional Notion retrieval | Notion integration settings and the intended database |
| `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `LANGSMITH_ENDPOINT`, `LANGSMITH_WORKSPACE_ID` | Optional coach telemetry | LangSmith account. Keep tracing/telemetry disabled unless deliberately enabled and data handling reviewed |
| `MIRA_COACH_REFERENCE_ROOT`, `MIRA_KNOWLEDGE_DOCUMENT_ROOT`, `MIRA_PDF_PYTHON` | Local file storage/PDF extraction | Local paths and the isolated Python environment documented in `scripts/LOCAL_BOOK_TOOLS.md` |
| `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY` | A browser-side Forge integration that explicitly needs them | Authorized development configuration only. Anything prefixed `VITE_` is exposed to the browser; never place a private secret there |

Feature flags such as `MIRA_COACH_*_ENABLED`, `MIRA_KNOWLEDGE_ENABLED`, `MIRA_COACH_KNOWLEDGE_ENABLED`, `MIRA_PINECONE_READ_ENABLED`, `MIRA_V3_ENABLED`, `MIRA_V3_BIRTH_DATA_ENABLED`, and `NOTION_INTELLIGENCE_ENABLED` default to `false`. Enabling flags may incur provider charges or process personal data. Optional test controls (`RUN_MIRA_DB_TESTS`, `RUN_MIRA_PDF_TESTS`, `RUN_MIRA_LIVE_RECOGNITION`, `RUN_DAKIDARTS_CREDENTIAL_TEST`, `MIRA_TEST_DB_SOCKET`) are only for isolated tests; do not point them at production.

`VITE_APP_TITLE`, `VITE_APP_LOGO`, `OPENAI_EMBEDDING_BASE_URL`, `OPENAI_EMBEDDING_MODEL`, audio model/voice settings, `MIRA_COACH_MODEL`, `MIRA_COACH_MAX_COMPLETION_TOKENS`, `MIRA_COACH_KNOWLEDGE_LANGUAGE`, `MIRA_COACH_KNOWLEDGE_BACKEND`, `MIRA_PILOT_QA_RETENTION_DAYS`, `STRIPE_CURRENCY`, and the `*_API_BASE_URL`/`*_ENDPOINT` values are non-secret configuration. Keep production endpoint values out of local `.env.example` when they identify private infrastructure.

To rotate a credential, revoke it at its provider and issue a new one; replacing a value locally does not invalidate a previously exposed key. No credential values belong in Git, README files, issue trackers or browser-visible `VITE_*` variables.

Copy the variable names below into a local `.env` file when configuring a development environment. Leave provider variables blank until valid local credentials are supplied. **Do not commit the local `.env` file.**

```dotenv
# Core application and database
DATABASE_URL=
JWT_SECRET=
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=

# Payment mode. Local development defaults to the non-Stripe test flow.
MIRA_PAYMENT_MODE=local
STRIPE_PAYMENT_LINK_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
MIRA_EMAIL_WORKER_SECRET=
MIRA_INVITATION_LINK_SECRET=

# Pilot transactional email (Resend). Keep blank to use secure-link fallback only.
MIRA_EMAIL_PROVIDER=resend
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
MIRA_INVITATION_FROM=
MIRA_PUBLIC_APP_BASE_URL=

# Manus/Forge model, image, storage, and platform services
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=

# Optional semantic retrieval. Without these, MIRA uses deterministic lexical retrieval.
OPENAI_API_KEY=
OPENAI_EMBEDDING_BASE_URL=https://api.openai.com
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_CUSTOM_VOICE_ID=
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
MIRA_PILOT_QA_RETENTION_DAYS=7
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=

# Mira V3 feature flags
MIRA_V3_ENABLED=false
MIRA_V3_BIRTH_DATA_ENABLED=false

# Optional private V3 birth-context provider
DAKIDARTS_API_KEY=
DAKIDARTS_API_BASE_URL=https://api.numerologyapi.com/api/v1

# Optional local branding metadata
VITE_APP_TITLE=Mira
VITE_APP_LOGO=
```

Stripe mode currently has a local pending-checkout foundation and an unapplied production schema artifact at `drizzle/0016_mira_stripe_payment_persistence.sql`. Before production use, apply that migration through the approved deployment process. Do not grant access from a browser return URL; grant it only after verified, idempotent server-side webhook processing.

The provider-neutral event processor is currently tested with an in-memory repository only. The future production migration should persist pending checkout references (`referenceId`, created/expiry timestamps, status, and the eventual internal user link), payment identity fields (`stripeCustomerId`, `stripeSubscriptionId`, expected price/currency, and payment state), and a unique processed Stripe event ID ledger. Webhook signature verification must receive the untouched request body before JSON parsing.

The application reads the active server-side configuration through `server/_core/env.ts`. V4 has no separate feature flag or Human Design credential in the current implementation.

The future internal email worker endpoint uses `MIRA_EMAIL_WORKER_SECRET` with a fixed batch of 10 jobs and should be triggered by either a Manus scheduler or secured n8n workflow every 5 minutes, never both. Keep the secret server-side.

`MIRA_INVITATION_LINK_SECRET` signs the access links the email outbox worker generates for reminder emails (`/prepare/access/:signedAccessToken`), so a client can return to their private Shoot Room without the raw invitation token ever being stored outside the original invitation email. The link is derived from the invitation's id and its *current* `tokenHash`, so rotating an invitation's token automatically invalidates every signed link issued for it. Without this secret configured, the worker stays unavailable and sends nothing. Keep it server-side only; it is a distinct secret from `MIRA_EMAIL_WORKER_SECRET`, which only authenticates the worker HTTP endpoint itself.

`RESEND_WEBHOOK_SECRET` verifies the `POST /api/webhooks/resend` delivery-event webhook (Resend signs payloads the same way Svix does: `svix-id`/`svix-timestamp`/`svix-signature` headers, HMAC-SHA256 over the raw body). Configure this in the Resend dashboard against the deployed `/api/webhooks/resend` URL once a verified sending domain is live. Without it, the webhook route stays disabled (503) and an invitation's stored delivery status advances only as far as `sent` — it never becomes `delivered`, and a bounce or complaint never becomes `failed`. No client library is required; verification is done with Node's built-in `crypto`.

After hosting, configure the Stripe Payment Link after-payment redirect as `https://www.mariacavali.com/mira/payment-success?session_id={CHECKOUT_SESSION_ID}` (production domain confirmed — see `docs/MANUS_DEPLOYMENT_RUNBOOK.md` §0 for the full route map). Payment Links support `client_reference_id` and this after-payment redirect. The `session_id` is informational only: it never grants access; verified webhook processing and stored active payment state remain authoritative. Stripe Payment Links do not provide a separate configurable cancellation URL. `/mira/checkout?cancelled=true` is MIRA's own safe application UI for a manual return or cancellation flow. `MIRA_PUBLIC_APP_BASE_URL` is set to this same production origin once the MIRA host is live (Runbook Step 6); no server code hard-codes the domain.
