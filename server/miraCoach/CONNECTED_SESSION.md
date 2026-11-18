# Connected green session

The ivory/sage/deep-teal design is shared by the isolated local review at `/mira/coach-preview` and the authenticated application route `/mira/session/:workspaceId/:conversationId`. The existing text coach links to the green route when a timed session is available. The original design component is preserved in Maria’s MIRA architecture work folder as `green-layout-before-connection.tsx`.

## Knowledge preparation — 30 October 2026

The ten-title Drive library still contains notes/excerpts, not ten complete books. The old 25-card draft `1040f7b3-d676-44ae-9a4e-38058bf4c180` and its first-seed packet are superseded/on hold for Maria's full-book requirement; do not publish them as fulfillment.

The supplied four-part Keller *Strategic Brand Management*, fourth edition, has 287/287 physical scan pages locally processed. The final actual local draft is `24c45d09-4c9d-47c7-ad35-9a116ec7f229`, catalogue revision 38, **3,424 source/visual passages**, hash `3b07cbee311254b6a9b9f5a01012d402f2f7e0976974d16ac1675393ac28a1e8`. Exact complete draft readback passed; active published-snapshot lexical retrieval correctly excludes it. **Positive live book retrieval has not passed.** Printed pages 14–15 are missing, 112–113 are blurred, earlier front matter is incomplete, and remaining text/table/visual/source-use reviews are pending. The book is not complete. Source PDFs are unchanged. No publication, Pinecone seed or paid provider request occurred.

Per-book status: `~/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion/book-status.md`; detailed receipts under `/Volumes/2tb/MIRA-local/books/brand-management/`. `scripts/LOCAL_BOOK_TOOLS.md` documents the passage-aware trusted local staging CLI and quality holds. Source passages and separately labelled generated visual descriptions retain exact page/hash/offset provenance. The isolated API was refreshed to load this schema, preserving the saved session; current launcher session 96422. Frontend 5183/API 5184 were checked live: saved scope unchanged, publishedKnowledge false, paid text disabled, trial not_authorised. No paid approval file was created. Verify services before relying on these across chats.

## Local review

Run `python3 scripts/start-mira-connected-review.py` from the repository. Keep the existing preview Vite server on 127.0.0.1:5183; its config is `scripts/mira-coach-preview-vite.config.ts`. It proxies only the session and tRPC endpoints to 127.0.0.1:5184, preserving the browser Host header for origin checks.

The launcher owns a persistent, socket-only MariaDB instance under ignored `.mira-local-data/connected-review/database`. It never uses `DATABASE_URL`. Only this isolated database receives migrations 0019–0025. A clearly labelled local actor and workspace are created for this review; the main application authentication remains unchanged. The API uses a review-only HTTP-only SameSite cookie and rejects other hosts/origins. Restart the review API and its launcher before rebuilding the service; a second launcher refuses an occupied port or running database.

The stored pointer, conversations, references and timer persist across restarts. Stopping the launcher terminates its own API/database, preserving data. Never copy the local actor/bootstrap into a public deployment.

## Controls and actual connections

- Home: private file upload, saved-file cards/thumbnails, withdrawal, reference links and optional descriptions. Each file is bounded to 10 MB, checked against its declared format, deduplicated and scoped to its authenticated conversation. Text/PDF excerpts become private reference sources with existing retrieval and withdrawal rules. Links save metadata/description; this does not crawl the website.
- Talk: real saved messages, one shared server clock, explicit pause/resume/end, heartbeat/disconnection pause, adaptive call workflow and actual interview coverage. No client timer refill, fabricated progress, reply or waveform.
- Voice: browser microphone only after explicit choice; bounded recordings → transcription → the same call workflow → speech from a server-owned saved reply. Pause/end stops tracks/playback; disconnect aborts pending audio requests where possible. Failed calls pause the timer. This is a turn-based voice adapter, without interruption/barge-in.
- Results: source-linked reflection, one reflection confirmation, correction through conversation, text download, still-open areas and separately reviewed direction status. After current reflection confirmation, a source-only direction brief is available with exact reviewed statements and remaining gaps for meaning, voice and visual preparation. Its download rechecks authenticated current state. The brief is not generated creative recommendations or a Brand Book, and pending corrections withhold it until reviewed again. An empty conversation shows an empty results state. Brand Book/PDF generation is not implemented here.
- The connection drawer truthfully reports saved session, references, provider, voice, adaptive method and whether the isolated catalogue has a published release. The research-based method is in code; this review database has no published shared knowledge release. It does not auto-publish research drafts or ask Maria to construct a questionnaire.

Original files are private local development storage, not a production durable storage integration. Withdrawing a reference removes it and its linked sources from active use; it retains the original locally. Production upload storage intentionally stays unavailable until a durable adapter is selected.

