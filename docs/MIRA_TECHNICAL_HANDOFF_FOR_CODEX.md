# Mira Technical Handoff for Codex

**Scope.** This is a read-only technical handoff of the private `mira-v3-staging` repository as inspected on 2026-08-12. It describes what exists in code and the deployed schema, not a proposed future architecture. **No product redesign is implied by this document.**

The repository contains two intentionally isolated product surfaces under one React, Express, tRPC, Drizzle, and MySQL/TiDB project. V3 is the Recognition and confirmed-deliverables system; V4 is the Creative DNA-to-editorial-Moodboard system. They share authentication, database infrastructure, Forge-backed model/image helpers, storage helpers, and UI shell conventions, but they do **not** share their journey tables, router namespaces, or state machines. [1] [2] [3]

| Surface | Browser routes | tRPC namespace | Persistence boundary |
|---|---|---|---|
| **Mira V3** | `/`, `/mira-v3`, `/mira-v3/journey/:journeyId`, `/mira-v3/results/:journeyId` | `miraV3` | `mira_v3_*` tables |
| **Mira V4** | `/mira-v4`, `/mira-v4/journey/:journeyId` | `miraV4` | `mira_v4_*` tables |

## IMPLEMENTED & WORKING

### Mira V3

V3 is implemented as an authenticated, owner-scoped Recognition journey. It has a persisted journey/session/message model, one-at-a-time reflection, an eight-substantive-answer gate, an editable/confirmable Mirror, and confirmation-gated deliverables. All primary V3 router procedures are protected by the V3 feature gate and current authenticated user ID. [4] [5]

| Implemented V3 capability | Working contract |
|---|---|
| **Journey and conversation** | Meditation entry, active session, ordered messages, adaptive question generation, explicit incomprehension rephrasing, and the eight-answer gate before Mirror synthesis. [4] [5] |
| **Private birth context** | Full birth-data input is validated and can call the configured Dakidarts adapter. It is normalized to one hidden Recognition Layer rather than exposed as calculations or provider terminology. It has safe `unavailable`/`failed` fallbacks. [4] [6] |
| **Consent-gated reference images** | Private upload, owner checks, type/size/count limits, explicit upload/analysis consent, signed retrieval for analysis, bounded analysis, removal, and failed-analysis handling are implemented. [4] [5] |
| **Recognition and Mirror** | Final Recognition is cached by fingerprint in module outputs, generated from conversation first, then optional private context and image evidence, and used to build an immutable Mirror draft/revision. [4] [7] |
| **Confirmed output gate** | A confirmed Mirror revision is required before the Brand Soul File, Brand Expression Guide, Brand Mood Board/Project Mood Board, HTML rendering, or PDF download can be accessed. [4] [8] |
| **PDF and storage** | Server-side HTML-to-PDF rendering, S3-backed storage, artifact persistence, and deterministic failure recording are implemented. [4] [5] |

The V3 deliverable contract is fixed at three internal kinds: `mirror`, `brand_soul`, and `visual_direction`. Customer-facing titles intentionally map to **Brand Soul File**, **Brand Expression Guide**, and **Shoot Mood Board**. The visual deliverable supports `brand` and `project` modes, but it is a document-level visual-direction output, not V4’s generated five-image campaign. [8]

### Mira V4

V4 is implemented as a distinct authenticated Brand World journey. The current rendered path is: Quick Context → Birth Details → Recognition → Creative Brief → Creative Discovery → optional Inspiration → pre-generation hold → Creative DNA → initial visual directions → one refinement round → final five-image Moodboard. The client only renders the implemented V4 step set; the `brand_dna` and `brand_book` enum values are not rendered or used as active V4 flow steps. [2] [3] [9]

