# MIRA Local Recording Demo

A fully offline, deterministic, repeatable walkthrough of the MIRA product for
screen recording. No external credentials, no payments, no emails, no voice
service, no real AI image generation, and no cloud database are used or
required. Every simulated integration is clearly labeled "Demo mode" on
screen; nothing pretends an external action occurred.

This mode is entirely additive. When it is off (the default, everywhere,
including production), the application behaves exactly as before — every
recording-demo code path is gated behind `MIRA_RECORDING_DEMO=true` and,
underneath that, the existing `MIRA_LOCAL_FILE_STORE=true` local-file-backed
storage (`server/localFileStore.ts`).

## How to start it

1. Copy `.env.example` to `.env` if you have not already, and make sure a
   real `DATABASE_URL`/`JWT_SECRET`/`VITE_APP_ID` are set as the app normally
   requires for local dev (recording demo mode does not remove that
   requirement — it only removes the need for Stripe/Resend/OpenAI/a
   configured production database *for the demo shoot itself*).
2. Set two flags (in your shell, or in `.env`):
   ```
   MIRA_LOCAL_FILE_STORE=true
   MIRA_RECORDING_DEMO=true
   ```
3. Start the app the normal way:
   ```
   MIRA_LOCAL_FILE_STORE=true MIRA_RECORDING_DEMO=true pnpm dev
   ```
   The server prints the port it bound (`Server running on http://localhost:3000/`
   by default; if 3000 is busy it automatically tries the next free port —
   check the terminal output for the exact URL).

## Exact URL

```
http://localhost:3000/mira
```
(or whatever port the server printed, if 3000 was unavailable).

## Exact recording path

1. **Landing** — `/mira`. Shows "For remote photographers", "Better shoots
   begin before the camera turns on.", the "Prepare your next shoot" button,
   and €33.33/month. Click **Prepare your next shoot**.
2. **Demo checkout** — `/mira/checkout`. Shows "Demo checkout — no payment
   will be processed." Click **Activate demo photographer workspace**. This
   seeds one fictional photographer (Maria Cavali) and one fictional shoot
   (client Elena, "Founder Editorial Portrait", Amsterdam, 60 minutes,
   Personal-brand campaign) directly into the local file store — no Stripe
   call is made — and opens the dashboard.
3. **Photographer dashboard** — `/mira/dashboard`. Loads from the top (no
   blank/centered screen). Shows the seeded shoot card. Click **Open shoot**.
4. **Shoot page** — `/mira/shoots/:id`. Shows shoot details and preparation
   status. Click **Create private client link**. Shows "Demo invitation
   ready — no email was sent." with **Copy link** and **Open client Shoot
   Room** buttons, and a note: "Resend delivery was verified separately;
   local recording mode uses a direct link." Click **Open client Shoot Room**.
5. **Private Shoot Room** — `/prepare/:token`. Shows "Maria invited you to
   prepare for your shoot," shoot details, the consent checkbox, the five
   seeded demo reference images ("Your uploaded references"), and the
   welcome section with the real "Call MIRA"/"Continue with text" buttons
   plus, in recording-demo mode, a **Start demo conversation** panel labeled
   "DEMO MODE · Scripted conversation — no microphone or external AI call."
   Check the consent checkbox first.
6. **Scripted conversation** — click **Start demo conversation**. A fixed,
   fictional transcript plays (Elena wants quiet confidence, natural window
   light, olive/cream/tactile fabrics, a small apartment, no assistant, avoid
   corporate laptop poses). Click **Continue**. This saves the fictional
   preparation answers into the local file store (no microphone, no OpenAI
   Realtime call).
7. **Creative synthesis** — the same page, moments later (the Shoot Room
   polls automatically every ~8 seconds, or reload the page). Shows the
   five-scene demo moodboard, labeled "Demo-local visual assets — real AI
   image generation not invoked," the five original reference images, and
   the preparation brief (wardrobe/lighting/location/timing guidance).
8. **Calendar** — in "Your Shoot," click **Download calendar invitation
   (.ics)**. Downloads a real, valid `.ics` file for the fictional shoot
   (title, date, time, duration, location) — this is the app's existing,
   already-implemented calendar export (`client/src/components/mira/calendar.ts`),
   unmodified. "Add to Google Calendar" opens Google's own pre-filled event
   template in a new tab; it does not create anything server-side.
