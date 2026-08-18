import { invokeLLM } from "../_core/llm";

const MODEL_ID = "gpt-5-mini";

export type MiraV4BrandBlueprintPreview = {
  yourWords: string[];
  miraSees: string;
  signaturePatterns: string[];
  definingTensions: string[];
  brandWorld: {
    atmosphere: string;
    colour: string;
    light: string;
    materials: string;
    environmentArchitecture: string;
    styling: string;
    movement: string;
    composition: string;
  };
  presence: {
    expression: string;
    bodyLanguage: string;
    movement: string;
    relationshipToCamera: string;
  };
  creativeRules: {
    belongs: string[];
    avoid: string[];
  };
  suggestedCreativeBrief: {
    warmth: number;
    structure: number;
    expression: number;
    texture: string;
    colorAttraction: string;
    typography: string;
    imageryWorld: string;
  };
};

type BlueprintSource = {
  journey: {
    building: string | null;
    currentPosition: string | null;
    needMost: string | null;
    firstCreation: string | null;
  };
  messages: Array<{
    phase: "recognition" | "creative_discovery";
    role: "assistant" | "user";
    content: string;
  }>;
};

function uniqueSentencesFromAnswers(answers: string[]) {
  const seen = new Set<string>();
  const phrases: string[] = [];

  for (const answer of answers) {
    const parts = answer
      .split(/(?<=[.!?])\s+/)
      .map(part => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const normalized = part.toLowerCase();
      if (normalized.length < 24 || seen.has(normalized)) continue;
      seen.add(normalized);
      phrases.push(part);
      if (phrases.length >= 6) return phrases;
    }
  }

  return phrases;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deriveFallback(source: BlueprintSource): MiraV4BrandBlueprintPreview {
  const answers = source.messages
    .filter(message => message.role === "user")
    .map(message => message.content.trim())
    .filter(Boolean);
  const phrases = uniqueSentencesFromAnswers(answers).slice(0, 5);
  const combined = answers.join(" ").toLowerCase();
  const avoid: string[] = [];

  if (combined.includes("never")) avoid.push("Anything that performs a false version of the brand");
  if (combined.includes("fake")) avoid.push("Anything that feels fake or over-performed");
  if (combined.includes("generic")) avoid.push("Generic brand language or template energy");

  return {
    yourWords: phrases,
    miraSees:
      "A brand world that wants to feel distinctive, human, and visually coherent without becoming over-explained.",
    signaturePatterns: [
      "A consistent pull toward recognisable atmosphere rather than generic polish.",
      "Strong visual boundaries around what does not belong.",
      "A need for the brand to reveal more of the real person behind it.",
    ],
    definingTensions: ["polish and ease"],
    brandWorld: {
      atmosphere: source.journey.needMost || "Warm, recognisable, editorial.",
      colour: "Restrained tones with one clearer point of contrast.",
      light: "Soft natural light with enough shape to feel intentional.",
      materials: "Tactile, grounded materials with visible texture.",
      environmentArchitecture: "Spaces that feel considered, calm, and lived in.",
      styling: "Refined pieces that still feel like a real person could inhabit them.",
      movement: "Natural movement rather than rigid posing.",
      composition: "Clean composition with breathing room and one clear focal point.",
    },
    presence: {
      expression: "Relaxed, present, and emotionally available.",
      bodyLanguage: "Open, self-possessed, and unforced.",
      movement: "Small, natural gestures rather than choreography.",
      relationshipToCamera: "Direct enough to feel clear, soft enough to feel human.",
    },
    creativeRules: {
      belongs: ["Clear atmosphere", "Recognisable personal detail", "Editorial restraint"],
      avoid: avoid.length ? avoid : ["Anything generic, overly polished, or emotionally flat"],
    },
    suggestedCreativeBrief: {
      warmth: clamp(combined.includes("warm") ? 72 : 58),
      structure: clamp(combined.includes("clean") || combined.includes("tailored") ? 64 : 52),
      expression: clamp(combined.includes("quiet") || combined.includes("soft") ? 42 : 56),
      texture:
        combined.includes("architect") || combined.includes("stone")
          ? "Architectural"
          : combined.includes("organic") || combined.includes("natural")
            ? "Organic"
            : "Tactile",
      colorAttraction:
        combined.includes("monochrome")
          ? "Monochrome"
          : combined.includes("bright") || combined.includes("luminous")
            ? "Luminous"
            : "Earthy",
      typography: combined.includes("sans") ? "Quiet sans" : "Editorial serif",
      imageryWorld:
        combined.includes("object") || combined.includes("detail")
          ? "Objects and detail"
          : combined.includes("portrait")
            ? "Portrait-led"
            : "Atmospheric spaces",
    },
  };
}

function isPreview(value: unknown): value is MiraV4BrandBlueprintPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Record<string, unknown>;
  return Array.isArray(preview.yourWords)
    && typeof preview.miraSees === "string"
    && Array.isArray(preview.signaturePatterns)
    && Array.isArray(preview.definingTensions)
    && typeof preview.brandWorld === "object"
    && typeof preview.presence === "object"
    && typeof preview.creativeRules === "object"
    && typeof preview.suggestedCreativeBrief === "object";
}