| Implemented V4 capability | Working contract |
|---|---|
| **Quick Context and Birth Details** | Persists `building`, legacy-named context fields, birth date/time/city/country/timezone, and maps the retained fields semantically for Recognition. Birth data is stored; it is not an active V4 Human Design or numerology computation. [2] [10] |
| **Recognition and Creative Discovery** | Stores phase-specific ordered turns. It starts from deterministic first questions, makes a limited number of `gpt-5-mini` adaptive calls, and applies deterministic fallbacks/scope guards when model output is invalid or out of scope. [11] [12] |
| **Creative DNA** | A single structured `gpt-5-mini` synthesis produces a versioned JSON Creative DNA record from journey context, messages, creative inputs, and optional inspiration evidence. The service handles Azure-compatible nullable schemas and both string and structured-array completion content. [13] |
| **Campaign Compiler** | Deterministically maps validated Creative DNA into a five-scene `MiraV4CampaignPlan` and shared campaign language. It makes no provider, database, storage, date, random, or model call. [14] |
| **Visual Direction** | Generates a cached initial set of five editorial reference images, requires one chosen reference, then permits one cached refinement round. [9] [15] |
| **Final Moodboard** | Builds exactly five scene prompts and generates five separate images belonging to one campaign: **The world opens**, **The human presence**, **Material intelligence**, **Architectural pause**, and **Closing continuity**. [14] [15] |
| **Real validation** | One authenticated private Journey 1 completed the final five-image Moodboard run, including reuse of initial/refined visual sets. [16] |

## PARTIALLY IMPLEMENTED

The following items have code or schema presence but are not complete customer-facing product capabilities.

| Area | Current state | Exact limitation |
|---|---|---|
| **V4 `brand_dna`, `brand_book`, and `brand_dna_confirmed` states** | Declared in the V4 schema/status enums. | No V4 router procedure or client stage uses the `brand_dna`/`brand_book` steps; no V4 Brand Book/PDF/export pipeline exists. [2] [9] |
| **V4 birth details** | Stored and passed into the Creative DNA source object. | They are not connected to Dakidarts, Human Design, or any V4 private-profile provider. [2] [13] |
| **V3 welcome video** | Visible UI location and test coverage exist. | It is explicitly labelled `Welcome video · placeholder`; no actual hosted video delivery is implemented. [17] |
| **V3 optional birth context** | The adapter and conditional live provider integration are real. | It activates only when both `MIRA_V3_BIRTH_DATA_ENABLED=true` and a usable `DAKIDARTS_API_KEY` are present. Without either condition, the system deliberately stores an unavailable/fallback result and continues from conversation evidence. [4] [6] [18] |
| **V4 Maria Python source** | The authoritative Python source is preserved verbatim in the repository. | Node does not import or execute the Python file at runtime. V4 uses the TypeScript adapter, which encodes its runtime mapping and prompt layer. A future Python-source change therefore requires deliberate adapter reconciliation. [19] [20] |
| **Provider-backed live verification** | Automated V3/V4 tests are extensive and a real V4 Moodboard run succeeded earlier. | Most regression tests mock LLM/image/storage providers. Current new V4 image calls are blocked by upstream image-service usage exhaustion. [16] [21] |

Historical specifications and project briefs should not be treated as runtime truth. The live sources of truth are the tRPC routers, Drizzle schema/migrations, shared Zod schemas, persisted records, and the current client step rendering. The V4 living review specification is primarily a review/history artifact, not a substitute for the state machine. [2] [9]

## NOT IMPLEMENTED

The following are absent from active TypeScript/TSX implementation and should not be assumed to exist.

| Capability | Status |
|---|---|
| **Human Design API/provider** | No active Human Design implementation, credential, route, schema, or UI reference was found in active V3/V4 source. |
| **Gene Keys implementation** | No active calculation, provider, or UI implementation was found in active V3/V4 source. |
| **V4 Brand Book or V4 PDF export** | Not implemented. The schema’s `brand_book` step is not a functional output stage. [2] [9] |
| **V4 image download/share/campaign asset management** | The five generated URLs are persisted/rendered, but no dedicated V4 export, sharing, asset library, or image lifecycle UI is implemented. [2] [15] |
| **Automatic V3-to-V4 handoff** | No code transfers a V3 confirmed Mirror/Brand Soul File into V4 Quick Context or Creative DNA. The products remain data-isolated. [1] [2] |
| **Runtime execution of `maria_visual_style.py`** | Not implemented. The runtime uses TypeScript. [19] [20] |

## IMPORTANT DEPENDENCIES

### Technical seams

The V4 flow has deliberate seams. Their order and contracts matter because each one narrows/locks a different kind of evidence.

