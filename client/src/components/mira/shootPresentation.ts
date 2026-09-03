// UI-only presentation filter. Never touches stored data - it only decides
// what the client-facing Shoot Room is allowed to render, so internal
// QA/engineering language never reaches a real client's screen.
const INTERNAL_LANGUAGE_PATTERN =
  /\b(synthetic qa|qa|pipeline|preparation_active|discovery_confirmed|discovery_offered|discovery_in_progress|summary_pending|retryable_error|backend|room ?state|creative[_ ]dna[_ ]synthesis|state machine|gate|p[1-8]|verification|transitions?)\b/i;

export function containsInternalLanguage(text: string): boolean {
  return INTERNAL_LANGUAGE_PATTERN.test(text);
}

// Falls back to real, already-stored fields (shoot type, then intended use)
// rather than inventing anything, and only when the actual title looks
// like internal QA/test copy.
export function deriveClientFacingShootTitle(shoot: {
  title: string;
  shootType: string | null;
  intendedUse: string | null;
}): string {
  if (!containsInternalLanguage(shoot.title)) return shoot.title;
  return shoot.shootType || shoot.intendedUse || "Your Shoot Preparation";
}
