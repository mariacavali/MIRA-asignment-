# MIRA AI and Data Inventory

This inventory describes verified implementation behavior without making legal or compliance conclusions.

| Component | Input | Processing | Output | Provider | Stored? | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication | OAuth session/cookie and user identity | Builds request context; protected tRPC procedures require a user and use owner predicates | Authenticated, owner-scoped access | Manus OAuth/platform | User record/session-related data | **IMPLEMENTED** |
| V4 quick context | What is being built, audience, intended feeling, moodboard use case | Validation and semantic mapping from retained field names | Journey context | Application server | MySQL/TiDB | **IMPLEMENTED** |
| V4 birth details | Date, optional time, city, country, timezone | Validated and attached to the V4 journey/Creative DNA source | Stored context | Application server | MySQL/TiDB | **IMPLEMENTED; not an active V4 Human Design or numerology calculation** |
| V4 recognition answers | Short user responses | Deterministic first question plus bounded adaptive generation and fallbacks | Ordered recognition evidence | Forge chat completions; `gpt-5-mini` in code | MySQL/TiDB messages | **IMPLEMENTED** |
| V4 creative discovery | Creative brief and bounded answers | Adaptive prompts with validation and deterministic fallback | Creative evidence | Forge chat completions; `gpt-5-mini` in code | MySQL/TiDB | **IMPLEMENTED** |
| V4 inspiration image | Optional JPEG/PNG/WebP plus user explanation | Validated upload; signed URL may be supplied as supporting synthesis evidence | Inspiration reference | Forge/S3-backed storage; Forge chat completion for synthesis | Object plus metadata/storage key | **IMPLEMENTED** |
| Creative DNA | Journey context, messages, brief, optional inspiration evidence | One structured-output synthesis validated against a versioned schema | Creative DNA JSON | Forge chat completions; `gpt-5-mini` | MySQL/TiDB | **IMPLEMENTED** |
| Campaign compilation | Validated Creative DNA | Pure deterministic five-scene compilation; no model/provider call | Campaign plan and composite prompt | Local TypeScript | Derived into generation flow | **IMPLEMENTED** |
| Visual directions and moodboard | Creative DNA, campaign plan, selected image, preserve/avoid instructions | Maria prompt layer; initial generation, one refinement, five final calls | Initial/refined sets and final five-image moodboard | Forge ImageService; `MODEL_GPT_IMAGE_2` | Visual-set records plus S3-backed assets | **IMPLEMENTED; provider availability constrained in later validation** |
| V3 recognition conversation | Eight substantive answers and optional compact evidence | Adaptive questioning, recognition synthesis, editable/confirmable Mirror | Mirror and three confirmation-gated document outputs | Forge chat completions | MySQL/TiDB; PDFs in object storage | **IMPLEMENTED and separate from V4** |
| V3 personal reference images | Up to six consent-gated images | Type/size/count checks, private storage, signed retrieval, bounded analysis | Compact analysis evidence or failure state | Forge/S3-backed storage and model service | Image objects, metadata, consent and analysis records | **IMPLEMENTED/OPTIONAL** |
| Level-based personal reference image | One image uploaded in `/mira-1` Level 2 | Stored and optionally used as an identity anchor for selected create frames | Image-conditioned generated frame | Forge/S3-backed storage and Forge ImageService | Object plus message provenance | **PARTIAL level-based extension** |
| Dakidarts numerology | V3 birth details when both feature flag and credential are enabled | Server-side API calls normalized into a hidden qualitative Recognition Layer | Optional contextual hypotheses; raw response is not retained by design | Dakidarts / Numerology API | Normalized module result | **OPTIONAL; V3 only** |
| Human Design | No verified active input | No active provider or calculation | None | Not confirmed from the available implementation | No active Human Design record identified | **NOT IMPLEMENTED** |
| Notion knowledge retrieval | Approved knowledge database when enabled; otherwise local corpus | Fetches/normalizes approved knowledge objects with fallback | Supporting knowledge signals | Notion API or local fallback | Journey-derived evidence may be stored | **OPTIONAL/PARTIAL level-based extension** |
| Database | Application records and state transitions | Drizzle queries and migrations over MySQL/TiDB | Persistent structured records | MySQL/TiDB | Yes | **IMPLEMENTED** |
| Object/file storage | Images, generated assets, V3 PDFs | Forge presigning, direct S3 upload, signed retrieval | Private object paths/URLs | Forge storage gateway and S3 | Yes | **IMPLEMENTED** |

No n8n workflow is present in the verified repository architecture. Production data locations, processor regions, retention periods, and deletion operations are not confirmed from the available implementation.
