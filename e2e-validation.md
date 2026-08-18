# Mira V3 End-to-End Validation

## Optional-module UI verification — 11 July 2026

The previously authenticated completed journey remained accessible after the optional modules were added. The page rendered the collapsed **Optional image references** panel with a **Private · consent required** label, separate controls for private upload and non-judgmental AI analysis, the JPEG/PNG/WebP and 8 MB policy text, and a metadata-only empty state. No reusable image URL or preview was exposed. The disabled-by-default birth-data module did not render, confirming that its UI remains behind the server feature flag. No consent was granted and no private image was submitted during this browser check; live S3 and vision-model behavior remains an explicit consenting-tester validation step rather than an automated action on the owner account.

## 2026-07-11 authenticated entry

- The standard OAuth callback correctly remains fail-closed when its nonce cookie is absent or stale; no production OAuth logic was weakened.
- A one-time, development-only owner-session token was consumed in the managed browser. It set the normal signed session cookie and redirected immediately to the clean `/mira-v3` URL.
- The authenticated Mira V3 entry page rendered successfully with the private badge, eight-question framing, and **Begin with a pause** control.
- Initial screenshot: `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-39-17_3789.webp`.

## Meditation gate

The authenticated **Begin with a pause** action created a journey and opened the numbered meditation sequence. Step 1 rendered “Let your shoulders soften” with explicit restart and continue controls; continuing advanced to step 2, “Take one slower breath,” rather than skipping directly into chat. This confirms the mandatory meditation gate is active in the browser.

| Evidence | Screenshot |
|---|---|
| Meditation step 1 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-39-39_3214.webp` |
| Meditation step 2 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-39-48_9956.webp` |

Meditation step 3 rendered “Leave the polished answer outside” and required an explicit **I’m ready** action. Completing it navigated to the persisted journey route `/mira-v3/journey/1`, displaying **Question 1 of 8**, a `0 / 8 answers` counter, keyboard guidance, and the initial reflective question.

| Evidence | Screenshot |
|---|---|
| Meditation step 3 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-40-03_3084.webp` |
| Reflection question 1 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-40-12_4484.webp` |

## Reflection conversation

Question 1 asked: “When you feel most like yourself, what are you doing—and what becomes possible in that moment?” The exact synthetic validation response submitted through the documented Enter-key path was: “I feel most like myself when I turn a complicated idea into something calm, clear, and useful. In that moment I stop performing certainty and become curious; other people can breathe, ask better questions, and see a next step that felt hidden before.” The UI entered its **Listening** pending state after submission.

| Evidence | Screenshot |
|---|---|
| Question 1 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-40-39_4026.webp` |

The first answer persisted and the UI advanced to `1 / 8 answers`. Question 2 was adaptive and explicitly reused the prior evidence about simplifying complexity: “If your ability to simplify complexity became the defining contribution of your life, what concrete, lasting change do you want to create in how people make decisions, feel about uncertainty, or take next steps?” The exact response submitted was: “I want people to leave important conversations with less shame about not knowing and more trust in their own judgment. The lasting change would be a habit of naming what is true, separating signal from noise, and choosing one honest next step without pretending the whole path is visible.”

| Evidence | Screenshot |
|---|---|
| Adaptive question 2 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-40-53_2169.webp` |
| Question 2 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-41-03_4957.webp` |

The second answer persisted and advanced the counter to `2 / 8 answers`. Question 3 asked which principles were absolutely non-negotiable when helping others move from shame about uncertainty to honest decision-making. The exact response submitted was: “I would not compromise honesty, consent, dignity, or the person's ownership of the decision. I would refuse manufactured urgency, false certainty, manipulation, or advice that makes someone dependent on me. Clarity must never come at the cost of complexity that genuinely matters.”

| Evidence | Screenshot |
|---|---|
| Adaptive question 3 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-41-20_7430.webp` |
| Question 3 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-41-30_2665.webp` |

The third answer persisted and advanced the counter to `3 / 8 answers`. Question 4 moved from stated principles into the pressure pattern that can undermine them: “When stakes are high or someone seeks quick reassurance, what automatic impulse or story do you notice running that tempts you to override your principles and take control instead of holding space?” The exact response submitted was: “The story is that if I do not produce the right answer quickly, I will disappoint them and lose credibility. That fear makes me over-explain, narrow the options too early, or carry responsibility that belongs to them. I confuse being useful with preventing discomfort.”

| Evidence | Screenshot |
|---|---|
| Adaptive question 4 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-41-43_4941.webp` |
| Question 4 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-41-55_5203.webp` |

The fourth answer persisted and advanced the counter to `4 / 8 answers`. Question 5 asked for the blunt sentence normally swallowed in important moments, specifically connecting vulnerability with the other person’s ownership. The exact response submitted was: “I do not know the right answer for you, and my urge to sound certain is about my fear, not your need. I can help you see the trade-offs, but you are the one who must decide what you are willing to choose and carry.”

| Evidence | Screenshot |
|---|---|
| Adaptive question 5 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-42-09_8889.webp` |
| Question 5 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-42-22_6595.webp` |

The fifth answer persisted and advanced the counter to `5 / 8 answers`. Question 6 operationalized the emerging pattern by requesting concrete phrases, pauses, and actions that center the other person’s agency. The exact response submitted was: “I will pause for one full breath before answering, then say: 'Here is what I see, and I may be missing something.' I will ask, 'Which trade-off feels most honest to you?' and 'What would you choose if reassurance were not available?' I will reflect their words before offering options and end by returning the decision to them.”

| Evidence | Screenshot |
|---|---|
| Adaptive question 6 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-42-37_2501.webp` |
| Question 6 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-42-50_5953.webp` |

The sixth answer persisted and advanced the counter to `6 / 8 answers`. Question 7 asked which fear, role, or pride must be released to sustain the new identity under pressure. The exact response submitted was: “I must release the role of being the person who always knows and the pride I take in being indispensable. Underneath it is the fear that if others can trust themselves, I will be less valuable. I need to measure my contribution by the quality of their agency, not by how necessary I appear.”

| Evidence | Screenshot |
|---|---|
| Adaptive question 7 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-43-04_8438.webp` |
| Question 7 submitted and pending | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-43-15_8267.webp` |

The seventh answer required a second wait cycle, then persisted without duplicate submission and advanced the counter to `7 / 8 answers`. Question 8 asked for a single concrete rule that visibly prioritizes the other person’s ability to choose and prevents premature certainty.

| Evidence | Screenshot |
|---|---|
| Answer 7 still processing safely | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-43-28_7150.webp` |
| Adaptive question 8 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-43-34_2069.webp` |

The exact response submitted for question 8 was: “Before I offer a recommendation, I will name what I do not know and ask the other person to state their preferred choice and the trade-off they are willing to own; only then will I add my perspective as an option, not a verdict.” The UI immediately confirmed `8 / 8 answers`, displayed the complete transcript, and presented the explicit `Reveal my Mirror` gate with the promise that the Mirror would be built only from the user’s words and reviewed before anything else was created.

| Evidence | Screenshot |
|---|---|
| Eight answers complete and Mirror reveal gate | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-43-52_3426.webp` |

