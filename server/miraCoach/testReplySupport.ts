/** Test-only guard for concrete claims that a reply presents as client-ready advice. */
export const interactiveReplyInstructions = [
  'When a material detail needed for a reliable answer is missing, do not infer it or fill the gap with an example.',
  'Briefly say what is unclear and ask exactly one relevant, focused clarification in the separate nextQuestion field.',
  'Do not add recommendations until the answer resolves that gap.',
  'Do not invent a target audience, service format or duration, website pages, results, metrics, sample sizes, client examples or testimonials.',
  'If you offer non-essential ideas, begin the response with the exact heading “Optional suggestions:” and prefix each idea with “Suggestion:”; phrase them as optional choices, never as client facts.',
  'Do not save model-created ideas as memory proposals.',
].join(' ');

export function unsupportedTestReplyDetails(input: {
  response: string;
  memoryProposals?: { text: string }[];
  interviewProposals?: { area: string; memoryProposalIndex: number | null }[];
}, sourceTexts: string[]) {
  const source = sourceTexts.join('\n').toLocaleLowerCase().replace(/[‐‑‒–—]/g, '-');
  const content = [input.response, ...(input.memoryProposals ?? []).map(item => item.text)];
  const issues: string[] = [];
  const offersAdvice = /\b(?:try|consider|you could|you might|one option|another option|suggest|recommend|create|add|replace|audit|test|use|keep|track|measure|include|show|publish|write|start|change|choose|focus on)\b/i.test(input.response);
  if (offersAdvice && !/^\s*optional suggestions\s*:/i.test(input.response)) issues.push('optional_ideas_not_labelled');
  for (const text of content) {
    const normalized = text.toLocaleLowerCase().replace(/[‐‑‒–—]/g, '-');
    for (const match of normalized.matchAll(/\b\d+(?:\s*-\s*\d+)?\s*[- ]?\s*(?:minutes?|hours?|sessions?)\b/giu)) {
      if (!source.includes(match[0].replace(/\s+/g, ' '))) issues.push(`unsupported_duration:${match[0].trim()}`);
    }
    if (/\b(?:real\s+or\s+synthesi[sz]ed|synthesi[sz]ed|fictional|invented)\b.{0,24}\b(?:micro[-\s]?)?(?:case|example|client|testimonial)\b|\b(?:micro[-\s]?)?(?:case|example|client|testimonial)\b.{0,24}\b(?:real\s+or\s+synthesi[sz]ed|synthesi[sz]ed|fictional|invented)\b/iu.test(text)) {
      issues.push('fabricated_case_suggestion');
    }
    for (const match of normalized.matchAll(/\b(?:e\.g\.|for example|such as)\s*[, :]?\s+[^.!?]{1,120}\b(?:founders?|entrepreneurs?|creators?|coaches?|designers?|consultants?|business owners?|clients?)\b/giu)) {
      if (!source.includes(match[0])) issues.push('unsupported_audience_example');
    }
    if (/\brevenue[- ]ready\b/iu.test(text) && !/\brevenue[- ]ready\b/iu.test(source)) issues.push('unsupported_outcome_example');
    const namedPageList = /\bhome\s*,\s*services?\s+and\s+contact\b|\bhome\s*,\s*services?\s*,\s*contact\b|\b(?:home(?:page)?|services?|contact)\s+pages\b/iu;
    if (namedPageList.test(text) && !namedPageList.test(source)) issues.push('unsupported_page_assumption');
    for (const match of normalized.matchAll(/\b\d+(?:\.\d+)?\s*%\s*(?:increase|lift|growth|conversion|sales|revenue)\b/giu)) {
      if (!source.includes(match[0].replace(/\s+/g, ' '))) issues.push(`unsupported_performance_claim:${match[0].trim()}`);
    }
  }
  const mappingTerms: Record<string, RegExp> = {
    intended_use: /\b(?:website|web site|page|site|profile|social|use)\b/i,
    offer: /\b(?:offer|offering|service|pricing|price|package|deliver|manage|mentoring)\b/i,
    audience: /\b(?:audience|people|client|customer|founder|creator|who I help)\b/i,
    desired_understanding: /\b(?:understand|clear|message|perceive|come across)\b/i,
    meaningful_evidence: /\b(?:result|evidence|example|case|proof|feedback|testimonial)\b/i,
    voice: /\b(?:word|language|tone|voice|formal|plain|ordinary|jargon|copy|microcopy|headline|writing|phrase|conversational)\b/i,
    visual_preferences: /\b(?:visual|photo|image|light|colour|color|style|look|composition|styling|shot|framing|prop|photograph|illustration|note-style)\b/i,
    visual_boundaries: /\b(?:green|logo|name|avoid|keep|do not want|must keep|boundary)\b/i,
  };
  for (const mapping of input.interviewProposals ?? []) {
    if (mapping.memoryProposalIndex === null) continue;
    const text = input.memoryProposals?.[mapping.memoryProposalIndex]?.text ?? '';
    if (!mappingTerms[mapping.area]?.test(text)) issues.push(`misaligned_interview_memory_area:${mapping.area}`);
  }
  return [...new Set(issues)];
}

export function isRecoverableTestReplyFailure(error: unknown) {
  const value = error as { name?: string; category?: string; message?: string };
  if (value?.name === 'CoachModelError' && ['invalid_output', 'client_boundary_conflict'].includes(value.category ?? '')) return true;
  return /Invalid discovery (?:conversation state|proposal area|proposal source|proposal index)|Unsupported test reply details|conversation_rules:|Client service boundary conflict/i
    .test(value?.message ?? '');
}
