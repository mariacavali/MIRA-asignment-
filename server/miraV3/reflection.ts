import { invokeLLM } from "../_core/llm";

const MODEL_ID = "gpt-5-mini";

const FOCUS_SEQUENCE = [
  "purpose and the change they are here to create",
  "values and what must remain non-negotiable",
  "the hidden conflict or protective pattern holding them back",
  "their natural voice and the truth they hesitate to express",
  "how they lead, serve, and relate to the people they are here for",
  "the identity they are becoming and what it asks them to release",
  "the clearest decision that integrates everything they have named",
] as const;

const FALLBACK_QUESTIONS = [
  "I’m with what you shared. What change do you feel called to create for others, and why does that matter to you personally?",
  "There is something here worth staying with. Which value are you no longer willing to compromise, even if honoring it changes how you work or lead?",
  "I’m noticing a tension beneath what you said. What are you protecting yourself from when you hold back—and what does that protection now cost you?",
  "I can feel the thread becoming clearer. What truth sounds unmistakably like you, but still feels risky to say plainly?",
  "Something in your earlier words points toward the people you affect. Who becomes stronger, clearer, or freer through your work, and how do you want them to experience your leadership?",
  "The shape of this is becoming more visible now. Who are you becoming, and which familiar version of you can no longer lead the next chapter?",
  "Across what you’ve shared, one direction keeps asking to be named. If you trusted everything you have named here, what is the clearest decision you would make next?",
] as const;

export function getReflectionFocus(completedUserTurns: number) {
  const index = Math.min(Math.max(completedUserTurns - 1, 0), FOCUS_SEQUENCE.length - 1);
  return { focus: FOCUS_SEQUENCE[index], fallback: FALLBACK_QUESTIONS[index] };
}

export function shouldGenerateAdaptiveQuestion(nextTurnCount: number) {
  return nextTurnCount >= 1 && nextTurnCount < 8;
}

export function shouldLoadMultiSignalContext(nextTurnCount: number) {
  return nextTurnCount === 4;
}

export function shouldLoadBirthSignalContext(nextTurnCount: number) {
  return nextTurnCount === 4;
}

export function shouldLoadImageSignalContext(nextTurnCount: number) {
  return false;
}

