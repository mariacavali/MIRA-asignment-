# Mira V3 Optional Modules — Implementation Design

## Scope and boundaries

The optional modules extend a journey without weakening the core eight-turn reflection path. **Birth data is disabled by default** through `MIRA_V3_BIRTH_DATA_ENABLED`; image references are available only after explicit, purpose-specific consent. Neither module is required to complete reflection, generate the Mirror, confirm it, or open the three deliverables.

| Module | Input | Persistence | Output | Failure behavior |
|---|---|---|---|---|
| Birth data | Date, local time, timezone, city, country | `mira_v3_module_outputs` | Normalized intake plus an optional provider-adapter interpretation | Core journey remains available; module reports unavailable without inventing an interpretation |
| Image references | JPEG, PNG, or WebP after explicit consent | Private S3 object plus metadata in `mira_v3_media_assets` | Structured visual analysis restricted to observable design characteristics | Deterministic low-confidence result or explicit failed state; no sensitive inference |

## Birth-data contract

The intake uses ISO date, `HH:mm` local time, IANA timezone, city, and country. Validation rejects future dates, impossible dates or times, invalid IANA timezones, and overlong place strings. Inputs are normalized into one JSON module output with provenance and timestamps. A provider adapter interface separates intake persistence from any future astrology provider; the built-in adapter is intentionally unavailable until a real provider is configured and verified.

## Image-consent and lifecycle contract

Consent is versioned and purpose-specific: `visual_direction_reference_v1`. Upload is rejected unless an active consent row exists for the same owner and journey. Supported formats are JPEG, PNG, and WebP, with a five-megabyte decoded limit and server-side magic-byte verification. Object keys are scoped to owner and journey. Database ownership checks guard listing, signed preview access, analysis, deletion, and consent revocation.

Revoking consent marks the consent inactive and soft-deletes all active image assets for the journey so they can no longer be listed, previewed, analyzed, or included as evidence. The storage object remains inaccessible through the application after revocation; a future storage deletion API can replace this revocation boundary without changing the database contract.

## Structured image analysis

The vision prompt permits only observable visual characteristics: palette, lighting, material and texture cues, composition, motifs, and carry-forward or avoid guidance. It explicitly prohibits identity, age, ethnicity, gender, health, disability, emotion, personality, religion, politics, location, wealth, or other sensitive inference. Output is validated against a strict schema and stored with asset ID, model, token usage, fallback flag, confidence, limitations, and analysis version.

## Mirror integration

Validated module evidence is fetched by owner and journey immediately before Mirror generation. Birth intake and image-analysis summaries are appended as clearly labelled optional evidence; the eight user answers remain primary. The resulting immutable Reflection Bundle stores a compact module-evidence snapshot so edits, confirmation, deliverables, and PDFs remain reproducible even if consent is later revoked. Revocation prevents future regeneration from using deleted image evidence.

## Security and testing

Tests must prove feature-gate behavior, input normalization, consent prerequisites, MIME and size rejection, owner and journey scoping, revocation, deletion, prohibited-inference prompt rules, strict structured output, deterministic failure behavior, and immutable evidence snapshots. Browser validation will cover birth-data disabled behavior and one consent/upload/analyze/delete/revoke path without exposing private object URLs in public UI.
