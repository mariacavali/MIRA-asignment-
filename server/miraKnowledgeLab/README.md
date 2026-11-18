# Isolated MIRA knowledge lab

## Current status — 2 November 2026

Latest diagnostic: Maria explicitly approved one request capped at $0.0161. It completed once, accepted by the unchanged validator, using the same failed-baseline prompt hash and model. Its returned-token cost was $0.00202575, cumulative $0.00801250 across the three HTTP 200 requests. The original validation failure was not reproduced; the old raw replies are absent, so their exact cause remains unconfirmed. The accepted reply asks two questions and does not establish the intended conversational quality. No further calls are authorised. See `diagnostic-result.json/html` in the local work directory.

The corrected local `.env` credential passed the separate exact-model lookup (HTTP 200), and the isolated lab was restarted. The fresh authorised A/C2 run used two requests on `gpt-5-mini-2025-08-07`; both provider responses were HTTP 200 with `finish_reason: stop`, but the application rejected their structured outputs. No answer-quality comparison succeeded. Returned usage was 4,739 input tokens plus 2,401 output tokens (including reasoning), costing $0.00598675 at the approved rates; this is not a verified invoice. The allowance is closed and there were no automatic retries or substitutions. One explicit diagnostic retry is awaiting approval.

Successful provider reply text is now retained locally as unaccepted diagnostic data with JSON/schema validation paths and codes. Raw provider error bodies are never retained because they can echo credentials. This changes observability only: validation, source clearance, fixed-script approval and model limits remain enforced. The two earlier validation failures did not retain raw text, so their exact rejected field is unknown.

Pearson refused the proposed Keller use in Gmail message `1a19b13cbf3d51d4` dated 2 November. All five existing `book-brand-management` source versions are withdrawn in the real local catalogue and lab withdrawal list. Keller extraction and derivative notes remain outside retrieval, generation tests and Pinecone; files are preserved. This refusal does not determine another publisher's policy. The approved comparison continues to contain only the exact original MIRA sources.

Current source decisions and separate one-source addition bundles are in `../brands/mira/work/2026-11_knowledge-lab/source-eligibility-2026-11-02.json` and `additions/`. Those are local preparation records, not published or seeded knowledge. The original spending proposal below is historical context, not an active allowance.

Local URL: **http://127.0.0.1:5185**. This is a separate loopback server and private file store, not a publication mode. It does not connect to the SQL catalogue, Pinecone, production sessions, client evidence or the real session clock. Existing services on 5183/5184 remain running.

## Maria's steps

1. Choose a knowledge version, starting situation and model. Click **Start fresh session**.
2. Use the suggested opening or write a message. **Check retrieval · $0** saves the exact references without calling a model. It produces no AI answer and does not add history to generated journeys.
3. Once the chosen model is available/authorised, **Generate MIRA reply** makes one bounded call. Use **Use next repeatable client reply** to repeat the fictional client script. The client can also answer naturally; compare the actual client turns because natural journeys can diverge.
4. Start another fresh session with the same scenario and model, changing only knowledge version. Saved sessions never change configuration when the dropdown changes.
5. Score helpfulness and leave notes. Download the conversation, references and feedback to share yourself. Nothing is sent automatically.

A is no retrieval; it still has the same MIRA policy and the model's prior training. C1 adds one original MIRA opening-guide source. C2 adds one original MIRA method source to C1. C therefore measures extra retrieved method reminders, not the contribution of the book collection. Some of those ideas already exist in the common MIRA policy; no improvement is assumed.

B (Holt Chapter 2) is a metadata-only blocked slot: no applicable source clearance is recorded, and exact notes-format/item reviews remain pending. Removing unresolved claims does not clear the rest. No Holt text is in the lab registry, retrieval results or prompts. Existing 40 local chapter candidates, full-text book drafts and exclusions are untouched.

## Source eligibility and versions

Preparation reads only the six explicitly identified original MIRA entries from the saved candidate. Two original editorial artifacts are hash-bound. Their original-authoring/scope evidence and attributable scoped reviews are retained; these do not grant ownership of every input file or any underlying book.

The same `publicationProblems` source/item/withdrawal rules are checked, plus per-entry review hashes and source-artifact SHA-256 bindings. Eligibility is checked on session creation, retrieval, before generation and before accepting a result. A changed/withdrawn source withholds further use. An unapproved test version cannot fall back to A or another source. No browser endpoint can approve a source or import a corpus.

To add another source: perform its actual source-clearance and item-quality review; record supporting evidence and processing scope; retain exact limitations/exclusions and real evaluation cases; add a **new** registry ID/version with binding hashes and an explicit parent. Do not edit a frozen existing version or copy `original` onto book-derived content. The private registry schema and `eligibility()` reject missing evidence/reviews/evaluations and changed hashes. Review of legal applicability remains substantive human work, not something a nonempty string proves. Source permission scope must cover the chosen processing; local permission does not imply hosted-provider permission.

## Controlled settings and provenance

