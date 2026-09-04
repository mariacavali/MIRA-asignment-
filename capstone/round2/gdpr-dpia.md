# GDPR Data Protection Impact Assessment (Preliminary) — Round 2

**Status:** Author's own preliminary self-assessment against the GDPR (Regulation (EU) 2016/679), produced by reasoning about the implemented data flows. **This is not a legal opinion and not a certified DPIA.** A DPIA is only legally *required* under Article 35 when processing is "likely to result in a high risk" (e.g. systematic large-scale profiling, large-scale processing of special-category data, or systematic monitoring of a publicly accessible area) — this project has no production deployment or real user base, so that threshold has not been reached yet. This document exists to prepare for a required DPIA before real deployment, and to surface data-handling gaps now, while they are cheap to close.

## 1. What personal data MIRA Core processes

| Data | Source | Where it lives | Special category? |
|---|---|---|---|
| Client name, email, phone | Photographer enters shoot details (`mira_shoots.clientName/clientEmail/clientPhone`) | Database | No |
| Up to five client-uploaded visual references (photos) | Client upload in the Shoot Room (`mira_shoot_visual_references`) | Object storage (Forge/S3) + database metadata | **Potentially yes** — a photo of a person can be biometric/special-category data if used to uniquely identify someone; MIRA does not perform any identification/biometric processing on these images (no facial recognition, no biometric matching — see `capstone/round2/eu-ai-act-assessment.md` §1), but the images themselves may still depict identifiable people and should be treated cautiously. |
| Discovery conversation content (voice transcript or text fallback) | Client's spoken/typed answers during preparation (`mira_call_qa_events`) | Database, **short-lived only** (see §3) | Potentially — conversation content may reveal opinions, preferences, or other personal detail depending on what the client shares. |
| Confirmed preparation summary / ShootMemory | Synthesized from the conversation (`mira_shoot_memory_revisions` equivalent structures) | Database | Same as above |
| Creative DNA (structured creative-direction object) | Synthesized from the summary + photographer brief (`mira_shoot_creative_dna`) | Database | Derived personal data (about the client's creative preferences/identity framing) |
| Invitation token, delivery status, timestamps | Invitation flow (`mira_client_invitations`) | Database | No (token is an access credential, not itself special-category, but must be treated as sensitive per §4) |
| Photographer account, business profile, Stripe payment status | Photographer signup/payment | Database | No |

## 2. Legal basis

**Consent**, for the client-facing processing. The Shoot Room requires an explicit, affirmative, un-pre-ticked checkbox before either voice or text conversation can begin: *"I agree to AI-assisted processing of what I share for this shoot preparation. Short-lived text transcripts may be retained for service quality; raw audio is not stored."* (`client/src/components/mira/ClientShootRoomWelcome.tsx`). Both entry points ("Call MIRA," "Continue with text") are disabled until this box is checked — this is a real, implemented gate, not a stated policy without enforcement.

**Gap:** this single checkbox currently covers "AI-assisted processing" broadly. A production-ready consent flow should separately and clearly cover: (a) processing of uploaded photographs, (b) short-lived transcript retention specifically, (c) use of the resulting Creative DNA by the photographer, and (d) any use of a real (non-demo) third-party model provider (OpenAI) once that path is exercised with real clients. This has not been reviewed by counsel.

## 3. Retention

| Data | Retention behavior today | Honest assessment |
|---|---|---|
| Realtime conversation transcripts (`mira_call_qa_events`) | **Implemented and enforced.** Bounded by `MIRA_PILOT_QA_RETENTION_DAYS` (default 7 days, clamped to 1–30). Expired rows are actively deleted on the next read or write to this table (`appendRealtimeQaEvent`, `listRealtimeQaEventsForOwner`, `server/miraCore/db.ts`) — a real, lazy-deletion mechanism, not a scheduled job, but real and verifiable in code. Raw audio is never stored at all (only text transcript content). | **Good — this is the one data type with a genuinely implemented, bounded retention policy.** |
| Uploaded visual references (photos) | **No retention/deletion policy implemented.** No `expiresAt` or equivalent field exists on `mira_shoot_visual_references`; a "removed" status exists and can be set by the client removing their own reference, but nothing automatically deletes data after a time period. | **Gap.** Indefinite retention by default. |
| Creative DNA / confirmed preparation summary | **No retention/deletion policy implemented.** Same gap as above. | **Gap.** |
| Moodboard images | **No retention/deletion policy implemented.** Same gap as above. | **Gap.** |
| Shoot record (client name/email/phone) | **No retention/deletion policy implemented.** | **Gap.** |
| Invitation record/token | Has an `expiresAt` field, but this governs *access expiry* (when the link stops working), not data *deletion*. | **Gap** — access expiry is not the same as data retention/erasure. |

**Overall retention conclusion:** MIRA Core has proven it *can* implement bounded, self-cleaning retention (the transcript case), but has only actually done so for one of six personal-data categories. Extending the same pattern to visual references, Creative DNA, moodboard, and shoot contact details is a concrete, scoped Round 2/pre-launch engineering task, not a research question.

## 4. Data subject rights

| Right | Current implementation |
|---|---|
| Right to access | Not implemented as a self-service client-facing feature. A client can view their own uploaded references in the Shoot Room (`listClientVisualReferences`) but has no equivalent view of their conversation transcript, Creative DNA, or moodboard. |
| Right to erasure | Partially implemented: a client can remove their own uploaded reference (`removeClientVisualReference`). No equivalent exists for conversation transcripts (though these already auto-expire — see §3), Creative DNA, or the shoot record itself. |
| Right to rectification | Not implemented as a client-facing feature; the photographer can edit shoot details they entered. |
| Right to data portability | Not implemented. |
| Right to object / withdraw consent | The consent checkbox is a one-time gate before conversation start; no implemented mechanism exists to withdraw consent and have already-collected data deleted on request (beyond the reference-removal and auto-expiring-transcript mechanisms already noted). |

## 5. Third-party processors

| Processor | Data shared | Purpose | Status |
|---|---|---|---|
| **OpenAI** | Conversation content, shoot brief, uploaded reference image (as inspiration evidence), for Creative DNA synthesis and moodboard image generation | Text/image AI generation | Implemented in code; not yet exercised with real client data in any recorded checkpoint (`docs/ROUND1_VERIFICATION.md`) |
| **Resend** | Client email address, invitation content | Transactional email delivery | Previously live-verified with one real delivered invitation (`capstone/evidence/staged_validation_evidence.md`) |
| **Stripe** | Photographer's own payment details (not the client's) | Payment processing | Previously live-verified (one €0.00 test transaction) |
| **Forge/S3-backed object storage** | Uploaded photos, generated moodboard images | Storage | Implemented; isolated-preview fallback documented in `docs/MANUS_ENVIRONMENT_CONTRACT.md` |

