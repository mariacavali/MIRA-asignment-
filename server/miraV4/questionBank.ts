export type MiraV4BaseQuestion = {
  id: string;
  phase: "recognition" | "creative_discovery";
  order: number;
  question: string;
  evidenceGoal: string;
};

export type MiraV4AdaptiveGuide = {
  id: string;
  phase: "creative_discovery";
  order: number;
  focus: string;
  fallback: string;
};

export const MIRA_V4_BASE_QUESTIONS: readonly MiraV4BaseQuestion[] = [
  {
    id: "party_place",
    phase: "recognition",
    order: 1,
    question: "If your brand threw a party, where would it be?",
    evidenceGoal: "the spatial world, mood, and social energy that feels native to the brand",
  },
  {
    id: "brand_wear",
    phase: "recognition",
    order: 2,
    question: "What would your brand wear?",
    evidenceGoal: "the style language, level of polish, and personality cues that feel true",
  },
  {
    id: "atmosphere",
    phase: "creative_discovery",
    order: 1,
    question: "What would the atmosphere feel like?",
    evidenceGoal: "the emotional atmosphere that should guide the editorial world",
  },
  {
    id: "arrival_feeling",
    phase: "creative_discovery",
    order: 2,
    question: "How would you want people to feel when they arrived?",
    evidenceGoal: "the felt response the brand world should create in the right audience",
  },
  {
    id: "never_feel_like",
    phase: "creative_discovery",
    order: 3,
    question: "What should your brand never look or feel like?",
    evidenceGoal: "rejections, visual boundaries, and protective rules that define what does not belong",
  },
] as const;

export const MIRA_V4_ADAPTIVE_GUIDES: readonly MiraV4AdaptiveGuide[] = [
  {
    id: "underseen_quality",
    phase: "creative_discovery",
    order: 4,
    focus: "the part of the person or brand that still feels under-seen and needs stronger visual presence",
    fallback: "What part of you isn't visible enough in your brand right now?",
  },
  {
    id: "distinctive_anchor",
    phase: "creative_discovery",
    order: 5,
    focus: "one distinctive sensory or emotional anchor that should remain visible across the final campaign",
    fallback: "What detail would make this feel unmistakably yours?",
  },
] as const;

export function getMiraV4BaseQuestion(
  phase: "recognition" | "creative_discovery",
  order: number,
) {
  return MIRA_V4_BASE_QUESTIONS.find(question => question.phase === phase && question.order === order);
}

export function getMiraV4AdaptiveGuide(order: number) {
  return MIRA_V4_ADAPTIVE_GUIDES.find(guide => guide.order === order);
}