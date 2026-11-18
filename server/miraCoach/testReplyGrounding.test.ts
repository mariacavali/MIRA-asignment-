import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coachReplyWireSchema } from './model';
import { groundTestReplyRequest, requiresClarification } from './testReplyGrounding';

const message = 'My website is formal and polished, but it does not feel like how I work. I explain things in ordinary words and use simple notes. Existing clients recognise my name and green colour; I do not want to lose those. What should we explore next?';
const areas = [{ area: 'offer', status: 'missing' }, { area: 'voice', status: 'unknown' }];
const body = () => ({ model: 'gpt-5-mini-2025-08-07', max_completion_tokens: 1800, response_format: { json_schema: {
  strict: true, schema: z.toJSONSchema(coachReplyWireSchema({ provider: 'openai', apiKey: 'test', model: 'test', separateQuestionField: true })) } } });

describe('current-message grounding for the observed live failure', () => {
  it('prevents unsupported areas, fabricated/history quotes, and unspoken unknown states while retaining the full reply fields', () => {
    const original = body(), value = groundTestReplyRequest(original, message, areas);
    const properties = value.response_format.json_schema.schema.properties;
    expect(properties.interviewProposals.maxItems).toBe(0);
    expect(properties.interviewStates.items.properties.quote.enum).not.toContain(':)');
    expect(properties.interviewStates.items.properties.quote.enum).not.toContain('I offer mentoring, content help and brand advice, but I struggle to explain my offer.');
    expect(properties.interviewStates.items.properties.quote.enum.every((quote: string) => message.includes(quote))).toBe(true);
    expect(properties.interviewStates.maxItems).toBe(0);
    expect(Object.keys(properties)).toEqual(expect.arrayContaining(['response', 'nextQuestion', 'memoryProposals', 'interviewProposals', 'interviewStates']));
    expect(original.response_format.json_schema.schema).not.toEqual(value.response_format.json_schema.schema);
    expect(value.model).toBe(original.model); expect(value.max_completion_tokens).toBe(1800);
  });
  it('retains explicit uncertainty observations and correction routes when the current client actually supplies them', () => {
    const current = "Actually, I changed my mind. I'm not sure who my audience is.";
    const properties = groundTestReplyRequest(body(), current, areas).response_format.json_schema.schema.properties;
    expect(properties.interviewProposals.items.properties.area.enum).toEqual(['offer', 'voice']);
    expect(properties.interviewStates.maxItems).toBe(9);
    expect(properties.interviewStates.items.properties.quote.enum).toContain("I'm not sure who my audience is.");
    expect(properties.interviewProposals.items.properties.correctionQuote.anyOf[1]).toEqual({ type: 'null' });
  });
  it('allows only confirmed evidence IDs, or null when the conversation has no confirmed memories', () => {
    const properties = groundTestReplyRequest(body(), message, areas).response_format.json_schema.schema.properties;
    expect(properties.interviewProposals.items.properties.memoryId).toEqual({ type: 'null' });
    const withEvidence = groundTestReplyRequest(body(), message, areas, ['1e8d4b42-4df8-4c56-8e1f-17363cb28286'])
      .response_format.json_schema.schema.properties;
    expect(withEvidence.interviewProposals.items.properties.memoryId.anyOf[0].enum)
      .toEqual(['1e8d4b42-4df8-4c56-8e1f-17363cb28286']);
  });
  it('restricts discovery proposals to areas relevant to the current client message', () => {
    const visual = 'I confirm calm and practical. I need one wide website image and square social images at a desk near a window.';
    const properties = groundTestReplyRequest(body(), visual, [
      { area: 'offer', status: 'missing' }, { area: 'visual_preferences', status: 'missing' },
    ]).response_format.json_schema.schema.properties;
    expect(properties.interviewProposals.items.properties.area.enum).toEqual(['visual_preferences']);
    const sales = 'What exact percentage will sales increase if I change my logo?';
    const salesProperties = groundTestReplyRequest(body(), sales, [{ area: 'offer', status: 'missing' }])
      .response_format.json_schema.schema.properties;
    expect(salesProperties.interviewProposals.maxItems).toBe(0);
  });
  it('keeps model ideas out of pending memory during an interactive test', () => {
    const properties = groundTestReplyRequest(body(), message, areas, [], { interactive: true })
      .response_format.json_schema.schema.properties;
    expect(properties.memoryProposals.maxItems).toBe(0);
    expect(properties.interviewProposals.maxItems).toBe(0);
  });
  it('requires one non-null clarification for a message that explicitly lacks a decision or key information', () => {
    const properties = groundTestReplyRequest(body(), 'I have no sales data. What should we explore next?', areas, [], { interactive: true })
      .response_format.json_schema.schema.properties;
    expect(properties.nextQuestion.anyOf).toHaveLength(1);
    expect(properties.nextQuestion.anyOf[0].type).toBe('string');
    expect(properties.nextQuestion.description).toContain('exactly one relevant clarification');
    expect(requiresClarification('I do not have a baseline for this.')).toBe(true);
    expect(requiresClarification('My current offer is a 60-minute session.')).toBe(false);
  });
});
