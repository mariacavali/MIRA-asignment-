# MIRA — Production Smoke Test Checklist

One controlled, real end-to-end test against the live production deployment, using Maria's own `MARIATEST` 100%-discount Stripe coupon so the checkout is real but no money moves. Run only after `docs/MANUS_DEPLOYMENT_RUNBOOK.md` steps 1–16 are complete and readiness reports every component `ready`.

**Every action below that can send a real email, spend real AI cost, or touch a real provider is marked 🔒 REQUIRES EXPLICIT APPROVAL.** Do not run a 🔒 step without Maria's go-ahead for that specific step, even if earlier steps were already approved — approval is per action, not blanket for the whole checklist.

Use a dedicated test identity throughout — a clearly-labelled photographer name/business and a synthetic-but-real-enough client email that only Maria can access (her own inbox, or an inbox she controls) for the one real invitation email in this test. Do not use a `.test` address for the one step that must actually deliver (Step 8) — `.test` never delivers by design, which is correct for local QA but would make Step 8 unverifiable here.

---

## 1. New photographer checkout — 🔒 requires approval (real Stripe checkout, $0 charge)
- Open the Stripe Payment Link.
- Apply the `MARIATEST` 100%-discount coupon before paying.
- Confirm the resulting charge is €0.00 before confirming payment.
- **No real charge should occur** — verify in the Stripe dashboard that the invoice/charge total is zero.

## 2. Signed Stripe webhook
- Confirm the webhook fired and was accepted (`checkout.session.completed`, `200` response, signature verified).
- Confirm `mira_processed_stripe_events` recorded the event id exactly once (query by count, not by printing the id).

## 3. Payment status activation
- Confirm the photographer's billing identity now shows `paymentState: active` (via the dashboard's own "Status" line — do not query Stripe directly for this check, use MIRA's own stored state so this test also validates the webhook → storage path).

## 4. Payment-success redirect
- Confirm `https://www.mariacavali.com/mira/payment-success?session_id={CHECKOUT_SESSION_ID}` redirects to onboarding (new account) without manual intervention.
- Confirm the `session_id` query parameter is not what grants access — access is already active from Step 3 by the time this page is reached.

## 5. Photographer onboarding
- Complete with neutral, clearly-test-labelled profile information.
- Confirm redirect to the dashboard on completion.

## 6. Dashboard
- Confirm Billing shows the live Stripe status (not "Test access" — that string is specific to local mode).
- Confirm Customer Portal button is present and enabled (do not click yet — see Step 15).

## 7. Create one test shoot
- Clearly labelled title (e.g. "MANUS SMOKE TEST SHOOT — DO NOT USE").
- Future date, real timezone, explicit duration — confirm the Duration field is saved as entered (this was a real bug found and fixed during acceptance testing; re-verify it here against the production build).

## 8. Send one real test invitation — 🔒 requires approval (real Resend email send)
- Send to Maria's approved test inbox only. No other recipient.
- Confirm exactly one invitation email arrives (not zero, not duplicated).
- Confirm the email's link opens the correct private Shoot Room and no other invitation's data leaks into it.

## 9. Client private link
- Confirm the link from Step 8 requires no photographer session to open.

## 10. Client access without login/payment
- Confirm the client can view shoot details and reach the Shoot Room welcome screen with no account, login, or payment prompt at any point.

## 11. Schedule confirmation
- Confirm via the room's own "These details are correct" control.

## 12. Calendar controls
- Confirm "Add to Google Calendar" and "Download calendar invitation (.ics)" both render with correct date/time/duration/location.
- Clicking through to actually add the event is fine (it's the client's own calendar action, not a MIRA-initiated one) — but do not treat this as license to click other, provider-calling controls on the page.

## 13. Call MIRA — 🔒 requires approval, as a separately authorized paid-AI test
- This is a real OpenAI Realtime API cost. Get separate, explicit approval for this specific step even if the rest of the smoke test was pre-approved.
- Confirm consent gating still blocks the call until checked.
- Keep the test call brief.

## 14. Moodboard generation — 🔒 requires approval, as a separately authorized paid-AI test
- Real OpenAI image-generation cost. Separate explicit approval required.
- Confirm the moodboard renders and is scoped to this test shoot only.

## 15. Email milestones using compressed test timing — only if explicitly enabled, 🔒 requires approval
- Do not change the production milestone schedule (invitation / +48h / shoot−24h) for real users. If a compressed-timing test is explicitly approved, use a dedicated flag or a manually-scheduled outbox row for this one test shoot only — never a global timing override.
- If not explicitly enabled for this run, skip this step entirely and verify milestone scheduling via the existing automated test suite instead (already passing, no live send needed).

## 16. Customer Portal access — 🔒 requires approval (opens real Stripe-hosted UI)
- Click "Manage subscription" from the dashboard.
- Confirm it opens a genuine `https://billing.stripe.com/...` URL (MIRA validates this server-side before redirecting) and returns to `/mira/dashboard` on exit.

## 17. Subscription cancellation/reactivation behavior — 🔒 requires approval
- Cancel at period end via the Portal. Confirm MIRA's stored state reflects `cancelAtPeriodEnd: true` after the next webhook.
- Reactivate. Confirm state reflects active again.
- This exercises `customer.subscription.updated`/`customer.subscription.deleted` handling — do not let the test subscription actually lapse into `past_due` real billing; the `MARIATEST` €0 coupon keeps this safe, but confirm before triggering.

## 18. No duplicate email or webhook processing
- Confirm Step 8's invitation was not sent twice (dashboard/delivery status, not a second inbox check).
- Confirm no Stripe event id from this test appears more than once in `mira_processed_stripe_events`.

## 19. Client access expires at shoot end + 24h
- This is a timing property already covered by the automated test suite (`accessWindow`, `invitationRoomAccess` tests) — do not wait 24+ real hours in production to verify it live. Confirm instead that the room's displayed access window matches shoot-end + 24h for the test shoot created in Step 7, and rely on the existing test coverage for the boundary behavior itself.

## 20. Cleanup / retention checklist for production test data
- Cancel the `MARIATEST` subscription for real (not just at period end) once the test is fully signed off.
- Delete or clearly archive the smoke-test shoot, invitation, and photographer profile per whatever data-retention process governs real MIRA data — do not leave "DO NOT USE" test records live in the production database indefinitely.
- Confirm no test QA data was written to any *other* photographer's account.
- Record the test run's outcome (pass/fail per numbered step) somewhere durable before cleanup, so a failed step isn't lost once its data is removed.

---

**Do not begin Step 1 until Maria has explicitly approved starting the smoke test.** Do not send a test email, spend AI cost, or activate the scheduler ahead of this checklist under any circumstance — including "just to prepare."
