# FREE_MIRA_RAILWAY_V3

Captured 2026-11-06. Status: **staging**. Intended audience: **free**.
This is the free lead-magnet application currently on Railway. A private sign-in gate does not make it a paid product.

## Source and scope

`source.zip` contains all 35 verified V3 source/test/prompt files: three React pages, the complete `server/miraV3/` directory, and the existing V3 prompt archive. `SOURCE_MANIFEST.json` records individual hashes. `PROVENANCE.json` records the matching read-only fingerprint from deployment. This preserves the complete V3 module; it is **not a standalone clone of the multi-version host application**. Common host code, authentication adapters, dependencies, styling, root router registration and database schema are external dependencies, not invented replacements. Other saved client/server modules differ from deployment and are deliberately excluded.

## Entry flow

Observed public opening: “A quieter place to hear what is already true.” → “Enter the private experience”. Source flow after authentication: “Begin where the performance ends.” → “Begin with a pause” → three manually advanced meditation screens → create persisted journey → birth-context gate → reflection conversation. The free saved-project Path A/Path B selector is not implemented in the captured V3 entry component.

## Email timing/collection point

No dedicated free lead-magnet email capture or Flodesk flow exists in the captured V3 module. Authentication is required before the journey, but an account email is not evidence of marketing opt-in, report email delivery or a completed lead-magnet capture. Do not relabel authentication as email capture.

## Output behaviour

Eight accepted answer turns gate Mirror synthesis. An explicit incomprehension answer is rephrased without saving/counting a turn. The person can edit or confirm the Mirror (“This feels true”). Confirmation gates three document outputs: Brand Soul File, Brand Expression Guide and Shoot Mood Board. Direct PDF download and storage-backed render procedures are implemented. These are source findings, not proof that live outputs currently work.

## What is implemented

Persisted owner-scoped journeys/messages/sessions; one-question reflection UI; 24-hour session records with replacement session creation on return; leave/resume navigation; rephrasing; eight-turn completion gate; Recognition/Mirror generation; Mirror edits/confirmation; document transformation; PDF generation/download; separate optional reference-image consent/storage/analysis paths; birth-context code behind an environment flag. Runtime model prompts are in the archived `.ts` files; old Markdown prompt contracts are preserved unchanged and can lag runtime wording.

## What is not implemented

The newly approved free-MIRA terminal diagnosis contract is not implemented here: no verified segment-specific stop rules, immediate visual/general diagnosis, mandatory final prefix “This is what’s actually happening.” or optional non-blocking lead email prompt. No separate free email/Flodesk delivery step appears in this module. No paid upsell or €24 archive is added to this capture.

## Known issues and untested behaviour

Earlier public incognito inspection in this conversation: homepage and 390-pixel mobile opening load; `auth.me` returns HTTP 200 with JSON `[{"result":{"data":{"json":null}}}]`; clicking the entry button throws an invalid-URL error because `VITE_OAUTH_PORTAL_URL` is missing. `OAUTH_SERVER_URL` is also missing. A previous read-only database connection attempt was denied; applied migration state is unverified, although deployed source journal was previously observed through 0007. No database access was attempted for this versioning capture.

Source inspection reveals another gate: journeys begin at `birth_context`; the UI cannot continue when the birth-data module is disabled, and `skipBirthData` rejects skipping. The earlier variable-name inspection did not show `MIRA_V3_BIRTH_DATA_ENABLED`; its configuration defaults to false. This is a source-derived blocker beyond sign-in, not a newly exercised live journey.

Authenticated new session, answers, refinement/Mirror edits, completion, email behaviour, PDFs, return/expiry behaviour and full mobile journey remain untested live. No repeated end-to-end run was performed. Existing archived tests are preserved but were not executed. See `UI_ROUTES_BEHAVIOUR.md`.

## Rollback instructions

This archive is inert and is not registered in the live app. No rollback action is needed for this task. For a future, separately authorised rollback: verify `MANIFEST.json` and ZIP entry hashes; extract into a **new isolated directory**, never over the current checkout; recover the matching host application/dependency lock/authentication/styling/schema separately; compare schema compatibility read-only; review the complete diff and test before requesting deployment approval. Do not run `db:push`, migrations, reset commands or restore database rows from this archive. Missing host provenance or schema compatibility blocks rollback. Keep this capture unchanged; create a new revision for corrections.
