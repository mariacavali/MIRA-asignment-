# Mira V3 Multi-Signal Recognition Design

## Goal

Mira uses optional birth-date intelligence and consented image references to ask better questions and to test the final recognition against more than one signal. These sources never become standalone reports, diagnoses, personality labels, or user-visible answers.

## Credit-efficient lifecycle

1. A validated birth-date submission makes at most one Dakidarts request and persists only a compact normalized signal set through the existing `birth_data` module output.
2. Image analysis continues to run only when the user explicitly requests it and has granted both required consents.
3. Turns one through four establish the first-conversation evidence. Beginning with the next adaptive question, Mira may compare those answers with available hidden birth signals and image evidence.
4. The existing adaptive-question call is reused. No separate contradiction-detection model call is added. A structured `deeperProbe` flag and compact evidence input allow at most two deeper probes inside the existing eight-answer journey.
5. After eight answers, one dedicated final Recognition call compares all available evidence and is cached by an input fingerprint. Its private structured result then informs the single Reflection Bundle synthesis behind all three documents. There is no per-document Recognition call.

## Hidden birth-intelligence contract

The provider receives validated date, time, timezone, city, and country values. Its raw response exists only in request memory. The normalization boundary converts it to three to six qualitative signals selected from a controlled vocabulary and discards raw response fields, vendor labels, chart terminology, and numeric values before persistence.

The persisted output contains only:

| Field | Purpose |
|---|---|
| `available` | Whether safe normalized signals exist |
| `signals` | Bounded qualitative reflection cues for internal prompting |
| `reason` | Generic failure state when unavailable |

The client receives only whether optional context was saved and whether hidden signals are available. It never receives provider identity, raw output, signals, numerology terminology, or numbers.

## Second adaptive conversation

Turns one through four remain the evidence-establishing first conversation. For turns five through seven, the existing question generator receives compact hidden context when available. It must compare:

| Evidence source | Permitted use |
|---|---|
| First-conversation answers | Personal meaning and primary truth |
| Birth-date signals | Questions only; never a claim about the person |
| Image references | Visual tensions and preferences only |

When a cross-signal tension or useful pattern is present, Mira may ask one question beginning with “I’m noticing something interesting…” or a close natural variant. At most two adaptive questions may be marked as deeper probes. The generator may also decide that no deeper probe is warranted.

## Final Recognition contract

The final Recognition pass is a dedicated private structured comparison that runs before Reflection Bundle generation. Conversation evidence remains authoritative for personal claims. Optional signals may challenge, refine, or withhold a recommendation, but cannot create one on their own. The result is cached through the existing module-output contract and reused if the eight answers and compact optional evidence have not changed.

Each recommendation must be supported by either:

- two distinct conversation turns; or
- one conversation turn plus one compatible optional signal.

Unsupported recommendations are omitted. Birth intelligence is never quoted or named. Image evidence can support visual direction only. The shared Recognition result informs one immutable Reflection Bundle, which is then reused by The Mirror, Brand Soul File, and Visuals That Feel Like You.

## Failure behavior

Dakidarts is optional. Missing credentials, timeouts, non-success responses, malformed payloads, or normalization failures create a generic unavailable module state. The core journey continues with conversation evidence. No automatic retries occur inside a user request, preventing duplicate credit consumption.
