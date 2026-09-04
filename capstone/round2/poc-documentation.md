# Proof of Concept Documentation — Round 2

**Status:** Historical record of the *early* automation prototype that predates the working MIRA application. This document describes that prototype only — it does not describe the current MIRA Core product, which is documented separately in `capstone/round2/mvp-verification.md`. Nothing in this document should be read as a description of MIRA's current implementation.

## What the early PoC actually was

Before MIRA existed as a full web application (the React/Express/tRPC product now in this repository), the initial proof of concept was a simple **n8n automation workflow**, not a custom-built app:

```
Client input → OpenAI → JavaScript parsing → Google Sheets → Google Docs
```

| Step | What it did |
|---|---|
| **Client input** | A client's raw preparation answers (text) entered the workflow — collected through a simple intake form/webhook, not a private authenticated app. |
| **OpenAI** | The raw input was sent to an OpenAI text-completion call to interpret and structure the client's answers. |
| **JavaScript parsing** | An n8n Function/Code node parsed and reshaped the model's text response into structured fields. |
| **Google Sheets** | The parsed, structured fields were written as a row into a Google Sheet — the PoC's only persistence layer. |
| **Google Docs** | A Google Doc was generated/populated from the sheet row, producing a human-readable preparation summary document for the photographer to read. |

## What this PoC explicitly did **not** do

- **It did not generate a moodboard.** No image-generation call of any kind was part of this workflow.
- **It did not generate images.** OpenAI was used only for text interpretation, never for image synthesis.
- **It did not have a Creative DNA schema.** There was no structured, versioned, schema-validated creative object — only a Google Doc of parsed text.
- **It did not have a private client room, authentication, payment, or persistence beyond a spreadsheet.** There was no equivalent of the current Shoot Room, no Stripe integration, and no database.
- **It did not track delivery status, readiness, or any gated state.** A row existed in a sheet, or it didn't; there was no state machine.

## Why this PoC was superseded

The early PoC validated one narrow thing: that a client's raw preparation answers could be interpreted by an LLM into something more structured than free text, and that a photographer would find a generated summary document useful. It did not validate — and was never designed to validate — creative-direction synthesis, visual moodboard generation, verified readiness gating, private/secure client access, or a payment path. Every one of those became a real, implemented, schema-validated feature of the current MIRA Core product (see `capstone/round2/mvp-verification.md`), built independently of this n8n workflow rather than as an extension of it. No code, schema, or workflow file from this early PoC exists in, or was carried into, the current codebase.

## A separate, unrelated n8n artifact in this repository

This repository also contains `docs/n8n-email-sequence-setup.md` and two importable, inactive n8n workflow files (`workflows/mira-client-email-sequence.json`, `workflows/mira-email-outbox-trigger.json`). **These are unrelated to the early PoC described above.** They are a *current*, optional automation boundary for scheduling MIRA's own transactional email milestones (invitation, preparation guidance, "Call MIRA" reminder, shoot-day reminder) against MIRA's own existing email outbox — not a client-input-to-document pipeline, not an OpenAI text-interpretation step, and not a Google Sheets/Docs integration. They are documented separately and are out of scope for this PoC record.

## A pre-existing broken reference, noted honestly

`README.md` and `docs/MIRA_AI_AND_DATA_INVENTORY.md` (both predating this document) reference a third, distinct thing: "an importable synthetic photographer/model-client lifecycle POC... documented in `capstone/round2/n8n/`." **That path does not exist in this repository.** It describes neither the early PoC documented above (client input → OpenAI → parsing → Sheets → Docs) nor the email-sequence workflow described in the section above. This task's explicit scope is documentation, not building a new n8n workflow artifact, so this gap is recorded here rather than filled with an invented workflow file. If a synthetic photographer/model-client lifecycle POC is wanted, it is new build scope for a future round, not something already existing that this document can accurately describe.

## What this PoC demonstrates for Round 2

This early, simple automation is the honest starting point of the product's evolution: an unauthenticated, spreadsheet-backed, text-only prototype that proved the core intuition (LLM-interpreted client answers are more useful than a raw form response) before any of the current product's structure — private access, payment, schema-validated Creative DNA, gated readiness, or moodboard generation — existed. The gap between this PoC and the current MVP (documented in `capstone/round2/mvp-verification.md`) is the actual build work this capstone reports on.
