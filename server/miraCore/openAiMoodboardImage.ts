import { ENV } from "../_core/env";
import { fetchWithBackoff } from "../_core/llm";
import { storagePut } from "../storage";

// Matches the model id this OpenAI account already has access to (the same
// underlying model Forge's "MODEL_GPT_IMAGE_2" enum maps to).
const MIRA_CORE_OPENAI_IMAGE_MODEL = "gpt-image-2";

export type GenerateMoodboardImageResult = { url?: string };

/**
 * Generates one moodboard reference image directly via OpenAI's Images API,
 * using the existing OPENAI_API_KEY (no Forge dependency). Scoped
 * deliberately to the MIRA Core moodboard's simple prompt-only generation -
 * it does not attempt to replicate the broader V4 image pipeline's
 * edit-with-original-images behavior, which stays on its existing path.
 */
export async function generateMoodboardImageViaOpenAI(params: {
  prompt: string;
  quality?: "low" | "medium" | "high";
}): Promise<GenerateMoodboardImageResult> {
  if (!ENV.embeddingApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetchWithBackoff("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.embeddingApiKey}`,
    },
    body: JSON.stringify({
      model: MIRA_CORE_OPENAI_IMAGE_MODEL,
      prompt: params.prompt,
      quality: params.quality ?? "medium",
      n: 1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI image generation failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  const result = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const image = result.data?.[0];
  if (!image) throw new Error("OpenAI image generation returned no image");
  if (image.url) return { url: image.url };
  if (image.b64_json) {
    const buffer = Buffer.from(image.b64_json, "base64");
    const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, "image/png");
    return { url };
  }
  throw new Error("OpenAI image generation returned neither a URL nor base64 data");
}
