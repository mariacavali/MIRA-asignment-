const MEANINGFUL_SHORT_REPLIES = new Set([
  "yes", "no", "ok", "okay", "confirmed", "confirm", "sure", "correct", "wrong",
  "later", "now", "pause", "stop", "continue", "thanks", "thank you",
]);

const NOISE_MARKERS = /^(?:\[?(?:noise|background noise|inaudible|silence|music|applause|crosstalk)\]?|(?:uh|um|hmm)+)[.!?\s]*$/i;
const NON_WORD_CHARACTERS = new RegExp("[^\\p{L}\\p{N}' ]", "gu");
const HAS_WORD_CHARACTER = new RegExp("[\\p{L}\\p{N}]", "u");

export function classifyRealtimeTranscript(content: string, confidence?: number | null) {
  const normalized = content.trim().replace(/\s+/g, " ");
  const words = normalized.toLowerCase().replace(NON_WORD_CHARACTERS, "").trim();
  if (!normalized) return { meaningful: false, reason: "empty" as const };
  if (MEANINGFUL_SHORT_REPLIES.has(words)) return { meaningful: true, reason: "meaningful_short_reply" as const };
  if (typeof confidence === "number" && confidence < 0.35) return { meaningful: false, reason: "low_confidence" as const };
  if (NOISE_MARKERS.test(normalized)) return { meaningful: false, reason: "noise_marker" as const };
  if (!HAS_WORD_CHARACTER.test(normalized)) return { meaningful: false, reason: "non_semantic" as const };
  if (words.length < 2) return { meaningful: false, reason: "too_short" as const };
  return { meaningful: true, reason: "semantic_content" as const };
}
