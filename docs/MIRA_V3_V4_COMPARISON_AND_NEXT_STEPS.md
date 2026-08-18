# Mira V3 and Mira V4 — Differences and Next Decisions

## Executive View

Mira V3 and Mira V4 are **not duplicate versions of the same journey**. V3 is the deeper recognition and personal-brand foundation. V4 is the bounded creative-direction and visual-campaign system. They can remain separate products, or V3 can become a considered upstream source for V4. The decision is product strategy, not a reason to merge their current implementations.

| Dimension | Mira V3 | Mira V4 |
|---|---|---|
| Core promise | Help the person recognise patterns and translate them into an authentic brand expression. [1] | Build a coherent editorial Brand World and final five-image Moodboard. [2] |
| Primary question | “What is true about me, my current chapter, and my natural contribution?” | “What visual world should this brand or campaign inhabit?” |
| Main interaction | Two distinct conversational movements, followed by confirmation. [1] | Quick Context, concise creative evidence, typography calibration, visual choice, and one refinement round. [2] |
| Authority | The user’s words are the highest authority. [1] | Creative DNA and approved visual evidence govern a specific campaign world. [3] |
| Hidden support | Private Dakidarts birth intelligence may support questions and confidence; it never overrides the user. [1] | No active Dakidarts or Human Design input to the Moodboard pipeline. |
| Confirmation moment | User confirms the Brand Soul File before visual translation begins. [1] | User selects a visual direction, refines it once, then selects the continuity anchor for final generation. [3] |
| Final outcome | Three documents: Brand Soul File, Brand Expression Guide, and Shoot Mood Board. [1] | Five connected final editorial images in one Moodboard campaign. [3] |
| Image role | Optional visual evidence after confirmation; used to support visual translation. [1] | Essential visual-direction, refinement, and final-campaign output. [3] |
| Current external constraint | Optional private birth-data provider availability. | Image generation is currently retryable but blocked for new calls when the account has exhausted provider usage. |

## What Should Remain Separate

V3 should remain the **recognition product**. Its depth comes from conversation, confirmation, and the requirement that Mira never use private birth intelligence to overpower the customer’s own language. Its output is a person’s confirmed brand foundation, not a short campaign brief. [1]

V4 should remain the **visual campaign product**. Its strength is the controlled visual pipeline: Creative DNA, campaign planning, Maria’s visual-direction framework, a choice among five directions, one refinement, and five connected final images. [3]

Neither product should silently inherit the other’s private data or implied conclusions. Any connection should be explicit, reviewable, and confirmed by the user.

## Three Viable Product Directions

| Option | Product shape | Advantages | Decision required |
|---|---|---|---|
| **A. Keep V3 and V4 separate** | V3 is a recognition/brand-foundation offering; V4 is a standalone Brand World service. | Clear promises, separate pricing, minimal engineering risk. | Define who should start in which product. |
| **B. Create a confirmed V3 → V4 handoff** | A confirmed Brand Soul File supplies an optional, editable V4 starting brief. | Removes repeated identity work while preserving consent and user authority. | Define the exact compact fields that may cross the boundary and the confirmation UI. |
| **C. Make V4 a premium visual continuation of V3** | V3 recognition is required or strongly recommended before the V4 Brand World. | A more coherent high-touch offer and stronger final visual direction. | Decide whether V4 is bundled, paid separately, or offered as an upgrade. |

## Human Design and Numerology Decision

The current private numerology provider is **Dakidarts**, and it is contained inside V3’s hidden Recognition Layer. Neither current V3 nor V4 has an active Human Design API. If Human Design is meant to be part of the future product, it should be decided explicitly before implementation:

| Decision | Why it matters |
|---|---|
| Product purpose | Decide whether Human Design informs recognition, visual direction, a paid tier, or a distinct Mira offer. |
| Evidence boundary | Define exactly what can influence a question or output, and whether it may ever be visible to the customer. |
| Provider and privacy | Select an API, obtain a documented data contract, and decide what data is stored, reused, and explained. |
| User authority | Preserve the existing rule that personal language and consent remain primary rather than allowing a system result to become a verdict. |

## Recommended Next Sequence

First, restore image-generation availability so Journey 210001 can safely retry Visual Direction without discarding progress. Second, choose whether V3 and V4 are separate services or whether V3’s **confirmed** Brand Soul File should provide an optional V4 handoff. Third, write a one-page Human Design integration decision before any API work starts; this will prevent the provider choice from driving the product architecture.

## References

[1]: ./MIRA_V3_CURRENT_STATE.md "Mira V3 — Current State"
[2]: ./MIRA_V4_CURRENT_STATE.md "Mira V4 — Current State"
[3]: ./V4_REFINEMENT_RETRY_VALIDATION.md "V4 Refinement Retry Validation"