Protocol data is saved under `.mira-local-data/knowledge-lab/protocols/<hash>.json`. Every session contains the frozen system policy, model profile, scenario information, knowledge hash and comparison key. Each turn includes full retrieved entries/citations/limitations, exact messages passed to the model, prompt hash, timestamp, usage when available and answer or honest failure state. Proposals are not confirmed client memory.

The lab shares pure lexical ranking with `miraKnowledge/retrieve.ts` and the existing structured coach model adapter. The published retrieval wrapper and real catalogue guards remain unchanged in effect. Local references are explicitly labelled **unpublished**; they have no fake catalogue release ID. This is an isolated coach conversation, not a test of the production LangGraph planner, time limits, voice, reference uploads, Brand Book generation or Pinecone semantic retrieval. Those remain separate verification steps.

The ranking is lexical. Some queries retrieve broad extras, including a visual card for the unclear-offer query. The positive checks establish expected-reference availability, not perfect relevance or generated-answer quality. Review traces and human feedback; more citations or longer answers are not a quality score.

## Models and approval boundary

Free/local profile: installed `qwen3-vl:8b-instruct`, exact digest `sha256:70e58e37beb15464e19aa903dedb2cba828b89c0fb186f75ff2738c7347b96eb`, temperature 0, seed 42, context 16384, output cap 1200. Only `127.0.0.1:11435` is contacted; no download or cloud fallback. At preparation, the service was listening but its model-list endpoint timed out. The UI can recheck readiness; no free generated answers have been validated.

Optional hosted profile: `gpt-5-mini-2025-08-07`, pinned to keep comparisons on the same model. Official OpenAI documentation marks it deprecated; no replacement or account availability is assumed. Model policy and starting information stay identical across A/C comparisons. Output variation can still occur.

Proposed approval, **not yet granted**: up to **10 text calls**, five fixed client turns in each of two fresh sessions: A and C2. The same client messages and starting information are used in both sessions. Failed attempts consume the cap and can reduce the number of completed answers. Only the two prepared session IDs are covered. Maximum full request 40,000 UTF-8 bytes; completion cap 1,800; expiry two hours after actual approval. At $0.25/M input and $2/M output, conservatively reserving 50,000 input tokens per call estimates **$0.161 total**, rounded to a proposed **$0.20 maximum**. Input reserve is an estimate, not measured usage. Source: https://developers.openai.com/api/docs/models/gpt-5-mini . Recheck prices/availability before later dispatch.

No approval files are created by setup or UI. After explicit approval, a trusted operator must create BOTH a bounded existing-gate `provider-approval.json` (scope `local-mira-review`, exact allowed snapshot, ≤10 calls, maxRequestBytes 40000, maxCompletionTokens 1800, actual expiry) and `lab-paid-approval.json` (actual actor, approvedAt, same expiresAt, approved true, protocolHash, proposalHash, maximumUsd 0.20 allowedKnowledgeHashes naming only the exact versions approved for spending, allowedSessionIds naming the prepared pair, and comparisonJourneyHash binding the five-turn script). `proposalHash = contentHash(paidProposal)` from core. These files belong only in this isolated lab root; do not reuse the connected-review allowance. Model/key never goes to the browser. Reservations occur before dispatch; errors can consume allowance. No retries, automatic batch, audio, images or fallback. Actual token usage is recorded separately from estimates; missing provider usage is reported unknown.

## Start and checks

From the MIRA repository:

```sh
node_modules/.bin/esbuild scripts/prepare-mira-knowledge-lab.ts --bundle --platform=node --packages=external --format=esm --outfile=.mira-local-data/knowledge-lab-prepare.mjs
node .mira-local-data/knowledge-lab-prepare.mjs
node_modules/.bin/esbuild scripts/mira-knowledge-lab.ts --bundle --platform=node --packages=external --format=esm --outfile=.mira-local-data/knowledge-lab-server.mjs
node .mira-local-data/knowledge-lab-server.mjs
```

Preparation preserves an existing registry rather than overwriting it. A running-server lock prevents two processes writing sessions. Stop the owned server normally before restart; inspect a stale lock/PID instead of deleting data or resetting the real app. State lives under ignored `.mira-local-data/knowledge-lab`, private directories/files, atomic writes and serialized turns. Host/Origin checks reject other websites; the service binds loopback only. Restarting or opening a new session does not refill provider allowance.

Focused tests: `vitest run server/miraKnowledgeLab/lab.test.ts server/miraKnowledge/retrieve.test.ts server/miraCoach/model.test.ts server/miraCoach/liveProviderGate.test.ts`. Generation tests mock providers; they are not real-answer quality evidence. `scripts/check-mira-knowledge-lab.ts` tests 15 cases with the saved original MIRA sources, including four positive C2 scenarios and an unsupported no-match query. `scripts/smoke-mira-knowledge-lab.mjs` exercises the actual running server with retrieval-only verification sessions, saved feedback and exports. Neither makes a model or Pinecone request.
