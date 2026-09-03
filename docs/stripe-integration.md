# MIRA Stripe Integration

## Purpose

Stripe provides MIRA’s hosted checkout and signed payment-event delivery. MIRA uses Stripe for the commercial transaction while keeping account creation, access control, onboarding, and the photographer dashboard inside the application. The current offer is a **one-time purchase**, not a recurring subscription.[1][2]

## Verified Customer Journey

| Stage | Responsibility | Result |
|---|---|---|
| Account | MIRA creates or authenticates the photographer account. | The purchase begins with a known authenticated photographer. |
| Checkout | MIRA creates an expiring pending-checkout record and appends its opaque reference to the Stripe Payment Link. | Stripe receives `client_reference_id` without receiving an application session or password.[1] |
| Payment | Stripe completes the hosted one-time checkout. | Stripe produces a signed `checkout.session.completed` event. |
| Webhook | MIRA validates the raw request body and `Stripe-Signature`, normalizes the event, and validates payment, price, currency, reference, and event time. | Only a trusted event can activate the pending purchase.[2][3] |
| Access | The verified event consumes the pending reference and marks the linked photographer’s payment state active. | Replayed events cannot activate the purchase twice.[3][4] |
| Dashboard | `/mira/payment-success` reads stored access state and routes the verified photographer onward. | An active photographer continues to `/mira/dashboard`; profile completion remains governed by the existing onboarding rules.[5] |

## Authenticated Account Binding

The purchase mutation starts from the authenticated photographer. MIRA creates a pending record containing the internal photographer identity, expected Stripe price, expected currency, and an opaque random reference. Only that reference is added to the Payment Link as `client_reference_id`. When Stripe later returns the reference in the signed event, the server resolves it back to the existing account and consumes it atomically.[1][3][4]

## Webhook Verification and Access Boundary

The application accepts Stripe events at `/api/webhooks/stripe`. The handler requires the original raw JSON body and a valid Stripe signature before it normalizes or processes the event. For `checkout.session.completed`, the one-time checkout must be complete and have `payment_status` equal to `paid` or `no_payment_required`. The event must also match the configured price and currency and include a valid, unexpired pending reference.[2][3]

> Reaching `/mira/payment-success` never grants access. The page only reads the payment state already persisted by the verified webhook and displays loading, success, or actionable verification-error states.[5]

## Duplicate and Delayed Events

Every processed Stripe event ID is recorded. If Stripe retries the same event, the processor returns an idempotent duplicate result instead of consuming the pending checkout again. Pending records are also single-use. For delayed delivery or manual resend, expiry validation uses Stripe’s original event creation time rather than the later delivery time, preventing a legitimate completed checkout from being rejected merely because its signed event arrived late.[2][3][4]

## MIRADEMO Verification

The Stripe-hosted **MIRADEMO** promotion was configured as a 100% discount with no-cost orders enabled. The verified test completed at €0.00, produced a signed `checkout.session.completed` event with `no_payment_required`, returned HTTP 200 after the final validation correction, activated the account-bound access record, and continued through the existing payment-success route to the photographer dashboard. The promotion and Payment Link settings live in Stripe and are not source-controlled; production operators must confirm them in the intended Stripe environment before launch.[2]

## Verification Performed

The implementation was verified with the original completed checkout event rather than by creating another account or payment. The signed event was accepted, the pending checkout was consumed, the photographer’s payment status became paid, and the authenticated payment-return flow reached `/mira/dashboard`. The current checkpoint also passes the complete focused payment test directory: **10 files and 62 tests**, including runtime configuration, commercial purchase, pending checkout, payment event processing, return routing, portal behavior, webhook normalization/signature handling, and runtime webhook-secret selection. The existing production build also completes successfully.

## Production Environment Variables

Only variable names are documented here. Values must be supplied through secure deployment settings and must never be committed.

| Variable | Purpose |
|---|---|
| `MIRA_PAYMENT_MODE` | Enables the Stripe payment path. |
| `STRIPE_PAYMENT_LINK_URL` | Hosted one-time MIRA Payment Link. |
| `STRIPE_SECRET_KEY` | Server-side Stripe API authentication. |
| `STRIPE_PRICE_ID` | Expected MIRA price used during webhook validation. |
| `STRIPE_CURRENCY` | Expected currency; optional when the application default is correct. |
| `MIRA_STRIPE_WEBHOOK_SECRET` | Preferred signing secret for `/api/webhooks/stripe`. |
| `STRIPE_WEBHOOK_SECRET` | Supported fallback webhook signing-secret name. |
| `MIRA_PUBLIC_APP_BASE_URL` | Public application origin used for the payment-return route. |
| `DATABASE_URL` | Durable production persistence for users, pending checkouts, payment identity, and processed event IDs. |
| `JWT_SECRET` | Authenticated application-session signing. |
| `MIRA_LOCAL_FILE_STORE` | Development-only store selector; production must use durable persistence. |

## Known Limitations and Next Production Step

The private preview can use its local file store, but production payment activation must use durable database persistence. Stripe-side Payment Link price, MIRADEMO promotion, no-cost order behavior, after-completion redirect, and webhook endpoint configuration are external account settings and therefore cannot be guaranteed by the repository alone.

The next production step is to configure the listed variables securely, apply the existing production database schema, register `/api/webhooks/stripe` in the intended Stripe environment, confirm the Payment Link returns to `/mira/payment-success`, and perform one controlled low-risk end-to-end checkout while monitoring the signed webhook response and stored account access. No access should be granted by URL parameters or browser arrival.

## References

[1]: ../server/payment/pendingCheckout.ts "Pending checkout creation and client-reference binding"
[2]: ../server/payment/stripeWebhook.ts "Stripe signature verification and event normalization"
[3]: ../server/payment/paymentEventProcessor.ts "Provider-neutral validation, activation, and event idempotency"
[4]: ../server/payment/localPaymentRepository.ts "Local preview payment persistence and single-use checkout consumption"
[5]: ../client/src/pages/MiraPaymentSuccess.tsx "Webhook-backed payment-return user interface"