The completed page remained stable on a refreshed DOM with all eight answers intact. Activating `Reveal my Mirror` changed the control to the non-interactive `Revealing the pattern` processing state; no duplicate action or client error appeared.

| Evidence | Screenshot |
|---|---|
| Stable reveal gate after DOM refresh | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-44-14_8267.webp` |
| Mirror generation in progress | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-44-23_4899.webp` |

Two subsequent checks at approximately 16 and 22 seconds after activation still showed the guarded `Revealing the pattern` state. The eight-answer transcript and completion count remained intact, and no error, duplicate synthesis, or enabled duplicate-submit control appeared.

| Evidence | Screenshot |
|---|---|
| Mirror generation wait check 1 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-44-39_4494.webp` |
| Mirror generation wait check 2 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-44-45_7821.webp` |

## Mirror fallback recovery

The initial model response contained valid content but exceeded bounded array lengths, which triggered strict validation and produced the intentionally safe transcript-grounded fallback as **Mirror · Version 1**. The parser now bounds only oversized model arrays before final strict validation, while undersized or malformed evidence still fails closed. The live review screen clearly labelled the fallback and exposed **Retry synthesis** only for that active fallback draft.

Activating retry preserved Version 1, disabled duplicate retry and confirmation actions while processing, and requested a richer synthesis for a new immutable revision. The fallback can only be retried while it remains the active draft; confirmed and non-fallback Mirrors are not eligible.

| Evidence | Screenshot |
|---|---|
| Version 1 fallback warning and retry control | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-48-55_1333.webp` |
| Retry processing with existing Mirror preserved | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-49-03_2774.webp` |

The retry completed as **Mirror · Version 2**, proving that the bounded-array normalization accepted the otherwise valid model response and that the retry persisted a new immutable draft rather than overwriting Version 1. Version 2 contained synthesized language rather than copied transcript fields, the fallback notice and retry control disappeared, and the review retained only edit and confirm actions. The entire eight-answer transcript remained unchanged.

| Evidence | Screenshot |
|---|---|
| Non-fallback Mirror Version 2 ready for review | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-49-42_3313.webp` |

## Confirmation and private collection

Confirming Version 2 changed the journey to its confirmed state, removed edit/retry actions, and stated that this version is the single source for the three private documents. Opening the documents navigated to `/mira-v3/results/1`, where **The Mirror**, **Brand Soul File**, and **Visual Direction** appeared as separate tabs under a confirmed-version indicator. The Mirror document rendered the confirmed synthesis plus expandable turn-level evidence and exposed its PDF download action.

| Evidence | Screenshot |
|---|---|
| Confirmed Mirror Version 2 | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-49-57_7204.webp` |
| Three-document private collection | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-50-04_5407.webp` |

The **Brand Soul File** rendered a core truth, natural gift, felt experience, audience, direction, voice qualities, and turn-level provenance consistent with Version 2. **Visual Direction** rendered atmosphere, a three-colour palette, typography, composition, photography, shoot list, website direction, logo direction, and turn-level provenance from the same confirmed source. Each document exposed its own PDF download action.

| Evidence | Screenshot |
|---|---|
| Brand Soul File confirmed document | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-50-22_2008.webp` |
| Visual Direction confirmed document | `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_18-50-29_2793.webp` |

