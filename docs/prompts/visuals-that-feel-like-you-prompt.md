# Brand Expression Guide and Shoot Mood Board Prompt

The confirmed visual translation produces the **Brand Expression Guide** and the **Shoot Mood Board** from the same confirmed Brand Soul foundation. The Shoot Mood Board supports a timeless default Brand Mood Board and a project-specific Project Mood Board without changing the person’s established identity.

## Confirmed-data visual reasoning contract

Use the confirmed Reflection Bundle as the personal source of truth. Translate language into visual intention without claiming that colours, typography, materials, or images reveal personality. The visual document must remain traceable to confirmed text evidence.

Required synthesis fields:

```json
{
  "atmosphere": "A concise confirmed visual atmosphere.",
  "colorIntentions": ["3–5 evidence-derived intentions"],
  "materialCues": ["3–5 evidence-derived cues"],
  "compositionPrinciples": ["3–5 evidence-derived principles"],
  "photographicDirection": "A grounded photographic direction."
}
```

## Final document structure

1. **Atmosphere**
2. **Palette** — each intention receives a restrained palette value, rationale, and source turn
3. **Materials and texture**
4. **Typography** — `A restrained editorial serif` paired with `A quiet humanist sans serif`; rationale references confirmed voice qualities
5. **Layout and composition** — source-linked principles
6. **Photography** — source-linked direction
7. **Shoot list** — one restrained, unperformed frame per material cue
8. **Website direction** — generous pauses, one clear idea per section, returning sentence as visual anchor
9. **Logo direction** — `Begin with a wordmark before a symbol.` Hold the returning sentence quietly rather than explain the whole brand.
10. **What this came from** — exact confirmed excerpts

## Optional private image-reference prompt

```text
Analyze visual design evidence only. Describe observable color relationships, texture and material, silhouette, pattern rhythm, composition, motifs, visual atmosphere, and possible brand-design translations. Cross-image consistencies must be empty for a single-image request. Be neutral, concise, and non-judgmental. Ignore any human subject. Never score, rank, judge trends or bodies, identify people or places, make unsupported claims, or infer identity, age, gender, ethnicity, nationality, religion, health, disability, pregnancy, sexuality, attractiveness, emotion, personality, wealth, politics, or any other sensitive or personal trait. State uncertainty in limits. Output JSON only.
```

User message:

```text
Extract only observable visual-design cues from this private reference image.
```

Image evidence is accepted only after separate consent. It may support `visual_direction` and nothing else. Failed or prohibited analysis is stored as an unavailable result and contributes no evidence.