| Seam | Input | Output | Implementation location | Why it matters |
|---|---|---|---|---|
| **Recognition** | Quick Context aliases, limited conversation transcript, Creative Brief evidence | Ordered `mira_v4_messages` content and creative evidence | `server/miraV4/reflection.ts`, `router.ts`, `db.ts` | Adaptive question generation is bounded and has deterministic fallbacks. Do not convert it into an unbounded chat without changing state/cost behaviour. [11] [12] |
| **Creative DNA** | Owned journey, all V4 messages, creative inputs, optional inspiration URL/explanation | One validated, versioned `creativeDnaJson` | `server/miraV4/creativeDna.ts`, `db.ts` | One record per journey. Strict JSON schema, Azure nullable-union normalization, structured-content extraction, and a 4,096 completion budget are already required provider-compatibility safeguards. [2] [13] [22] |
| **Campaign Compiler** | Validated Creative DNA | Deterministic five-scene Campaign Plan and composite campaign language | `server/miraV4/campaignCompiler.ts` | Pure function with no side effects. It is the shared visual continuity contract and is inexpensive to preserve. [14] |
| **Maria visual style** | Creative DNA + Campaign Plan + scene index + generated base prompt | Maria-layered final scene prompt | `server/miraV4/mariaVisualStyle.ts` → `server/miraV4/moodboard.ts` | The stable documented entrypoint is `applyTemporaryMariaVisualStylePlaceholder`, which delegates to `applyAuthoritativeMariaVisualStyleLayer`. Retain the compatibility seam name unless every dependent document/test is updated deliberately. [19] [20] |
| **Image generation** | Initial prompt, or prompt + signed HTTPS selected image | S3-backed generated URL | `server/_core/imageGeneration.ts` | Image editing rejects relative `/manus-storage/` paths. `resolveImageInputUrl` must convert them to short-lived signed HTTPS URLs before refinement/final calls. [15] [21] |
| **Final five-image Moodboard** | Refined reference + preserve/avoid/note + Campaign Plan + Maria layer | One completed `moodboard` visual-set record with five references | `server/miraV4/moodboard.ts`, `router.ts`, `db.ts` | The five images are separate provider calls, but prompts carry the same locked campaign grammar and different narrative roles. [14] [15] |

### Shared platform dependencies

| Dependency | Used by | Current use |
|---|---|---|
| **Manus OAuth / protected tRPC procedures** | V3 and V4 | Auth context supplies `ctx.user`; product records are owner-scoped. [1] [4] |
| **MySQL/TiDB + Drizzle** | V3 and V4 | Authoritative relational persistence and transaction boundaries. [2] [5] |
| **Forge Chat Completions** | V3 and V4 | Shared `invokeLLM` helper, currently using `gpt-5-mini` for Recognition, adaptive questions, and Creative DNA. The helper retries upstream failures with backoff and validates completion envelopes. [11] [13] [22] |
| **Forge ImageService** | V4 | Default `MODEL_GPT_IMAGE_2`; medium quality for initial/refined directions and high quality for final Moodboard images. [15] [21] |
| **S3 storage helpers** | V3 and V4 | Private V3 media/PDF artifacts; V4 inspiration asset and generated-image persistence. [4] [21] |
| **Dakidarts / Numerology API** | V3 only | Conditional server-side 13-endpoint private context adapter, normalized into one hidden Recognition Layer. [6] [18] |

## DO NOT BREAK

### Isolation, ownership, and routing

Keep the `miraV3` and `miraV4` tRPC namespaces, route families, and `mira_v3_*`/`mira_v4_*` persistence domains separate unless a migration is intentionally designed and executed. The root route currently belongs to V3, so replacing root routing will affect the live V3 entry experience. [1] [3]

Every Mira data read and mutation assumes the authenticated `userId` is included in ownership predicates. Removing these predicates from a consolidation layer can leak journeys, reference images, Creative DNA, provider outputs, PDFs, or generated visual sets across users. [4] [5]

### V3 confirmation and evidence gates

Do not allow V3 deliverables before a confirmed Mirror revision. The Mirror revision history is immutable/versioned, and the deliverable gate checks both journey status and revision status. Do not surface birth/provider terminology, raw numerology results, or hidden-layer content in V3 customer-facing output. Conversation evidence remains primary. [4] [5] [6] [8]

