/** Constrain the existing full reply contract to server-owned current data.
 * No output text is rewritten, metadata dropped, or validation bypassed.
 */
export function groundTestReplyRequest(body: any, message: string,
  areas: { area: string; status: string }[], confirmedMemoryIds: string[] = [], options: { interactive?: boolean } = {}) {
  const result = structuredClone(body);
  const properties = result.response_format.json_schema.schema.properties;
  const quotes = Array.from(new Set([message, ...message.split(/(?<=[.!?])\s+/u)]
    .map(text => text.trim()).filter(text => text.length > 0 && text.length <= 1000 && message.includes(text))));
  if (!quotes.length) throw new Error('No exact current-message quote candidates.');
  const correction = /\b(?:actually|correction|correct that|I meant|I was wrong|changed my mind|instead of what I said)\b/i.test(message);
  const relevance: Record<string, RegExp> = {
    offer: /\b(?:offer|offering|service|pricing|price|package|manage|deliver|mentoring|content help|brand advice)\b/i,
    audience: /\b(?:audience|who I help|people I help|ideal client|target client)\b/i,
    intended_use: /\b(?:use this|website|site|social|brand book|profile|where should|how could)\b/i,
    desired_understanding: /\b(?:understand|come across|perceive|message|clearer)\b/i,
    meaningful_evidence: /\b(?:result|evidence|example|case study|proof|feedback)\b/i,
    voice: /\b(?:voice|tone|sound|wording|ordinary words|formal|polished|approachable|calm|clear)\b/i,
    visual_preferences: /\b(?:visual|image|photo|shoot|colour|color|green|light|desk|notes|styling|look)\b/i,
    visual_boundaries: /\b(?:do not want|don't want|avoid|must keep|keep my|name|logo|green)\b/i,
  };
  const proposalAreas = areas.filter(area => ['missing', 'needs_review'].includes(area.status) || correction)
    .filter(area => correction || relevance[area.area]?.test(message)).map(area => area.area);
  if (proposalAreas.length) properties.interviewProposals.items.properties.area.enum = proposalAreas;
  else properties.interviewProposals.maxItems = 0;
  const stateAreas = areas.map(area => area.area);
  if (stateAreas.length) properties.interviewStates.items.properties.area.enum = stateAreas;
  properties.interviewStates.items.properties.quote = { type: 'string', enum: quotes };
  const explicitState = /\b(?:I (?:do not|don't) know|I am not sure|I'm not sure|I’m not sure|I am unsure|I don't want to discuss|I do not want to discuss|skip (?:this|that)|rather not (?:say|answer|discuss))\b/i.test(message);
  if (!explicitState) properties.interviewStates.maxItems = 0;
  properties.interviewProposals.items.properties.correctionQuote = {
    anyOf: [{ type: 'string', enum: quotes }, { type: 'null' }],
  };
  // The model must not invent a UUID or point at an unconfirmed proposal.
  // The graph validator accepts only confirmed, non-source memory evidence.
  properties.interviewProposals.items.properties.memoryId = confirmedMemoryIds.length
    ? { anyOf: [{ type: 'string', enum: confirmedMemoryIds }, { type: 'null' }] }
    : { type: 'null' };
  if (options.interactive) {
    // The test can show optional suggestions in prose, but must not save them
    // as proposed client memory or attach interview areas to them.
    properties.memoryProposals.maxItems = 0;
    properties.interviewProposals.maxItems = 0;
    if (requiresClarification(message)) {
      const question = properties.nextQuestion;
      if (Array.isArray(question.anyOf)) question.anyOf = question.anyOf.filter((choice: any) => choice.type === 'string');
      question.description = 'Required: ask exactly one relevant clarification about the missing information. Do not provide optional advice until it is answered.';
    }
  }
  return result;
}

export function requiresClarification(message: string) {
  return /\b(?:what should we explore|what should i choose|which should i choose|i do not know|i don't know|i am not sure|i'm not sure|not sure|no (?:sales|baseline|conversion|tracking|performance) (?:data|metrics|tracking|test)|i have no (?:data|tracking|metrics)|i do not have|i don't have|without (?:a )?(?:baseline|tracking|data)|cannot tell|can't tell|unclear|unknown)\b/i.test(message);
}