export async function buildMiraV4BrandBlueprintPreview(source: BlueprintSource) {
  const fallback = deriveFallback(source);
  const answers = source.messages
    .filter(message => message.role === "user")
    .map(message => message.content.trim())
    .filter(Boolean);
  const transcript = source.messages
    .map(message => `${message.role.toUpperCase()} [${message.phase}]: ${message.content}`)
    .join("\n\n");

  try {
    const result = await invokeLLM({
      model: MODEL_ID,
      max_completion_tokens: 1400,
      messages: [
        {
          role: "system",
          content:
            "You are Mira, an AI Creative Director building a concise Brand Blueprint preview from completed customer evidence. Return only JSON. Keep the user's own words primary. Never invent quotes. Separate exact user language from your interpretation. Keep the tone perceptive, practical, visual, and concise. Avoid therapy, coaching, spirituality, diagnosis, personality typing, or abstract philosophy. Suggested creative-brief values should be pragmatic calibration defaults for the downstream visual system, not a replacement for raw evidence.",
        },
        {
          role: "user",
          content: `Build a Brand Blueprint preview from this evidence.\n\nQuick context:\n${JSON.stringify(source.journey)}\n\nConversation transcript:\n${transcript}\n\nRequirements:\n- yourWords: 3 to 5 exact phrases copied from the user's answers only.\n- miraSees: one concise interpretation.\n- signaturePatterns: exactly 3 evidence-backed patterns.\n- definingTensions: 0 to 2 tensions only when supported.\n- brandWorld: atmosphere, colour, light, materials, environmentArchitecture, styling, movement, composition.\n- presence: expression, bodyLanguage, movement, relationshipToCamera.\n- creativeRules: belongs and avoid arrays.\n- suggestedCreativeBrief: warmth, structure, expression from 0 to 100; texture, colorAttraction, typography, imageryWorld using existing V4 choice labels.\n\nValid choice labels:\n- texture: Polished, Tactile, Organic, Architectural\n- colorAttraction: Earthy, Luminous, Monochrome, Saturated\n- typography: Editorial serif, Quiet sans, Expressive display, Humanist\n- imageryWorld: Portrait-led, Objects and detail, Atmospheric spaces, Abstract and symbolic`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mira_v4_brand_blueprint_preview",
          strict: true,
          schema: {
            type: "object",
            properties: {
              yourWords: { type: "array", minItems: 3, maxItems: 5, items: { type: "string", minLength: 1, maxLength: 280 } },
              miraSees: { type: "string", minLength: 1, maxLength: 400 },
              signaturePatterns: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 240 } },
              definingTensions: { type: "array", minItems: 0, maxItems: 2, items: { type: "string", minLength: 1, maxLength: 120 } },
              brandWorld: {
                type: "object",
                properties: {
                  atmosphere: { type: "string", minLength: 1, maxLength: 240 },
                  colour: { type: "string", minLength: 1, maxLength: 240 },
                  light: { type: "string", minLength: 1, maxLength: 240 },
                  materials: { type: "string", minLength: 1, maxLength: 240 },
                  environmentArchitecture: { type: "string", minLength: 1, maxLength: 240 },
                  styling: { type: "string", minLength: 1, maxLength: 240 },
                  movement: { type: "string", minLength: 1, maxLength: 240 },
                  composition: { type: "string", minLength: 1, maxLength: 240 }
                },
                required: ["atmosphere", "colour", "light", "materials", "environmentArchitecture", "styling", "movement", "composition"],
                additionalProperties: false
              },
              presence: {
                type: "object",
                properties: {
                  expression: { type: "string", minLength: 1, maxLength: 240 },
                  bodyLanguage: { type: "string", minLength: 1, maxLength: 240 },
                  movement: { type: "string", minLength: 1, maxLength: 240 },
                  relationshipToCamera: { type: "string", minLength: 1, maxLength: 240 }
                },
                required: ["expression", "bodyLanguage", "movement", "relationshipToCamera"],
                additionalProperties: false
              },
              creativeRules: {
                type: "object",
                properties: {
                  belongs: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", minLength: 1, maxLength: 160 } },
                  avoid: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", minLength: 1, maxLength: 160 } }
                },
                required: ["belongs", "avoid"],
                additionalProperties: false
              },
              suggestedCreativeBrief: {
                type: "object",
                properties: {
                  warmth: { type: "number", minimum: 0, maximum: 100 },
                  structure: { type: "number", minimum: 0, maximum: 100 },
                  expression: { type: "number", minimum: 0, maximum: 100 },
                  texture: { type: "string", enum: ["Polished", "Tactile", "Organic", "Architectural"] },
                  colorAttraction: { type: "string", enum: ["Earthy", "Luminous", "Monochrome", "Saturated"] },
                  typography: { type: "string", enum: ["Editorial serif", "Quiet sans", "Expressive display", "Humanist"] },
                  imageryWorld: { type: "string", enum: ["Portrait-led", "Objects and detail", "Atmospheric spaces", "Abstract and symbolic"] }
                },
                required: ["warmth", "structure", "expression", "texture", "colorAttraction", "typography", "imageryWorld"],
                additionalProperties: false
              }
            },
            required: ["yourWords", "miraSees", "signaturePatterns", "definingTensions", "brandWorld", "presence", "creativeRules", "suggestedCreativeBrief"],
            additionalProperties: false
          }
        }
      }
    });

    const raw = result.choices?.[0]?.message?.content;
    const content = typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? raw
            .flatMap(part =>
              typeof part === "object" && part && "text" in part && typeof part.text === "string"
                ? [part.text]
                : [],
            )
            .join("")
            .trim()
        : "";
    if (!content) return fallback;

    const parsed = JSON.parse(content) as unknown;
    if (!isPreview(parsed)) return fallback;

    const preview = parsed as MiraV4BrandBlueprintPreview;
    const sanitizedWords = preview.yourWords
      .filter(word => answers.some(answer => answer.includes(word)))
      .slice(0, 5);

    return {
      ...preview,
      yourWords: sanitizedWords.length >= 3 ? sanitizedWords : fallback.yourWords,
      suggestedCreativeBrief: {
        ...preview.suggestedCreativeBrief,
        warmth: clamp(preview.suggestedCreativeBrief.warmth),
        structure: clamp(preview.suggestedCreativeBrief.structure),
        expression: clamp(preview.suggestedCreativeBrief.expression),
      },
    };
  } catch (error) {
    console.error("Mira V4 Brand Blueprint preview fallback", error);
    return fallback;
  }
}