The Visual Direction export returned HTTP 200 and downloaded `mira-1-visuals-that-feel-like-you.pdf` as a non-empty **6,148-byte PDF**. The interface returned to its normal enabled state after export, and navigation back to the Brand Soul File remained intact.

The Brand Soul File export returned HTTP 200 and downloaded `mira-1-brand-soul-file.pdf` as a non-empty **4,078-byte PDF**. The confirmed Mirror tab remained available and rendered the same Version 2 synthesis after the export.

The Mirror export returned HTTP 200 and downloaded `mira-1-the-mirror.pdf` as a non-empty **3,244-byte PDF**. Independent file inspection confirmed all three artifacts have valid PDF 1.3 signatures: The Mirror is 1 page, Brand Soul File is 2 pages, and Visual Direction is 3 pages.

| Confirmed export | HTTP | Bytes | Pages |
|---|---:|---:|---:|
| The Mirror | 200 | 3,244 | 1 |
| Brand Soul File | 200 | 4,078 | 2 |
| Visual Direction | 200 | 6,148 | 3 |

## Temporary validation-route security record

Before deletion, the temporary route was constrained by the following controls, which were inspected and tested during validation:

| Control | Implemented behavior |
|---|---|
| Environment boundary | Registration returned immediately unless `NODE_ENV` was `development` and `ENV.isProduction` was false. |
| Token entropy and lifetime | A new 32-byte cryptographically random base64url token was generated only for the running development process. The signed owner session expired after one hour. |
| Constant-time comparison | Equal-length supplied and expected token buffers were compared with `timingSafeEqual`; missing and wrong-length values failed closed. |
| Single use | An in-process `tokenConsumed` flag was set before asynchronous session creation, preventing reuse and concurrent duplicate consumption. |
| Owner restriction | The route could mint only the configured `ENV.ownerOpenId` identity and reused the project’s normal signed-session token implementation. |
| Browser leakage controls | Successful responses set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| Clean navigation | Browser GET consumption returned an immediate HTTP 303 redirect to `/mira-v3`, removing the token from the active address. |
| Production cleanup | The bootstrap import and registration call were removed, both temporary source files were deleted, and the final source scan found no route or token-log references. |

The temporary one-time development owner-session route was used solely for this controlled browser validation and was disconnected after the journey and export checks. The final source returns to the standard OAuth route only; the bypass source and its focused test were removed before checkpointing.

## Final runtime and PDF-failure verification

After a clean development-server restart, the authenticated confirmed journey loaded at `/mira-v3/journey/1` without the earlier stale `getLatestMiraV3ModuleOutput` module-export error. The page retained the complete eight-answer transcript, confirmed Mirror Version 2, private optional image-reference controls, and the route into all three confirmed documents. A post-restart server-log scan found no missing-export, module-loading, unhandled, or internal-server error in the new runtime window.

The final route regression deliberately rejected `renderPdfFromHtml`. The procedure returned the stable message **“The PDF could not be prepared. Please try again.”**, wrote a `pending` artifact followed by a `failed` artifact containing the renderer error, did not call private storage, and left both `journey.status = mirror_confirmed` and the confirmed revision unchanged.

Two private-storage route regressions then exercised the previously unshaped failures. When `storagePut` rejected, the upload procedure returned **“Private image storage is temporarily unavailable. No image record was created.”** and did not create any media, analysis, or module row. When signed-URL creation rejected, the analysis procedure returned **“Private image storage is temporarily unavailable. The image was not analyzed.”**, did not invoke the vision model, persisted a failed media-analysis payload, and persisted a failed `image_reference_analysis` module result with `reason = private_storage_unavailable`. Neither path invoked a journey lifecycle mutation.

The complete final verification passed **11 test files and 37 tests**, `tsc --noEmit`, and the production build. A clean restart then loaded the authenticated confirmed journey with its eight answers, confirmed Version 2, and private optional-image controls; no new export or module-loading error appeared in the post-restart log window. The final browser evidence is `/home/ubuntu/screenshots/3000-ifxtfmtrhzr73wg_2026-07-11_19-24-38_9556.webp`.

| Final evidence | Result |
|---|---|
| Restarted confirmed journey | Loaded without the previous module export error |
| Post-restart server log scan | No matching runtime error |
| Forced PDF renderer failure | Stable user message; failed artifact recorded; no storage write |
| Confirmed state after failure | Journey and revision remained confirmed |
| Private upload storage failure | Stable error; no orphan media record |
| Signed-URL storage failure | Failed media and module states persisted; vision model not called |
| Automated suite | 11 files; 37 tests passed |
| TypeScript and build | Passed; production build completed in 18.32 seconds |
