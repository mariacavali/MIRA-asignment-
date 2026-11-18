import { describe, it, expect } from "vitest";
import { conversationIssues, redactCredentials, FOCUSED_QUESTION_PATTERN } from "./conversationRules";
describe("one request for client input", () => {
  it("constrains the separate question field without banning ordinary brand words",()=>{
    for(const q of ['What were they struggling with?','Which brand element should stay?','What do clients misunderstand?','What’s the first priority?'])expect(FOCUSED_QUESTION_PATTERN.test(q)).toBe(true);
    for(const q of ['What was the problem and what changed?','What did they bring, what steps did you take?','What is the issue? Why?','What is your brand And how do you work?','What is your focus andwhat do you recommend?'])expect(FOCUSED_QUESTION_PATTERN.test(q)).toBe(false);
  });
  it("rejects the exact accepted diagnostic's two questions", () => {
    expect(conversationIssues("I hear you — you help people decide what to focus on. Is that right?\n\nWho’s the single person you most want to help?")).toContain("multiple_questions");
  });
  it.each(["Is that right? What happened next?", "Who do you help and how do you work?", "Tell me about your audience. What should they understand?", "Is that right？What happened next？"])("rejects multiple input requests: %s", value => expect(conversationIssues(value).length).toBeGreaterThan(0));
  it.each(["You help people decide what to focus on. Can you describe one recent example?", "Keep the name and green clients already recognise. Which part of the wording feels most unlike you?", "Use window light and a real note to express the practical direction.", "Would you use the wide image on your website or in a presentation?"])("allows a single useful focus or a complete answer: %s", value => expect(conversationIssues(value)).toEqual([]));
  it("redacts known secrets and credential-shaped text without changing ordinary prose", () => {
    const secret="synthetic-owned-test-secret";
    expect(redactCredentials(`Keep this private ${secret}`,secret)).not.toContain(secret);
    expect(redactCredentials('sk-proj-synthetic123456789012345')).toBe('[REDACTED_CREDENTIAL]');
    expect(redactCredentials('Bearer synthetic123456789012345')).toBe('Bearer [REDACTED_CREDENTIAL]');
    expect(redactCredentials('Keep your name and green colour.')).toBe('Keep your name and green colour.');
  });
});