## Paid provider boundary

The existing configured OpenAI key is read only into memory; it is never returned to the browser. No provider call is made merely by opening the page. The local gate fails closed without `.mira-local-data/connected-review/provider-approval.json`:

```json
{
  "scope": "local-mira-review",
  "approved": true,
  "maxRequests": 12,
  "expiresAt": "REPLACE_WITH_EXPLICITLY_APPROVED_EXPIRY",
  "allowedModels": ["gpt-5-mini", "gpt-transcribe", "gpt-4o-mini-tts"]
}
```

Create this file only after Maria authorises the bounded paid test. The offered test expires after two hours and caps all text/transcription/speech requests at 12 total. A persistent usage reservation occurs before dispatch; ambiguous failures count and there are no automatic retries/fallbacks. The schema caps the budget at 12. The approval file above is an illustration, not an approval or activation. Separate image-observation permission is absent by default (`allowImageObservation: true` would need its own authorisation); images can still be saved and described. Provider activation is checked on each request, and capability polling reflects it.

The local connection drawer now reports trial approval state, remaining requests and expiry from the server-owned persisted gate. A text reply uses one request; a voice exchange can use transcription, reply and speech, plus an initial spoken greeting when starting an empty conversation. Starting voice checks that this allowance is available; transcription refuses to start a new exchange with fewer than three requests left. Existing saved replies can still finish speech using their single remaining request, and a paused call can resume with text. This preflight avoids ordinary single-client partial exchanges; it is not an atomic multi-request reservation across concurrent browser tabs. The per-request hard cap remains authoritative. Reading status never makes a paid request or refills the allowance.

At completion of the connection work, **no approval file exists, no paid request was sent and no microphone was captured**. A capped-test approval question is pending. Live provider quality and real microphone/browser audio remain unverified until authorised. All automated provider tests use synthetic mocked responses.

For the authenticated application, existing MIRA feature flags remain off by default. The green session needs coach/call/interview configuration and a valid scoped workspace/conversation. Audio additionally needs `MIRA_COACH_AUDIO_ENABLED=true` and a configured OpenAI key; reference image observation separately needs `MIRA_COACH_REFERENCE_VISION_ENABLED=true`. No production settings were enabled or deployed.

## Verification, 27 October 2026

TypeScript, frontend and server builds passed. Full automated suite: 708 passed, 72 skipped; disposable SQL: 65 passed, one optional PDF case skipped. The frontend retains its existing bundle-size advisory.

Browser checks in the actual green page: synthetic text-file upload, link save, reload persistence, real timer start/pause/end, empty Results, phone reference gate/Next/navigation and scoped withdrawal. Test references and their linked sources were withdrawn afterwards. The review clock retains the approximately four seconds spent testing; it was not refilled. No synthetic client conversation or generated reflection was inserted into the user-facing review.

### Trial-readiness follow-up, 27 October 2026

Added persisted trial-state reporting, an expiry/exhaustion explanation, low-allowance voice preflight and an explicit paused-to-text option. Focused session/model checks: 28 passed; workflow/router/clock/runtime checks: 50 passed. TypeScript, frontend/server builds and whitespace checks passed. Existing frontend bundle-size advisory remains. The actual green page shows “Local trial: awaiting approval”; saved opening and approximately 59:56 remaining survived the isolated API restart. No approval file, paid request or microphone capture was created. Enabled/expired/exhausted usage accounting is covered by mocked-provider tests, not a live provider claim. Existing services remain on frontend 5183/API 5184.

### Direction-brief follow-up, 27 October 2026

Maria chose to continue local building while scanning the rest of Brand Management; live testing is deferred. Added the read-only `readDirectionBrief` service/API and green Results download from the exact current reviewed reflection. Missing/unknown/skipped topics remain distinct; one statement spanning several topics appears once. Preparation is evaluated per dimension and does not approve or generate creative direction. The first contract is personal-brand only; personal/small-business services return unavailable rather than inheriting business requirements. No model/provider is constructed or called by this path, and no database migration is added.

Verification: 148 subsystem tests passed, three optional PDF checks skipped; disposable socket-only SQL tests 67 passed/one optional extraction skipped. TypeScript, frontend/server builds and whitespace checks passed. SQL confirms read-only reload consistency, ownership/grants and withholding/rebuilding after corrections or memory withdrawal. Actual local API readback returned zero statements, `needs_confirmation`, unchanged revision and 3,596,186 ms remaining, with paid text/voice still disabled. Browser checked the restored green page and honest empty Results; no synthetic answers were added to Maria's review. Filled brief rendering/download is implemented and covered by logic/export tests, but has not been verified through an actual reviewed client browser journey. Frontend was found stopped and restored; keep frontend session 25765 and API launcher session 61661 running.
