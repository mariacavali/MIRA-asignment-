# MIRA-specific LangSmith monitoring sample (Round 1)

A minimum, runnable LangSmith monitoring sample for MIRA's real Creative DNA
transformation: turning a confirmed photographer brief and client
preparation answers into a structured Creative DNA object. This is separate
from, and in addition to, the existing Ironhack-course LangSmith experiment
recorded at `../monitoring/langsmith_monitoring.md` (a generic support-ticket
classification lab, not MIRA-specific).

## What is monitored

Each of the 3 synthetic cases is traced through MIRA's own, unmodified
Creative DNA synthesis call
(`synthesizeMiraV4CreativeDna` in `server/miraV4/creativeDna.ts`) and scored
on:

- **Success or failure** of the call.
- **Use of the photographer brief** - whether facts drawn from the shoot
  brief (title, intended use, location, photographer's notes) actually show
  up in the generated Creative DNA.
- **Use of client preferences and constraints** - the same check against
  facts drawn from the client's confirmed preparation answers.
- **Creative DNA completeness** - what fraction of the schema's token-list
  fields (palette, materials, keywords, etc.) came back non-empty. Every
  *text* field is schema-required and non-empty by construction once
  validation succeeds, so text-field completeness is always 100% once a case
  succeeds; the list fields are the real signal of how thorough the result
  is.
- **Unsupported or invented personal details** - a heuristic scan of the
  generated text for email addresses, phone numbers, or capitalized
  two-word sequences that don't match any proper noun actually present in
  that case's own synthetic input (see Limitations below).
- **Response latency**, measured around the traced call.
- **Token usage**, when the provider returns it (`prompt_tokens`,
  `completion_tokens`, `total_tokens`).
- **Estimated model cost**, when available - see Limitations.

## Why observability matters

Creative DNA is the one artifact every downstream stage depends on
(moodboard prompts, campaign plan, preparation brief). If it silently drops
a brief detail, ignores a client constraint, thins out under a schema
technicality, or invents something no one said, nothing later in the
pipeline can catch it - the photographer only finds out at review, or the
client finds out on shoot day. Tracing and scoring the transformation
directly, on a fixed synthetic dataset, makes that failure mode visible and
reproducible instead of anecdotal.

## Dataset size

Exactly 3 synthetic cases (`synthetic_cases.json`), each representing a
different shoot type MIRA is meant to support:

1. **Founder personal-brand shoot** - a startup founder's website/LinkedIn
   session.
2. **Remote editorial portrait** - a self-shot, remotely directed magazine
   portrait.
3. **Product / creative-business campaign** - a small ceramics label's
   e-commerce relaunch campaign.

All three are entirely synthetic. No real client name, real photograph,
real email address, real invitation link, or other real personal data is
used anywhere in this dataset or in this sample's code - see the `note`
field at the top of `synthetic_cases.json`.

## Model used

`gpt-5-mini`, via the existing `MIRA_V4_CREATIVE_DNA_MODEL` constant
(`server/miraV4/creativeDna.ts`) - the same model the product itself uses
for this exact transformation. This sample does not call any image-
generation model and does not call any model more than the 3 synthetic
cases require.

## Results

See `results.json`, produced by actually running
`mira_monitoring_sample.ts` (not hand-written). Its `run.status` field is
either:

- `"not_run"` - at least one required environment variable was missing.
  `run.missingEnvironmentVariables` lists the exact names still needed (see
  Configuration below); every per-case entry is `"status": "not_run"` with
  every metric `null`. **No result is ever invented for a case that didn't
  run.**
- `"completed"` - all 3 cases ran for real; each case entry carries its own
  status, metrics, and (when tracing succeeded) a LangSmith `runId` and,
  if it could be resolved, a trace `url`. Only the run id/URL and the
  configured project name are ever recorded - never a key or other secret.

As committed, `results.json` reflects a real run of this sample in an
environment with none of the required credentials configured
(`run.status: "not_run"`, listing the exact missing variable names). No
LangSmith trace exists for that run, because none was created.

### Configuration

Set only through environment variables the OpenAI client and the LangSmith
SDK already recognize - no new required variable name is introduced for
credentials, and no value is ever printed, logged, or written to
`results.json`:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Already used elsewhere in this codebase; required to call the real model. |
| `LANGCHAIN_API_KEY` or `LANGSMITH_API_KEY` | LangSmith SDK's own recognized credential names (either works). |
| `LANGCHAIN_TRACING_V2` or `LANGSMITH_TRACING_V2`, set to `"true"` | Enables tracing (the SDK's own recognized flag). |
| `LANGCHAIN_PROJECT` or `LANGSMITH_PROJECT` (optional) | LangSmith project name. Defaults to `mira-creative-dna-monitoring-sample` if unset. |
| `MIRA_LANGSMITH_SAMPLE_COST_PER_1K_PROMPT_TOKENS_USD` / `MIRA_LANGSMITH_SAMPLE_COST_PER_1K_COMPLETION_TOKENS_USD` (optional) | Only affects the "estimated model cost" figure - no price is hardcoded in this sample, so cost is reported `null` ("not available") unless both are set to a real rate by the operator. |

Run with:

```
npx tsx capstone/langsmith/mira_monitoring_sample.ts
```

## Limitations

- **Heuristic scoring, not ground truth.** Brief/client-fact usage is a
  case-insensitive substring match against short expected-fact phrases
  chosen when the synthetic case was written; the unsupported-personal-
  detail scan is a regex-based check for emails, phone numbers, and
  unexplained capitalized two-word sequences. Both are intentionally simple
  and will produce false positives and false negatives (e.g. a legitimately
  capitalized style phrase like "Late Afternoon" could be flagged; a subtly
  paraphrased brief fact could be missed).
- **3 cases is a coverage floor, not a statistical sample.** It exercises
  the transformation once per shoot archetype; it does not establish a
  failure rate, cost distribution, or latency distribution.
- **Cost is only ever an estimate**, and only when the operator has
  explicitly configured a per-token rate. No price is hardcoded, because no
  verified current rate for this model was available to this sample.
- **Completeness scoring only reaches the list-field level.** Because every
  required text field is schema-enforced to be non-empty, this sample
  cannot distinguish "was this field written thoughtfully" from "was this
  field written at all" - that judgment still requires a person.
- **No image generation is exercised or monitored here** - this sample is
  scoped to the Creative DNA text transformation only, per this task's
  explicit boundary.

## Human-review requirement

None of the metrics above are a substitute for a person reading the actual
Creative DNA output. In particular: the unsupported-personal-detail scan is
a coarse safety net, not a guarantee of no hallucination; the brief/client
fact-usage scores can be gamed by incidental phrase overlap without the
content actually reflecting the input's intent; and nothing here evaluates
whether the resulting creative direction is actually *good*. A human -
today, the photographer at review - remains the point where a Creative DNA
object is accepted or sent back, exactly as the rest of MIRA's pipeline
already assumes (see `shouldActivateShootPreparation` in
`shared/miraCore.ts`, which gates only on synthesis *succeeding*, never on
these quality metrics).

## Files in this folder

- `mira_monitoring_sample.ts` - the runnable sample. Reuses
  `buildShootCreativeDnaSource`, `emptyShootMemory`/`applyShootMemoryPatch`,
  and `synthesizeMiraV4CreativeDna` unchanged from the existing codebase;
  adds only tracing and scoring.
- `synthetic_cases.json` - the 3 synthetic test cases.
- `results.json` - the output of the most recent run of the sample (see
  Results above).
- `langsmith-monitoring-sample.png` - **not included.** No credentials were
  available in this environment, so no real trace was ever created and no
  LangSmith UI screenshot could be captured honestly. Add one after a real
  run once `OPENAI_API_KEY` and the LangSmith variables above are
  configured.
