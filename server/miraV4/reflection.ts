import { invokeLLM } from "../_core/llm";
import {
  getMiraV4AdaptiveGuide,
  getMiraV4BaseQuestion,
} from "./questionBank";

const MODEL_ID = "gpt-5-mini";

export const FIRST_RECOGNITION_QUESTION =
  getMiraV4BaseQuestion("recognition", 1)?.question ??
  "If your brand threw a party, where would it be?";

const RECOGNITION_GUIDE = {
  movement: "creative_premise",
  focus: "the emotional promise and audience recognition that should guide the editorial world",
  fallback:
    getMiraV4BaseQuestion("recognition", 2)?.question ??
    "What would your brand wear?",
} as const;

export const FIRST_CREATIVE_DISCOVERY_QUESTION =
  getMiraV4BaseQuestion("creative_discovery", 1)?.question ??
  "What would the atmosphere feel like?";

const CREATIVE_MOVEMENTS = [
  {
    movement: "audience_feeling",
    focus:
      getMiraV4BaseQuestion("creative_discovery", 2)?.evidenceGoal ??
      "the felt response the brand world should create in the right audience",
    fallback:
      getMiraV4BaseQuestion("creative_discovery", 2)?.question ??
      "How would you want people to feel when they arrived?",
  },
  {
    movement: "visual_boundaries",
    focus:
      getMiraV4BaseQuestion("creative_discovery", 3)?.evidenceGoal ??
      "rejections and visual boundaries that define what does not belong",
    fallback:
      getMiraV4BaseQuestion("creative_discovery", 3)?.question ??
      "What should your brand never look or feel like?",
  },
  {
    movement: "underseen_quality",
    focus:
      getMiraV4AdaptiveGuide(4)?.focus ??
      "the part of the person or brand that still feels under-seen and needs stronger visual presence",
    fallback:
      getMiraV4AdaptiveGuide(4)?.fallback ??
      "What part of you isn't visible enough in your brand right now?",
  },
  {
    movement: "distinctive_anchor",
    focus:
      getMiraV4AdaptiveGuide(5)?.focus ??
      "one distinctive sensory or emotional anchor that should remain visible across the final campaign",
    fallback:
      getMiraV4AdaptiveGuide(5)?.fallback ??
      "What detail would make this feel unmistakably yours?",
  },
] as const;

const STATIC_BRIDGES: Partial<Record<number, string>> = {
  1: "What I hear is a creative premise taking shape through what this work needs to make possible.",
};

function text(content: unknown) {
  return typeof content === "string" ? content.trim() : "";
}

const CREATIVE_FORBIDDEN_SCOPE = /\b(?:brand\s+(?:dna|book)|creative\s+dna|campaign\s+plan|mood\s*boards?|images?|outputs?|deliverables?|implementation\s+stages?)\b/i;
const COMPOUND_QUESTION_JOIN = /\b(?:and|or)\s+(?:what|which|how|where|when|who|why|should|would|could|do|does|is|are|can|will)\b/i;

function isSafeCreativeQuestion(question: string) {
  const questionMarks = question.match(/\?/g)?.length ?? 0;
  return questionMarks === 1 && !CREATIVE_FORBIDDEN_SCOPE.test(question) && !COMPOUND_QUESTION_JOIN.test(question);
}

export function shouldGenerateRecognitionQuestion(completedAnswers: number) {
  return completedAnswers === 1;
}

export function buildRecognitionAssistantMessage(completedAnswers: number, question: string) {
  const bridge = STATIC_BRIDGES[completedAnswers];
  return bridge ? `${bridge}\n\n${question}` : question;
}

export async function generateRecognitionQuestion(params: {
  completedAnswers: number;
  messages: Array<{ role: "assistant" | "user"; content: string }>;
  newAnswer: string;
  quickContext: {
    building: string | null;
    currentPosition: string | null;
    needMost: string | null;
    firstCreation: string | null;
  };
}) {
  const nextBaseQuestion = getMiraV4BaseQuestion("recognition", params.completedAnswers + 1);
  if (nextBaseQuestion) {
    return {
      question: nextBaseQuestion.question,
      provenance: {
        type: "v4_base_recognition_question",
        model: null,
        movement: nextBaseQuestion.id,
        focus: nextBaseQuestion.evidenceGoal,
        fallback: false,
        usage: null,
      },
    };
  }

  return generateAdaptiveQuestion({
    mode: "recognition",
    guide: RECOGNITION_GUIDE,
    messages: params.messages,
    newAnswer: params.newAnswer,
    context: {
      workOrBrandAbout: params.quickContext.building,
      currentRelationshipToIt: params.quickContext.currentPosition,
      desiredAudienceFeeling: params.quickContext.needMost,
      moodboardPurpose: params.quickContext.firstCreation,
      storedFieldMap: "building=current work or brand; currentPosition=current relationship; needMost=desired audience feeling; firstCreation=Moodboard purpose",
    },
  });
}

export function shouldGenerateCreativeQuestion(completedAnswers: number) {
  return completedAnswers >= 1 && completedAnswers < 5;
}

