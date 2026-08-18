/**
 * Image generation helper using internal ImageService
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { createHash } from "node:crypto";
import { storageGetSignedUrl, storagePut } from "server/storage";
import { ENV } from "./env";

// Default model for generated sites. "MODEL_GPT_IMAGE_2" is the forge images.v1
// enum for GPT Image 2 (id: gpt-image-2). If omitted, forge falls back to Gemini 2.5 Flash.
const DEFAULT_IMAGE_MODEL = "MODEL_GPT_IMAGE_2";
const DEFAULT_IMAGE_QUALITY = "medium";

function shouldUseLocalVisualPlaceholders() {
  return process.env.NODE_ENV === "development" && process.env.DEV_LOCAL_VISUAL_PLACEHOLDERS === "true";
}

function sanitizeFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "placeholder";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractPlaceholderLabel(prompt: string) {
  const directMatches = [
    prompt.match(/^(?:DIRECTION|SELECTED DIRECTION|REFINED EXPLORATION|SHOT \d+):\s*(.+)$/im)?.[1],
    prompt.match(/(?:LOCAL TEST PLACEHOLDER|LOCAL TEST PLACEHOLDERS)\s*[·:\-]\s*(.+)$/i)?.[1],
  ];
  return directMatches.find((value): value is string => Boolean(value)) ?? "LOCAL TEST PLACEHOLDER";
}

async function createLocalPlaceholderImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  const label = extractPlaceholderLabel(options.prompt);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      prompt: options.prompt,
      originalImages: options.originalImages ?? [],
      model: options.model ?? DEFAULT_IMAGE_MODEL,
      quality: options.quality ?? DEFAULT_IMAGE_QUALITY,
    }))
    .digest("hex");

  const primary = `#${fingerprint.slice(0, 6)}`;
  const secondary = `#${fingerprint.slice(6, 12)}`;
  const accent = `#${fingerprint.slice(12, 18)}`;
  const title = "LOCAL TEST PLACEHOLDER";
  const subtitle = label === title ? "Visual Direction reference" : label;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500" role="img" aria-labelledby="title desc">
      <title>${title}</title>
      <desc>Development-only placeholder image for local testing</desc>
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${primary}" />
          <stop offset="55%" stop-color="${secondary}" />
          <stop offset="100%" stop-color="${accent}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="1500" fill="url(#bg)" />
      <rect x="72" y="72" width="1056" height="1356" rx="44" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.36)" stroke-width="2" />
      <text x="600" y="220" text-anchor="middle" fill="#ffffff" font-size="44" font-family="Inter, Arial, sans-serif" letter-spacing="0.28em">LOCAL TEST PLACEHOLDER</text>
      <text x="600" y="370" text-anchor="middle" fill="#ffffff" font-size="72" font-family="Georgia, serif" font-weight="700">${escapeXml(label)}</text>
      <text x="600" y="470" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="32" font-family="Inter, Arial, sans-serif">${escapeXml(subtitle)}</text>
      <line x1="180" y1="540" x2="1020" y2="540" stroke="rgba(255,255,255,0.35)" stroke-width="2" />
      <text x="120" y="670" fill="#ffffff" font-size="28" font-family="Inter, Arial, sans-serif" letter-spacing="0.18em">STAGE</text>
      <text x="120" y="732" fill="#ffffff" font-size="54" font-family="Georgia, serif" font-weight="700">${escapeXml(options.model ?? DEFAULT_IMAGE_MODEL)}</text>
      <text x="120" y="815" fill="rgba(255,255,255,0.92)" font-size="30" font-family="Inter, Arial, sans-serif">${escapeXml(options.quality ?? DEFAULT_IMAGE_QUALITY)}</text>
      <text x="120" y="920" fill="rgba(255,255,255,0.88)" font-size="26" font-family="Inter, Arial, sans-serif">This asset is generated locally for testing only.</text>
      <text x="120" y="970" fill="rgba(255,255,255,0.88)" font-size="26" font-family="Inter, Arial, sans-serif">It preserves the same storage-backed URL shape as the real flow.</text>
      <text x="120" y="1080" fill="#ffffff" font-size="24" font-family="Inter, Arial, sans-serif" letter-spacing="0.12em">PROMPT HASH</text>
      <text x="120" y="1136" fill="#ffffff" font-size="30" font-family="Menlo, Monaco, monospace">${fingerprint.slice(0, 24)}</text>
      <text x="120" y="1290" fill="rgba(255,255,255,0.92)" font-size="22" font-family="Inter, Arial, sans-serif">LOCAL TEST PLACEHOLDER</text>
    </svg>
  `.trim();

  const { url } = await storagePut(
    `generated/local-placeholder-${sanitizeFileSegment(label)}-${fingerprint.slice(0, 12)}.svg`,
    svg,
    "image/svg+xml",
  );

  return { url };
}

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  /** Forge image model enum, e.g. "MODEL_GPT_IMAGE_2". Defaults to GPT Image 2. */
  model?: string;
  /** Generation quality, e.g. "medium" | "high". Defaults to "medium" for GPT Image 2. */
  quality?: string;
};

export type GenerateImageResponse = {
  url?: string;
};

/**
 * Image editors accept only absolute HTTP(S) source URLs. Generated images are
 * persisted as same-origin `/manus-storage/` paths, so convert those internal
 * references to short-lived signed URLs before handing them back to a provider.
 */
export async function resolveImageInputUrl(imageUrl: string): Promise<string> {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return imageUrl;
  } catch {
    if (imageUrl.startsWith("/manus-storage/")) {
      return storageGetSignedUrl(imageUrl.slice("/manus-storage/".length));
    }
  }

  throw new Error("Image input must be an absolute HTTP(S) URL or a /manus-storage path");
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (shouldUseLocalVisualPlaceholders()) {
    return createLocalPlaceholderImage(options);
  }

  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  // Build the full URL by appending the service path to the base URL
  const baseUrl = ENV.forgeApiUrl.endsWith("/")
    ? ENV.forgeApiUrl
    : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/GenerateImage",
    baseUrl
  ).toString();

  const model = options.model ?? DEFAULT_IMAGE_MODEL;
  const quality =
    options.quality ?? (model === DEFAULT_IMAGE_MODEL ? DEFAULT_IMAGE_QUALITY : undefined);

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({
      prompt: options.prompt,
      original_images: options.originalImages || [],
      model,
      ...(quality ? { quality } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    image: {
      b64Json: string;
      mimeType: string;
    };
  };
  const base64Data = result.image.b64Json;
  const buffer = Buffer.from(base64Data, "base64");

  // Save to S3
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    result.image.mimeType
  );
  return {
    url,
  };
}

export type ImageModelInfo = {
  /** Forge model enum, e.g. "MODEL_GPT_IMAGE_2". Pass into generateImage({ model }). */
  model?: string;
  /** Stable model id, e.g. "gpt-image-2". */
  id?: string;
};

export type ListImageModelsResponse = {
  models: ImageModelInfo[];
};

/**
 * List the image models the internal ImageService currently supports.
 * Feed a returned `model` value into generateImage({ model }).
 */
export async function listImageModels(): Promise<ListImageModelsResponse> {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  const baseUrl = ENV.forgeApiUrl.endsWith("/")
    ? ENV.forgeApiUrl
    : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/ListModels",
    baseUrl
  ).toString();

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: "{}",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `List image models failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as { models?: ImageModelInfo[] };
  return { models: result.models ?? [] };
}
