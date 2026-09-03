# Local Environment Variable Template

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
