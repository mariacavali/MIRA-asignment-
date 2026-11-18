# Railway free MIRA: observed UI and source-derived behaviour

Evidence date: 2026-11-06. Prior public observations are reused to minimise credits; this task does not repeat an end-to-end journey.

| Surface | Evidence | Result |
|---|---|---|
| `/` | Earlier public incognito browser | Loads “Mira V3 Private Staging”, “Private staging”, the quiet-place opening and entry button. |
| Mobile opening | Earlier browser at 390 × 785 CSS pixels | Readable card, text and entry button; full journey not exercised. |
| Entry button | Earlier browser/Network/Console | Invalid OAuth URL exception; no session-start request is sent. |
| `/api/trpc/auth.me` | Earlier browser Network response | HTTP 200, JSON null user; not an HTML fallback. This does not prove all authenticated endpoints. |
| `/mira-v3` | Navigation targets in captured V3 pages | V3 entry target; public routing beyond the observed `/` is not independently proven in this task. |
| `/mira-v3/journey/:journeyId` | Captured entry/journey source | Journey creation and return targets; authenticated route remains untested. |
| `/mira-v3/results/:journeyId` | Captured journey/results source | Confirmed output navigation; live result/PDF state remains untested. |

## Coded conversation

Three pre-session meditation texts: “Let your shoulders soften. Nothing needs to be solved yet.”; “Take one slower breath. Notice what has been asking for your attention.”; “Leave the polished answer outside. Bring only what feels true.” These advance on user action, not an evidenced automatic timer.

The first stored reflection question is “When you feel most like yourself, what are you doing—and what becomes possible in that moment?” Subsequent runtime prompt focus sequence: purpose/change → values → hidden conflict/protection → natural voice → leadership/people → becoming/release → integrating decision. The runtime system prompt explicitly says “Do not diagnose” during adaptive questions. It asks for a brief acknowledgement and one deeper question, with a 24–58-word instruction. Full verbatim prompts/fallbacks are preserved in `source.zip` under `server/miraV3/`.

The eight-turn counter controls synthesis; it is not a segment-specific diagnosis stop trigger. On completion the UI offers “Show me what you heard”; the Mirror heading is “This is what Mira heard.” The person confirms “This feels true” before opening the three documents. This differs from the approved short final insight prefix and completion immediately after diagnosis.

## Pause, return and end

“Begin with a pause” opens a three-step pre-session meditation. “Leave and resume later” navigates back to the entry; database-backed messages remain stored. The source replaces a missing/expired active 24-hour session when loading a journey. It does not prove a timed in-conversation pause state. After eight accepted turns, additional reflection answers are rejected; this is separate from the new rule to stop as soon as the segment diagnosis is complete. The captured free module has no sales prompt or a “Do you want me to send this?” lead-email gate.

## API procedures in the captured router

The V3 module defines owner-authenticated, feature-gated procedures including listJourneys, createJourney, getJourney, getBirthData, saveBirthData, skipBirthData (rejects), getMediaState, setMediaConsent, uploadReferenceImage, removeReferenceImage, analyzeReferenceImage, submitReflectionTurn, rephraseReflectionQuestion, generateMirrorDraft, regenerateMirrorDraft, saveMirrorEdit, confirmMirror, getDeliverables, getDeliverableHtml, downloadDeliverablePdf and deleteJourney. The namespace/HTTP host registration is an external dependency. Consult the exact archived router for all inputs and procedure names; this document is not a replacement API specification.

## Database and environment

The captured module uses existing MySQL/TiDB/Drizzle `miraV3*` tables and the shared users/authentication layer. Snapshots contain no database rows or credentials. Missing authentication variables and rejected existing database credentials prevent live readiness. The package scripts inspected earlier were build=`vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist`, start=`NODE_ENV=production node dist/index.js`, and db:push=`drizzle-kit generate && drizzle-kit migrate`; only the first two were used by the earlier restoration. No command is executed by this archive.
