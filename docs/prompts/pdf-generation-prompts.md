# PDF Generation Prompts

Mira V3 uses **no generative model during PDF creation**. PDFs are deterministic renderings of the active confirmed revision. This prevents a downloaded document from silently diverging from the interface the user approved.

## Shared document contract

```text
Header: Mira · Private confirmed document
Source: Active confirmed Mirror revision only
Privacy: Owner-scoped private artifact
Failure message: The PDF could not be prepared. Please try again.
```

## The Mirror PDF template

1. Title and subtitle
2. Your returning sentence
3. What has always been true
4. The thread
5. Who this is for
6. Recognition
7. What this came from — exact quote and confirmed turn number

Filename: `mira-{{journey_id}}-the-mirror.pdf`

## Brand Soul File PDF template

1. Title and subtitle
2. Core truth
3. Natural gift
4. The felt experience
5. The people who recognise it
6. Direction
7. Voice qualities
8. What this came from — exact quote and confirmed turn number

Filename: `mira-{{journey_id}}-brand-soul-file.pdf`

## Visuals That Feel Like You PDF template

1. Title and subtitle
2. Atmosphere
3. Palette with name, value, rationale, and source turn
4. Typography with rationale and source turn
5. Layout and composition with source turns
6. Photography with source turn
7. Shoot list with source turns
8. Website direction with source turn
9. Logo direction with source turn
10. What this came from — exact quote and confirmed turn number

Filename: `mira-{{journey_id}}-visuals-that-feel-like-you.pdf`

## Rendering rules

| Rule | Requirement |
|---|---|
| Content source | Rebuild deliverables from the active confirmed Reflection Bundle |
| Escaping | Escape all user and generated text before HTML rendering |
| Mutation | PDF generation must not change journey or revision state |
| Artifact lifecycle | Record pending, then ready or failed |
| Storage failure | Return a stable user-visible error and preserve confirmed state |
| Output validation | Non-empty PDF signature, readable pages, no debug or placeholder text |