export function isExplicitIncomprehensionResponse(answer: string) {
  const normalized = answer
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length > 140) return false;

  const exactSignals = new Set([
    "i don't understand",
    "i do not understand",
    "i'm confused",
    "i am confused",
    "what do you mean",
    "can you rephrase",
    "please rephrase",
    "can you explain",
  ]);
  if (exactSignals.has(normalized)) return true;

  return [
    /^(?:i don't understand|i do not understand)(?: (?:the|this|that|your) (?:question|prompt|meaning)| what you mean)?$/,
    /^(?:i'm|i am) (?:confused|not sure)(?: (?:by|about) (?:the|this|that|your) (?:question|prompt)| what you mean)$/,
    /^(?:the|this|that|your) (?:question|prompt) (?:doesn't|does not) make sense$/,
    /^(?:can|could|would) you (?:please )?(?:rephrase|simplify|explain)(?: (?:the|this|that|your) (?:question|prompt))?$/,
  ].some(pattern => pattern.test(normalized));
}

export type AdaptiveSignalContext = {
  birthRecognitionLayer: {
    confidence: string;
    contextSummary: string;
    adaptiveQuestionLens: string;
  } | null;
  imageSignals: Array<{
    sourceId: string;
    quote: string;
  }>;
};

export function assessMultiSignalProbeOpportunity(params: {
  completedUserTurns: number;
  signalContext?: AdaptiveSignalContext;
}) {
  const allowedTurn = shouldLoadMultiSignalContext(params.completedUserTurns);
  const hasBirthEvidence = shouldLoadBirthSignalContext(params.completedUserTurns)
    && Boolean(params.signalContext?.birthRecognitionLayer);
  const hasImageEvidence = shouldLoadImageSignalContext(params.completedUserTurns)
    && Boolean(params.signalContext?.imageSignals.length);
  const evidenceClasses = 1 + Number(hasBirthEvidence) + Number(hasImageEvidence);

  return {
    eligible: allowedTurn && evidenceClasses >= 2,
    evidenceClasses,
    hasConversationEvidence: true,
    hasBirthEvidence,
    hasImageEvidence,
  };
}

function contentToText(content: unknown): string {
  return typeof content === "string" ? content.trim() : "";
}

export async function generateAdaptiveQuestion(params: {
  completedUserTurns: number;
  messages: Array<{ role: "system" | "assistant" | "user"; content: string }>;
  newAnswer: string;
  signalContext?: AdaptiveSignalContext;
}) {
  const { focus, fallback } = getReflectionFocus(params.completedUserTurns);
  const transcript = [...params.messages, { role: "user" as const, content: params.newAnswer }]
    .slice(-12)
    .map(message => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const signalContext = params.signalContext;
  const probeAssessment = assessMultiSignalProbeOpportunity({
    completedUserTurns: params.completedUserTurns,
    signalContext,
  });
  const deeperProbeEligible = probeAssessment.eligible;
  const conversationMovementGuide = params.completedUserTurns >= 4
    ? "This is Conversation Two. The person should feel that you now perceive the relationship between several things they have said, not merely the latest answer. When the conversation supports it, draw together two or more recurring threads before opening one deeper layer. Do not announce a conclusion or phase change."
    : "This is Conversation One. Listen closely, stay exploratory, and follow the person's own language without drawing conclusions yet.";
  const compactSignals = deeperProbeEligible
      ? JSON.stringify({
        privateRecognitionLayer: signalContext?.birthRecognitionLayer,
        optionalVisualContext: signalContext?.imageSignals.slice(0, 6),
        evidenceClasses: probeAssessment.evidenceClasses,
      })
    : "No optional context is available for this turn.";

  try {
    const result = await invokeLLM({
      model: MODEL_ID,
      messages: [
        {
          role: "system",
          content:
            "You are Mira in one continuous, private human conversation. The person must feel slowly understood, never assessed, processed, coached, or moved through a questionnaire. Respond to the meaning of their latest answer, briefly and naturally acknowledge what you heard, then open one deeper layer with exactly one original question. Do not diagnose, teach, praise, score, label, summarize the whole conversation, stack questions, or provide an answer for them. Make the response specific to their words and meaningfully different from earlier turns. Evidence priority is strict: the person's latest answer first, repeated patterns across their conversation second, and the private Recognition Layer third. The private Recognition Layer is one weak contextual hypothesis, never a collection of separate systems or claims. Never mention its source, calculations, categories, labels, scores, numbers, provider, terminology, or certainty. Use it only once, at the boundary between the two conversational movements, to test a tension or convergence already present in the person's own words. It must never override, contradict, or replace what the person said. Use 24–58 words, including the brief acknowledgement, and end with one question mark.",
        },
        {
          role: "user",
          content: `${conversationMovementGuide}

The next inquiry must focus on ${focus}.

${deeperProbeEligible ? `This is the quiet boundary between Conversation One and Conversation Two. ${probeAssessment.hasBirthEvidence ? "It is the only turn on which the private Recognition Layer may influence what comes next. " : ""}Compare the latest answer with repeated conversation patterns before considering the private Recognition Layer. If a genuine contradiction or convergence is already supported by the conversation, acknowledge it in natural language and ask one deeper question. Never announce a phase change, source, process, or analysis.` : "Acknowledge the meaning of the latest answer in one restrained sentence, then ask one natural next question."}

PRIVATE OPTIONAL CONTEXT:
${compactSignals}

Conversation:
${transcript}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mira_reflection_question",
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

    const raw = contentToText(result.choices?.[0]?.message?.content);
    if (!raw) throw new Error("Adaptive-question model returned no structured content");
    const parsed = JSON.parse(raw) as { question?: unknown };
    const question = contentToText(parsed.question);
    if (!question || question.length > 500 || !question.endsWith("?")) {
      throw new Error("Invalid adaptive question shape");
    }

    return {
      question,
      provenance: {
        type: "adaptive_reflection",
        model: result.model || MODEL_ID,
        focus,
        mode: deeperProbeEligible ? "multi_signal_probe_opportunity" : "standard",
        fallback: false,
        usage: result.usage ?? null,
      },
    };
  } catch (error) {
    console.error("Mira adaptive question fallback", error);
    return {
      question: fallback,
      provenance: {
        type: "adaptive_reflection",
        model: MODEL_ID,
        focus,
        mode: deeperProbeEligible ? "multi_signal_probe_opportunity" : "standard",
        fallback: true,
        usage: null,
      },
    };
  }
}

export async function rephraseQuestionForClarity(question: string) {
  const original = question.trim();
  if (!original) throw new Error("A reflection question is required");
  try {
    const result = await invokeLLM({
      model: MODEL_ID,
      messages: [
        {
          role: "system",
          content: "You are Mira in a private human conversation. Rephrase one question in simpler, concrete language without changing its intent. Keep it warm and direct, ask exactly one question, and do not add teaching, examples, interpretation, praise, process language, or a second question. Use 12–34 words and end with one question mark.",
        },
        { role: "user", content: original },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mira_rephrased_question",
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
    const raw = contentToText(result.choices?.[0]?.message?.content);
    if (!raw) throw new Error("Question rephrase returned no structured content");
    const parsed = JSON.parse(raw) as { question?: unknown };
    const rephrased = contentToText(parsed.question);
    if (!rephrased || rephrased.length > 400 || !rephrased.endsWith("?")) throw new Error("Invalid rephrased question");
    return { question: rephrased, fallback: false as const };
  } catch (error) {
    console.error("Mira question rephrase fallback", error);
    return { question: `Put simply: ${original}`, fallback: true as const };
  }
}
