# MIRA shared-core foundation

MIRA is one modular product with two replaceable entry blocks and one canonical downstream workflow.

```text
Maria Photography booking/payment ─┐
                                    ├─> Canonical Shoot ─> Client Invitation ─> Call MIRA
MIRA SaaS photographer dashboard ──┘                        └─> shared preparation core
```

## Entry modes

- **Maria Photography:** a future booking adapter calls `createCanonicalShoot` with `sourceMode: "maria_photography"`, the booking identifier, and Maria's photographer account. The booking system remains outside the shared core.
- **MIRA SaaS:** the protected photographer dashboard calls the same service with `sourceMode: "mira_saas"` after onboarding.

Both paths write to `mira_shoots`. There is no second shoot type or duplicated preparation flow.

## Implemented in Steps 1–4

- A versioned canonical Shoot schema, photographer profile, client invitation, call session/event, and memory-revision schema.
- An idempotent shared Shoot creation service used as the boundary for both entry modes.
- Photographer onboarding, dashboard, manual Shoot creation, Shoot detail, and secure invitation creation.
- A consent-gated client preparation route with OpenAI Realtime voice over WebRTC and a hidden text fallback.
- A versioned Master Prompt plus evidence-bearing structured-memory contracts, deterministic patching, contradiction handling, and completeness rules.
- Owner checks, one-way invitation-token hashing, expiry/revocation handling, a one-session constraint, and server-authoritative call timing.
- Replaceable transactional-email delivery with Resend as the pilot provider, photographer-specific invitation copy, Reply-To support, secure-link fallback, and dashboard-visible delivery progress.

## Realtime discovery and pilot QA

- Realtime uses the versioned Master Prompt, canonical ShootMemory and a deterministic minimum-information gate. Creative recommendations and finalization are blocked until discovery is sufficient and the client confirms the closing summary.
- Short-lived Realtime text transcripts can be retained separately from ShootMemory for authenticated photographer/developer pilot QA. `MIRA_PILOT_QA_RETENTION_DAYS` defaults to 7 (maximum 30), expired events are purged opportunistically, and the Shoot view provides deletion. Raw audio is never stored.
- `OPENAI_REALTIME_CUSTOM_VOICE_ID` optionally selects an account-authorized OpenAI custom voice; `OPENAI_REALTIME_VOICE` remains the fallback. Create the voice only through OpenAI's official voice-consent and voice APIs. Keep voice IDs and consent recordings in protected environment/provider storage, not Git.

## Deliberately deferred

Creative synthesis persistence, moodboard generation, Call Sheet generation, photographer approval, and the final `READY TO SHOOT` transition remain downstream. They must consume the same canonical Shoot and memory rather than introduce a parallel workflow. Human Design remains an optional future “Go Deeper” layer and is not active in the standard call.
