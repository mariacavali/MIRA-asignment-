# Mira V4 — Current State

## Purpose

**Mira V4 is the Brand World and editorial-campaign journey.** It turns concise creative evidence into one coherent visual world and a final five-image Moodboard campaign. Its centre of gravity is not long-form self-recognition; it is making a brand direction visibly coherent across casting, styling, colour, light, materials, architecture, and emotional register. [1]

## Implemented Journey

| Stage | User action | Durable output |
|---|---|---|
| Quick Context | Defines what is being built, the audience, intended feeling, and Moodboard use case. | Stored creative context for downstream evidence mapping. [2] |
| Recognition | Takes part in a concise adaptive Creative Director conversation. | Structured creative evidence rather than a long-form report. |
| Typography Calibration | Chooses from visible type samples. | Typography evidence for the creative direction. |
| Creative DNA | Lets Mira synthesise the gathered evidence. | A versioned, owner-scoped Creative DNA record. |
| Visual Directions | Generates five distinct visual direction references. | A cached initial visual set. |
| Selection and Refinement | Selects a direction, names reasons, and completes one bounded refinement round. | A cached refined visual set. |
| Final Moodboard | Selects the refined continuity anchor and provides preserve/avoid instructions. | Five final connected editorial images. [3] |

## Visual-Generation Architecture

The final-generation path is deliberately bounded:

> **Creative DNA → Campaign Compiler → Maria visual-direction layer → five connected prompts → five generated images.** [3]

The Campaign Compiler establishes shared campaign grammar and five narrative roles. The documented compatibility seam, `applyTemporaryMariaVisualStylePlaceholder`, delegates internally to the authoritative Maria visual-direction layer; it is the sole V4 Moodboard entrypoint for that layer. The implementation keeps a common campaign world across the five prompts rather than treating them as five unrelated images. [3]

| Protective control | Current behaviour |
|---|---|
| Ownership | All V4 journey procedures are authenticated and owner-scoped. |
| Reuse | Creative DNA and visual sets use stored records and source fingerprints to prevent unnecessary repeated generation. [3] |
| Refinement limit | One explicit refinement round is supported. [3] |
| Image-edit safety | Generated internal paths are converted to signed HTTPS references before edit requests. [3] |
| Final contract | The final Moodboard is exactly five separate images, each with a different narrative role in one editorial campaign. [3] |

## What V4 Delivers

The customer-facing outcome is a **five-image editorial Moodboard campaign**. The verified final roles are: **The world opens**, **The human presence**, **Material intelligence**, **Architectural pause**, and **Closing continuity**. The completed private run kept the initial and refined visual sets intact while rendering all five final images. [3]

## Integrations

V4 currently uses model-supported creative synthesis and image generation, together with the authoritative Maria visual-direction adapter. **Human Design and Dakidarts are not active inputs to the current V4 Moodboard pipeline.** V4 may retain private birth details from prior architecture, but it is not the present V4 source of creative direction.

## Current Operating Status

The end-to-end V4 pipeline was authenticated and completed successfully in private staging for Journey 1, including the final five-image Moodboard. [3] A later attempt to generate Visual Directions for Journey 210001 was blocked upstream because the image-generation provider reported that the account had exhausted usage. The journey state is preserved and retryable; the V4 mutation now returns an explicit temporary-service message and records a dedicated retryable error code rather than presenting the condition as an unexplained generic failure. This remains an external service availability constraint, not a loss of stored V4 evidence.

## Product Role

V4 answers the practical creative question: **“What should this brand world look and feel like as one coherent editorial campaign?”** It is the stronger product when a user already has enough direction to choose visual language, images, styling, and campaign coherence.

## References

[1]: ./V4_LIVING_IMPLEMENTATION_SPEC.md "Mira V4 Living Implementation Specification"
[2]: ./V4_LIVING_IMPLEMENTATION_SPEC.md "Screen 1 — Quick Context"
[3]: ./V4_REFINEMENT_RETRY_VALIDATION.md "V4 Refinement Retry Validation"