**Gap:** no Data Processing Agreement status, processor region/sub-processor list, or Standard Contractual Clauses assessment (for any non-EU processor) is documented anywhere in this repository. This is a legal/contracting task outside what this codebase can demonstrate.

## 5a. Third-party international transfers

**OpenAI and Stripe are both US-headquartered processors.** Under GDPR Chapter V, transferring EU personal data to a processor outside the EU/EEA requires a valid transfer mechanism — typically Standard Contractual Clauses (SCCs), an adequacy decision, or (for some processors) participation in the EU-US Data Privacy Framework. **This repository cannot confirm which mechanism applies**, because that depends on the processor's own current certification/contractual status with Maria's account, not on anything in the codebase.

| Processor | Data that would cross the transfer boundary | What needs confirming (not confirmable from code) |
|---|---|---|
| OpenAI (US) | Conversation content, shoot brief, uploaded reference image, generated Creative DNA/moodboard content | Whether OpenAI's current Data Processing Addendum and SCCs/DPF status cover this specific use, and whether that status is current at time of real deployment |
| Stripe (US, with EU entities) | Photographer's own payment details (not the client's) | Stripe's standard terms typically address this, but this has not been independently reviewed for this project |
| Resend | Client email address, invitation content | Processor region/transfer mechanism not confirmed |

**This is the single most concrete "must close before a real pilot" compliance item in this document** — unlike the retention gaps in §3 (which are an engineering task this codebase can close directly), a transfer-mechanism confirmation is a due-diligence task (reading and confirming each processor's current DPA/SCC terms) that must happen before any real client's data is sent to any of these processors, and cannot be resolved by writing more code.

## 6. Risks identified

| Risk | Severity (author's judgment) | Mitigation status |
|---|---|---|
| Uploaded client photographs and derived creative data retained indefinitely with no deletion path | High | Not mitigated — see §3 gaps |
| Consent notice covers "AI-assisted processing" broadly rather than itemizing each processing purpose | Medium | Not mitigated |
| No client-facing data-access or portability feature | Medium | Not mitigated |
| Real (non-demo) OpenAI processing of real client data has never been exercised, so real-world data-handling behavior (e.g. provider-side retention) is unverified | Medium-High | Requires provider-level data-processing terms review before first real use |
| No documented processor agreements/sub-processor list | Medium | Requires legal/contracting work, not an engineering fix |
| International transfer mechanism (EU→US) not confirmed for OpenAI/Stripe/Resend | **High — highest-priority compliance gap in this document** | Requires reading and confirming each processor's current DPA/SCC/DPF status before real deployment (§5a) — not resolvable in code |

## 7. Conclusion

A full, legally required DPIA is not yet triggered (no production deployment, no real user base, no large-scale processing). This preliminary assessment finds the transcript-retention design pattern already implemented is sound and should be extended to the other personal-data categories before any real client's data is processed at scale, and that consent, access, and erasure mechanisms need to be itemized and completed before a real pilot. None of this blocks continued demo/preview use with synthetic data (as this entire Round 1/Round 2 evidence set has used throughout) — it blocks a real pilot with real clients until closed.