export async function generateCreativeQuestion(params: {
  completedAnswers: number;
  messages: Array<{ role: "assistant" | "user"; content: string }>;
  newAnswer: string;
  quickContext: {
    building: string | null;
    currentPosition: string | null;
    needMost: string | null;
    firstCreation: string | null;
  };
  creativeInputs: Record<string, unknown> | null;
}) {
  const nextBaseQuestion = getMiraV4BaseQuestion("creative_discovery", params.completedAnswers + 1);
  if (nextBaseQuestion) {
    return {
      question: nextBaseQuestion.question,
      provenance: {
        type: "v4_base_creative_discovery_question",
        model: null,
        movement: nextBaseQuestion.id,
        focus: nextBaseQuestion.evidenceGoal,
        fallback: false,
        usage: null,
      },
    };
  }

  const guide = CREATIVE_MOVEMENTS[Math.min(Math.max(params.completedAnswers - 1, 0), CREATIVE_MOVEMENTS.length - 1)];
  return generateAdaptiveQuestion({
    mode: "creative_discovery",
    guide,
    messages: params.messages,
    newAnswer: params.newAnswer,
    context: {
      workOrBrandAbout: params.quickContext.building,
      currentRelationshipToIt: params.quickContext.currentPosition,
      desiredAudienceFeeling: params.quickContext.needMost,
      moodboardPurpose: params.quickContext.firstCreation,
      creativeInputs: params.creativeInputs,
    },
  });
}

async function generateAdaptiveQuestion(params: {
  mode: "recognition" | "creative_discovery";
  guide: { movement: string; focus: string; fallback: string };
  messages: Array<{ role: "assistant" | "user"; content: string }>;
  newAnswer: string;
  context: Record<string, unknown>;
}) {
  const transcript = [...params.messages, { role: "user" as const, content: params.newAnswer }]
    .slice(-14)
    .map(message => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  try {
    const result = await invokeLLM({
      model: MODEL_ID,
      messages: [
        {
          role: "system",
          content:
            params.mode === "recognition"
              ? "You are Mira, an AI Creative Director in a private conversation about a personal brand. Begin with one short, plain-language evidence reflection using the person's own words, then ask exactly one short adaptive next question. Keep the question simple, concrete, and easy to answer. The response must collect the stated evidence gap for the visual brand world. Follow their language rather than sounding like a coach, therapist, or personality test. Do not diagnose, advise, praise, score, summarize the whole conversation, announce a framework, or ask visual-preference questions before the creative-discovery phase. Use 18–52 words total and end with one question mark."
              : "You are Mira, an AI Creative Director, continuing a short private brand-discovery conversation. Briefly acknowledge the latest answer, then ask exactly one simple adaptive next question that fills the stated evidence gap for the visual brand world. Gather usable evidence for atmosphere, materials, spatial world, styling, composition, camera feeling, emotional arc, or one enduring creative rule. Follow their language rather than a questionnaire. Do not ask a compound or multi-part question. Do not imitate a named brand, diagnose, advise, praise, score, summarize the whole conversation, announce a framework, or generate a final identity. Do not mention Creative DNA, Campaign Plan, Brand Book, mood boards, images, outputs, deliverables, or implementation stages. Use 18–48 words and end with one question mark.",
        },
        {
          role: "user",
          content: `This is evidence movement: ${params.guide.movement}. The next question should collect ${params.guide.focus}.

Private context:
${JSON.stringify(params.context)}

Conversation:
${transcript}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `mira_v4_${params.mode}_question`,
          strict: true,
          schema: {
            type: "object",
            properties: { question: { type: "string" } },
            required: ["question"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = text(result.choices?.[0]?.message?.content);
    if (!raw) throw new Error("Mira model returned no structured content");
    const parsed = JSON.parse(raw) as { question?: unknown };
    const question = text(parsed.question);
    if (!question || question.length > 500 || !question.endsWith("?")) throw new Error("Invalid Mira question shape");

    if (params.mode === "creative_discovery" && !isSafeCreativeQuestion(question)) {
      console.warn("Mira V4 creative_discovery scope guard used deterministic fallback");
      return {
        question: params.guide.fallback,
        provenance: {
          type: `v4_adaptive_${params.mode}`,
          model: result.model || MODEL_ID,
          movement: params.guide.movement,
          focus: params.guide.focus,
          fallback: true,
          scopeGuard: true,
          usage: result.usage ?? null,
        },
      };
    }

    return {
      question,
      provenance: {
        type: `v4_adaptive_${params.mode}`,
        model: result.model || MODEL_ID,
        movement: params.guide.movement,
        focus: params.guide.focus,
        fallback: false,
        usage: result.usage ?? null,
      },
    };
  } catch (error) {
    console.error(`Mira V4 ${params.mode} fallback`, error);
    return {
      question: params.guide.fallback,
      provenance: {
        type: `v4_adaptive_${params.mode}`,
        model: MODEL_ID,
        movement: params.guide.movement,
        focus: params.guide.focus,
        fallback: true,
        usage: null,
      },
    };
  }
}
