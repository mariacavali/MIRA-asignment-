# Brand Soul File Prompt

## Generation instruction

Use the confirmed Reflection Bundle only. Do not call a second interpretive model, add generic branding advice, or introduce claims that were not present in the confirmed conversation evidence.

Transform the confirmed bundle into this exact structure:

```json
{
  "title": "Brand Soul File",
  "subtitle": "A working language for the truth at the centre of your brand.",
  "sections": [
    { "heading": "Recognition", "body": "{{confirmed_mirror.recognition}}" },
    { "heading": "Current chapter", "body": "{{confirmed_essence.currentChapter}}" },
    { "heading": "Strengths", "body": "{{confirmed_essence.strengths}}" },
    { "heading": "Zone of genius", "body": "{{confirmed_essence.zoneOfGenius}}" },
    { "heading": "Shadows", "body": "{{confirmed_essence.shadows}}" },
    { "heading": "Decision compass", "body": "{{confirmed_essence.decisionCompass}}" },
    { "heading": "Natural contribution", "body": "{{confirmed_essence.naturalContribution}}" },
    { "heading": "Growth edge", "body": "{{confirmed_essence.growthEdge}}" }
  ],
  "voiceQualities": "{{three_to_five_confirmed_voice_qualities}}",
  "evidence": "{{up_to_four_turn_linked_quotes}}"
}
```

## Evidence and voice rules

| Element | Rule |
|---|---|
| Recognition | Must come from the confirmed Recognition synthesis |
| Current chapter | Names the user’s evidenced present chapter without prediction |
| Strengths and zone of genius | Describe evidenced contribution, not praise or personality labels |
| Shadows and growth edge | Name supported tensions without diagnosis or coaching |
| Decision compass and natural contribution | Stay grounded in the user’s language and confirmed synthesis |
| Voice qualities | Three to five concise qualities; no archetypes |
| Evidence | Exact excerpts tied to the original reflection turn |
