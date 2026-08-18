import { describe, expect, it } from "vitest";
import {
  generateRecognitionResult,
  hasConversationFirstSupport,
  recognitionResultSchema,
} from "./recognition";

const runLiveRecognition = process.env.RUN_MIRA_LIVE_RECOGNITION === "1";

describe.skipIf(!runLiveRecognition)("Mira V3 live final Recognition", () => {
  it("returns one privacy-safe structured layer without fallback", async () => {
    const answers = [
      "I am at my best when I turn a complicated situation into a clear next step without taking away another person's ownership.",
      "I want people to leave with simpler language, stronger trust in their own judgment, and one deliberate action they can take.",
      "Respect for agency is non-negotiable; clarity should help someone hear themselves rather than make them dependent on me.",
      "I sometimes soften a recommendation because I fear directness will look controlling, even when one clear path would be more useful.",
      "My strongest voice names what matters, recommends one grounded direction, and leaves explicit room for the person to adapt it.",
      "I thrive in quiet, spacious environments with thoughtful people, clear boundaries, and enough time to recognize the underlying pattern.",
      "My natural strength is giving precise and humane language to the structure inside a messy situation.",
      "The growth edge is making that point of view visible sooner instead of refining privately until the moment to lead has passed.",
    ];
    const messages = answers.map(content => ({ role: "user", content }));

    const recognition = await generateRecognitionResult({
      messages,
      recognitionLayer: null,
      imageEvidence: [],
    });

    expect(recognition.generation.fallback).toBe(false);
    expect(recognitionResultSchema.parse(recognition)).toEqual(recognition);
    expect(hasConversationFirstSupport(recognition)).toBe(true);
    expect(JSON.stringify(recognition)).not.toMatch(
      /Dakidarts|numerolog|astrolog|zodiac|horoscope|life path|heart desire|calculation|provider/i,
    );
  }, 90_000);
});
