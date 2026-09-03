import { createHash } from "node:crypto";
import { invokeLLM, type MessageContent } from "../_core/llm";
import {
  MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
  miraV4CreativeDnaJsonSchema,
  miraV4CreativeDnaSchema,
  type MiraV4CreativeDna,
} from "../../shared/miraV4CreativeDna";

export const MIRA_V4_CREATIVE_DNA_MODEL = "gpt-5-mini";

export type MiraV4CreativeDnaSource = {
  journey: {
    building: string | null;
    currentPosition: string | null;
    needMost: string | null;
    firstCreation: string | null;
    birthDate: string | null;
    birthTime: string | null;
    birthTimeUnknown: number;
    birthCity: string | null;
    creativeInputs: Record<string, unknown> | null;
  };
  conversation: Array<{
    phase: "recognition" | "creative_discovery";
    role: "assistant" | "user";
    content: string;
  }>;
  inspiration: {
    imageReference: string | null;
    userExplanation: string | null;
    influenceRule: "supporting_evidence_only";
  };
};

export class MiraV4CreativeDnaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiraV4CreativeDnaValidationError";
  }
}

type JsonSchemaRecord = Record<string, unknown>;

function isJsonSchemaRecord(value: unknown): value is JsonSchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Azure's strict structured-output endpoint requires an explicit `type` on
// nullable fields. Zod draft-7 emits the equivalent `anyOf` form, so normalize
// only that narrow nullable-union pattern while leaving the authoritative
// validation schema itself unchanged.
function normalizeAzureNullableSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeAzureNullableSchema);
  }

  if (!isJsonSchemaRecord(value)) {
    return value;
  }

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeAzureNullableSchema(entry)]),
  );
  const anyOf = normalized.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) {
    return normalized;
  }

  const nullSchema = anyOf.find(
    option => isJsonSchemaRecord(option) && option.type === "null",
  );
  const valueSchema = anyOf.find(
    option =>
      isJsonSchemaRecord(option) &&
      typeof option.type === "string" &&
      option.type !== "null",
  );
  if (!nullSchema || !valueSchema || typeof valueSchema.type !== "string") {
    return normalized;
  }

  const { anyOf: _nullableUnion, ...outerSchema } = normalized;
  const { type: valueType, ...valueConstraints } = valueSchema;
  return {
    ...outerSchema,
    ...valueConstraints,
    type: [valueType, "null"],
  };
}

function extractStructuredResponseText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content.trim() || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .flatMap(part => {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return [part.text];
      }
      return [];
    })
    .join("")
    .trim();

  return text || undefined;
}

export function fingerprintMiraV4CreativeDnaSource(source: MiraV4CreativeDnaSource) {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export async function synthesizeMiraV4CreativeDna(params: {
  source: MiraV4CreativeDnaSource;
  inspirationImageUrl?: string;
}) {
  const sourceText = `Synthesize one Creative DNA object from this authoritative evidence:\n${JSON.stringify(params.source)}`;
  const userContent: MessageContent | MessageContent[] = params.inspirationImageUrl
    ? [
        { type: "text", text: sourceText },
        { type: "image_url", image_url: { url: params.inspirationImageUrl, detail: "low" } },
      ]
    : sourceText;
  const { $schema: _schemaDeclaration, ...openAiSchema } = miraV4CreativeDnaJsonSchema as Record<string, unknown>;
  const azureCompatibleSchema = normalizeAzureNullableSchema(openAiSchema) as Record<string, unknown>;

  const result = await invokeLLM({
    model: MIRA_V4_CREATIVE_DNA_MODEL,
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are Mira synthesizing one internal Creative DNA object from a completed private journey. Return only JSON matching the supplied schema. Use concise facts, relationships, practical direction, visual tokens, and short summaries rather than essays or customer-facing copy. Produce one coherent direction, never multiple concepts.

Apply this evidence precedence: direct user answers; consistent recognition and creative-discovery evidence; practical Creative Brief selections; the user's inspiration explanation; then the inspiration image as supporting evidence only. Do not copy or let an inspiration image define the result. Do not invent contradictory detail. Use empty arrays where evidence is weak and null only where the schema permits it. Preserve the authoritative inspiration reference, explanation, and influence rule exactly. The schemaVersion must be ${MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION}. Do not generate a Brand World, Brand Book, image prompt, image, PDF, or surrounding explanation.`,
      },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mira_v4_creative_dna",
        strict: true,
        schema: azureCompatibleSchema,
      },
    },
    // Calls OpenAI directly with the existing OPENAI_API_KEY, which already
    // has access to this model, rather than the Forge gateway.
    provider: "openai",
  });

  const choice = result.choices?.[0];
  const responseContent = choice?.message?.content;
  const content = extractStructuredResponseText(responseContent);
  if (!content) {
    const contentShape = Array.isArray(responseContent) ? "array" : typeof responseContent;
    const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
    const messageFields =
      choice?.message && typeof choice.message === "object"
        ? Object.keys(choice.message).sort().join(",")
        : "none";
    throw new MiraV4CreativeDnaValidationError(
      `The synthesis response did not contain JSON (finish_reason=${finishReason}; content=${contentShape}; message_fields=${messageFields})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new MiraV4CreativeDnaValidationError("The synthesis response was not valid JSON");
  }

  const validated = miraV4CreativeDnaSchema.safeParse(parsed);
  if (!validated.success) {
    throw new MiraV4CreativeDnaValidationError("The synthesis response did not match the Creative DNA contract");
  }

  const creativeDna: MiraV4CreativeDna = miraV4CreativeDnaSchema.parse({
    ...validated.data,
    inspiration: params.source.inspiration,
  });

  return {
    creativeDna,
    model: result.model || MIRA_V4_CREATIVE_DNA_MODEL,
    usage: result.usage ?? null,
  };
}
