# Mira V4 Living Implementation Specification

## Review protocol

This document records only the supplied screens and their verified implementation context. It preserves the current V4 architecture unless a minimal, explicit correction is needed to restore alignment. It does not infer requirements for screens that have not yet been reviewed.

## Screen 1 — Quick Context

**Review status:** Assessed. No implementation has been applied from this review.

### Verified current implementation

The current V4 journey renders four existing persisted fields in a fixed Quick Context form. The first field already reads **“What are you building?”**. The remaining fields currently use the legacy framing **“Where are you today?”**, **“What do you need most?”**, and **“What are you creating first?”**. Its action reads **“Let Mira hold this context”**. The screen layout, text-area structure, validation, persistence route, and existing client component are already intact.

| Area | Approved Screen 1 direction | Current V4 implementation | Alignment finding |
|---|---|---|---|
| Field 1 | Keep “What are you building?” | Already matches | Aligned; preserve unchanged. |
| Field 2 | “Who is this for?” with audience helper text | “Where are you today?” with starting-point helper text | Drift. The stored field is still named `currentPosition`. |
| Field 3 | “What should they feel?” with emotional-effect helper text | “What do you need most?” with need-state helper text | Drift. The stored field is still named `needMost`. |
| Field 4 | “What are we creating this Moodboard for?” with use-case helper text | “What are you creating first?” with Brand World helper text | Drift. The stored field is still named `firstCreation`. |
| Primary action | “Continue to Recognition” | “Let Mira hold this context” | Copy drift; the current mutation advances to the preserved Birth Details step. |
| Visual system and structure | Preserve | Existing card, typography, layout, form controls, validation, and route are reusable | Aligned; no redesign is required. |

### Root cause

This is not only a label issue. The existing persistence model was inherited from an earlier V3-style intake vocabulary: `currentPosition`, `needMost`, and `firstCreation`. Those raw property names are passed directly into both the Recognition question generator and the Creative DNA source payload. Therefore, changing labels only would make the customer enter audience, intended feeling, and Moodboard use-case evidence while the downstream model continues to interpret the same values as current position, need, and first creation.

The action-label drift has a separate cause. The current successful Quick Context mutation retains the approved journey sequence by advancing to `birth_details`, whereas the desired customer language names Recognition as the next destination. Whether that wording is acceptable depends on how the Birth Details screen explains itself; that screen has not yet been reviewed, so no flow-order change is recommended here.

### Smallest alignment-restoring implementation

Retain the existing database columns, tRPC procedure, route, client component, validation, and journey-state transition. Change only the four visible labels/helper texts and primary action wording required for this screen. At the two existing AI evidence boundaries, introduce a compact semantic alias object rather than renaming stored columns: map `building` to `building`, `currentPosition` to `audience`, `needMost` to `intendedFeeling`, and `firstCreation` to `moodboardUseCase`. Pass that alias to Recognition and Creative DNA synthesis while preserving the stored shape and all existing records.

The desired **“Continue to Recognition”** action text should be applied only after the Birth Details screen review confirms it frames itself as a short calibration step within the Recognition path. If it does not, the smallest honest alternative is a destination label that names Birth Details; this is a copy-to-transition dependency, not a reason to redesign the journey.

### Minimum regression coverage when implementation begins

Add one focused UI assertion for the new field labels, helpers, and action text. Add one focused server assertion showing that the semantic alias supplied to adaptive Recognition and Creative DNA maps the retained persisted fields to audience, intended feeling, and Moodboard use case. No database migration, new route, new stage, or additional AI call is justified for Screen 1.

### Screen 1 decision record

The current visual and engineering structure is reusable. The only open dependency is whether the exact primary-action copy truthfully represents the still-unreviewed Birth Details interlude. Screen 2 should resolve that dependency before the Screen 1 text is implemented.