9. **Ready to Shoot** — the same page's final section shows the preparation
   checklist and "Ready to Shoot" confirmation.

Throughout, a persistent banner reads: "LOCAL RECORDING DEMO · Simulated
integrations use synthetic data." A **Reset demo** control sits in that same
banner on every page.

## What is real

- The photographer dashboard, shoot page, Shoot Room, consent flow,
  invitation/token model, visual-reference upload/display, the preparation
  brief structure, and the calendar `.ics`/Google Calendar buttons are the
  same, unmodified production code paths used by the real product in local
  dev — not a separate mock UI.
- The five-scene moodboard and Creative DNA use the app's real schema and
  the real deterministic `buildShootPreparationBrief` compiler
  (`server/miraCore/preparationBrief.ts`) — only the underlying Creative DNA
  values are demo fixtures, generated by the same demo-fallback style already
  used elsewhere in the app when no paid AI model is configured
  (`server/miraCore/demoCreativeDna.ts`).
- Persistence is the app's real local-file-backed storage
  (`server/localFileStore.ts`, a JSON file under `.mira-local-data/`) — not
  an in-memory mock. A server restart or page refresh does not lose the
  seeded shoot or its preparation state.

## What is simulated

- **Checkout**: no Stripe call. A dedicated `recordingDemo.activate`
  procedure seeds a pre-paid demo account directly.
- **Invitation delivery**: no Resend call. "Create private client link"
  produces a link only; email sending is not exercised in this mode.
- **MIRA conversation**: no microphone, no OpenAI Realtime call. A fixed,
  labeled, scripted transcript plays instead.
- **Creative DNA / moodboard images**: no OpenAI image generation call.
  Five deterministic, offline, inline SVG images are generated locally and
  labeled "DEMO" both in their alt text and in the surrounding UI copy.
- **Google Calendar**: the existing "Add to Google Calendar" button opens a
  manual, pre-filled Google template in a new tab — this was already true
  before this recording demo mode and is not a new simulation. No calendar
  event is created automatically by MIRA on the user's behalf.

## Known limitations

- Real LangSmith traces are pending — this recording demo does not exercise
  LangSmith in any way (see `capstone/langsmith/README.md`).
- The recording demo's video/screen-recording output, once made, is a
  presentation/demo recording of this local mode — it is not evidence of a
  live n8n execution or of the real (non-demo) OpenAI Realtime voice path.
- Voice conversation and real (non-demo) AI image generation remain pending
  in the actual product; this mode exists specifically so the rest of the
  flow can be demonstrated honestly without either.
- Staff/class feedback on this demo is pending.
- The local-file-store's Creative DNA/moodboard path is otherwise stubbed
  out (`server/miraCore/db.ts`, `getShootRoomStatusForClient`) for every
  shoot except the one seeded fixture flagged `recordingDemo: true` — this
  mode does not add general Creative DNA/moodboard support to local-file-store
  mode for arbitrary shoots.

## Reset

Click **Reset demo** in the top banner (any page). This restores the seeded
shoot to its starting state (welcome room, no consent, no preparation) while
keeping the same invitation link, so a new take can start immediately.

## A 2–5 minute recording script

1. **(0:00–0:20)** Landing page. Read the headline and the "Prepare your next
   shoot" CTA. Click it.
2. **(0:20–0:35)** Demo checkout screen — point out "no payment will be
   processed." Click "Activate demo photographer workspace."
3. **(0:35–0:55)** Dashboard — the seeded shoot card for Elena's Founder
   Editorial Portrait. Click "Open shoot."
4. **(0:55–1:20)** Shoot page — click "Create private client link," point out
   the "no email was sent" note, click "Open client Shoot Room."
5. **(1:20–1:45)** Shoot Room — read the invitation, check the consent box,
   scroll past the five reference images.
6. **(1:45–2:15)** Click "Start demo conversation," let the scripted
   transcript play, click "Continue."
7. **(2:15–2:50)** Scroll to the five-scene moodboard and preparation brief;
   point out the "Demo-local visual assets" label.
8. **(2:50–3:10)** Click "Download calendar invitation (.ics)"; show the
   downloaded file.
9. **(3:10–3:30)** Scroll to "Ready to Shoot." Close on the persistent
   "LOCAL RECORDING DEMO" banner to reinforce that every simulated step was
   clearly labeled throughout.
