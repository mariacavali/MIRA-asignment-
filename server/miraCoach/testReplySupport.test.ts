import { describe, expect, it } from 'vitest';
import { interactiveReplyInstructions, unsupportedTestReplyDetails } from './testReplySupport';

describe('test-only reply support checks', () => {
  it('flags invented durations and fabricated case advice in replies and memory proposals', () => {
    expect(unsupportedTestReplyDetails({
      response: 'Try a 60–90 minute clarity session and use a micro-case (real or synthesized).',
      memoryProposals: [{ text: 'Offer a 3-session roadmap.' }],
    }, ['I help people with scattered ideas.'])).toEqual(expect.arrayContaining([
      'unsupported_duration:60-90 minute', 'fabricated_case_suggestion', 'unsupported_duration:3-session',
    ]));
  });
  it('allows client-provided details and a cautious forecast answer', () => {
    expect(unsupportedTestReplyDetails({ response: 'Your 60-minute session may be a fit.' },
      ['My current offer is a 60-minute session.'])).toEqual([]);
    expect(unsupportedTestReplyDetails({ response: 'I cannot give a reliable percentage without a baseline.' },
      ['What percentage will sales increase?'])).toEqual([]);
  });
  it('flags a made-up niche and promised outcome offered as an example', () => {
    expect(unsupportedTestReplyDetails({ response: 'For example, creative founders can choose a revenue-ready project.' },
      ['I help people with scattered ideas.'])).toEqual(['optional_ideas_not_labelled', 'unsupported_audience_example', 'unsupported_outcome_example']);
  });
  it('flags assumed site pages and an interview area that does not match its mapped memory', () => {
    const proposal = 'Prioritise an audit of home, services and contact pages to identify formal phrasing.';
    expect(unsupportedTestReplyDetails({ response: proposal, memoryProposals: [{ text: proposal }],
      interviewProposals: [{ area: 'visual_preferences', memoryProposalIndex: 0 }] },
    ['My website is formal but does not feel like how I work.'])).toEqual([
      'optional_ideas_not_labelled', 'unsupported_page_assumption', 'misaligned_interview_memory_area:visual_preferences',
    ]);
  });
  it('requires optional ideas to carry an explicit suggestions heading', () => {
    expect(unsupportedTestReplyDetails({ response: 'Try adding a short example.' }, []))
      .toContain('optional_ideas_not_labelled');
    expect(unsupportedTestReplyDetails({ response: 'Optional suggestions:\nSuggestion: Add a short example.' }, []))
      .not.toContain('optional_ideas_not_labelled');
  });
  it('classifies reply validation failures as recoverable without retrying them', async () => {
    const { isRecoverableTestReplyFailure } = await import('./testReplySupport');
    expect(isRecoverableTestReplyFailure(new Error('Unsupported test reply details: unsupported_duration'))).toBe(true);
    expect(isRecoverableTestReplyFailure(new Error('Invalid discovery proposal area'))).toBe(true);
    expect(isRecoverableTestReplyFailure(new Error('Provider attempt unconfirmed; no retry.'))).toBe(false);
  });
  it('tells MIRA to ask one focused question and label optional advice', () => {
    expect(interactiveReplyInstructions).toContain('ask exactly one relevant, focused clarification');
    expect(interactiveReplyInstructions).toContain('Optional suggestions:');
    expect(interactiveReplyInstructions).toContain('Suggestion:');
  });
});