### V4 state, idempotency, and versioning

Preserve the V4 uniqueness and state assumptions:

| Invariant | Existing mechanism |
|---|---|
| One Creative DNA record per journey | `mira_v4_creative_dna_journey_uidx`; `in_progress`/`complete`/`retryable_error` claim lifecycle. [2] [22] |
| One visual record per journey/stage | `mira_v4_visual_sets_journey_stage_uidx` for `initial`, `refined`, and `moodboard`. [2] [22] |
| Bounded fingerprints | SHA-256 produces 64-character source fingerprints to fit the database field and prevent prior overlong-key failures. [14] [15] |
| Safe retries | Failed claims become `retryable_error`; repeat actions claim the existing row rather than creating parallel work. [22] |
| Exact Creative DNA completion transition | Completion atomically advances the journey only when it is at `pre_generation_mirror`, with exactly 2 Recognition turns and 5 Creative Discovery turns. [22] |
| One refinement round | The completed refined visual set is returned/reused rather than regenerated. [15] |
| Final Moodboard contract | A completed Moodboard requires five references; cached completion returns those URLs rather than regenerating. [15] |

### Maria seam and inspiration policy

Do not bypass the Maria layer by calling the image service directly with only a Campaign Plan. `buildFinalMoodboardPrompts` compiles a Maria visual direction and routes every scene through the compatibility seam. The inspiration explanation is **interpretive creative evidence only**; it must not be treated as a literal prompt to reproduce subjects, objects, poses, scenes, or composition from a supplied image. [14] [19] [20]

## KNOWN ISSUES

| Issue or debt | Current consequence | Evidence / status |
|---|---|---|
| **Upstream image-provider usage exhaustion** | New V4 Visual Direction generation on Journey 210001 fails before initial visual references are completed. Progress is retained as `retryable_error`; the UI now receives a specific temporary-service message. | This is an external availability/usage condition, not a database corruption issue. [15] |
| **Provider-dependent V4 validation** | V4 completed one real five-image Moodboard earlier, but fresh generation cannot currently be revalidated without available image-service usage. | Automated pipeline tests remain mocked. [16] [21] |
| **V3 welcome video placeholder** | The entry UI announces a placeholder rather than serving video media. | Explicitly present in the V3 client and regression test. [17] |
| **Schema-only V4 states** | `brand_dna`, `brand_book`, and `brand_dna_confirmed` can mislead a takeover engineer into assuming output stages exist. | They are declared but not part of the active router/UI flow. [2] [9] |
| **V4 partial provider-call cleanup** | Initial/refined/final image batches use `Promise.all`. If one image call fails after another succeeds, the visual-set row is retryable, but successful provider-created storage objects are not persisted as a partial set or explicitly cleaned up. | This is code-path debt; it is not recorded as a data-loss incident. [15] [21] |
| **Generated-image storage key shape** | Shared helper stores generated images at `generated/${Date.now()}.png`, not under a user/journey-specific key. | Existing URLs are persisted into user-scoped visual-set rows, but storage naming and lifecycle are less explicit than V3’s private reference-image key convention. [5] [21] |
| **Migration reconciliation** | V4 `birthCountry`/`birthTimezone` and visual-set migrations must exist in the target database before replaying or moving V4. | Verify target schema against Drizzle schema and migrations `0006`/`0007`; earlier staging work included schema-drift recovery around V4 birth fields. [2] [23] [24] |

## HANDOFF NOTES

### Non-obvious implementation knowledge

1. **Maria is a TypeScript runtime adapter, not a Python runtime dependency.** The authoritative Python source sits at `server/miraV4/authoritative/maria_visual_style.py` for preservation. Production prompt generation calls `mariaVisualStyle.ts`. A change to one does not automatically change the other. [19] [20]

2. **The compatibility seam name is intentionally legacy.** `applyTemporaryMariaVisualStylePlaceholder` sounds temporary, but it is now the documented, tested wrapper around `applyAuthoritativeMariaVisualStyleLayer`. It was retained to preserve the implementation specification and regression contract. [19] [20]

3. **V4’s legacy database field names carry product semantics.** The retained `currentPosition`, `needMost`, and `firstCreation` values currently mean, respectively, the user’s relationship to the work, the audience feeling to create, and the Moodboard purpose. The UI labels and downstream Recognition mapping are aligned around those meanings; do not rename, reuse, or reinterpret the keys casually during consolidation. [10] [11] [12]

4. **Creative DNA has hard-won provider compatibility code.** Do not remove nullable-schema normalization, structured content-array extraction, the 4,096 completion-token budget, or shared LLM completion-envelope validation during refactoring. These guard against live strict-schema provider failures that were encountered and repaired. [13] [22]

5. **Retryability is persisted, not merely a UI concept.** Creative DNA and each visual stage use `in_progress`, `complete`, and `retryable_error` rows. The claim-before-provider-call pattern is what prevents double-click and retry requests from spending duplicate model/image calls. [2] [22]

6. **V4 image edits require signed URLs.** Generated images come back as internal storage paths. Refinement and final Moodboard calls must pass `resolveImageInputUrl(selected.url)` before `generateImage`; passing `/manus-storage/...` directly triggers the image provider’s URL/SSRF guard. [15] [21]

7. **V3’s Dakidarts integration is real but intentionally hidden and conditional.** It makes a batch of approved provider requests only when configured, compresses results into weak contextual hypotheses, stores no raw vendor response by design, and must never show numerology vocabulary or calculations to the user. Human Design is absent. [4] [6] [18]

8. **The most useful takeover starting points are not the marketing/UI files.** Start with `drizzle/schema.ts`, `server/routers.ts`, the two product routers, `server/miraV4/db.ts`, `creativeDna.ts`, `campaignCompiler.ts`, `moodboard.ts`, `mariaVisualStyle.ts`, and V3’s `router.ts`/`birthData.ts`. Those files encode the actual state and provider contracts. [1] [2] [4] [13] [14] [19] [22]

9. **Recent validation status.** The latest local full suite completed with **120 passing tests and 3 intentionally skipped tests**, and the production build completed successfully. That does not eliminate the current external image-usage limitation for new V4 visual generation.

## References

[1]: ../server/routers.ts "Top-level tRPC router composition"
[2]: ../drizzle/schema.ts "Mira V3 and V4 database schemas"
[3]: ../client/src/App.tsx "Client route wiring"
[4]: ../server/miraV3/router.ts "Mira V3 authenticated router and gates"
[5]: ../server/miraV3/db.ts "Mira V3 persistence helpers"
[6]: ../server/miraV3/birthData.ts "Conditional Dakidarts adapter and hidden Recognition Layer"
[7]: ../server/miraV3/recognition.ts "Mira V3 Recognition engine"
[8]: ../server/miraV3/deliverables.ts "V3 deliverable contract"
[9]: ../client/src/pages/MiraV4Journey.tsx "Implemented V4 client stages"
[10]: ./V4_LIVING_IMPLEMENTATION_SPEC.md "V4 field semantics and review history"
[11]: ../server/miraV4/reflection.ts "V4 Recognition and Creative Discovery engine"
[12]: ../server/miraV4/router.ts "V4 authenticated router"
[13]: ../server/miraV4/creativeDna.ts "Creative DNA structured-output service"
[14]: ../server/miraV4/campaignCompiler.ts "Deterministic V4 Campaign Compiler"
[15]: ../server/miraV4/moodboard.ts "Visual prompt construction and fingerprints"
[16]: ./V4_REFINEMENT_RETRY_VALIDATION.md "Authenticated five-image V4 validation record"
[17]: ../client/src/pages/MiraV3Journey.tsx "V3 welcome-video placeholder"
[18]: ../server/_core/env.ts "Feature flags and provider configuration"
[19]: ../server/miraV4/mariaVisualStyle.ts "Authoritative Maria visual-style runtime adapter"
[20]: ../server/miraV4/authoritative/maria_visual_style.py "Preserved authoritative Maria source"
[21]: ../server/_core/imageGeneration.ts "Shared Forge ImageService and signed-input helper"
[22]: ../server/miraV4/db.ts "Creative DNA and visual-set claim lifecycle"
[23]: ../drizzle/0006_demonic_blizzard.sql "V4 birth country/timezone migration"
[24]: ../drizzle/0007_wild_red_ghost.sql "V4 visual-set and journey-step migration"
