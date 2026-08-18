import { z } from "zod";

export const MIRA_V3_MEDIA_POLICY_VERSION = "2026-07-11";
export const MIRA_V3_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MIRA_V3_MAX_IMAGE_COUNT = 6;
export const MIRA_V3_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MiraV3ConsentScope = "image_upload" | "image_analysis";

export const mediaUploadInputSchema = z.object({
  journeyId: z.number().int().positive(),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(MIRA_V3_IMAGE_MIME_TYPES),
  base64: z.string().min(4).max(Math.ceil(MIRA_V3_MAX_IMAGE_BYTES * 4 / 3) + 8),
});

function hasValidSignature(bytes: Buffer, mimeType: typeof MIRA_V3_IMAGE_MIME_TYPES[number]) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export function decodeAndValidateReferenceImage(input: z.infer<typeof mediaUploadInputSchema>) {
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > MIRA_V3_MAX_IMAGE_BYTES) {
    throw new Error("Reference image must be between 1 byte and 8 MB");
  }
  if (!hasValidSignature(bytes, input.mimeType)) {
    throw new Error("Reference image content does not match its declared file type");
  }
  return bytes;
}

export function canAcceptReferenceImage(currentCount: number) {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < MIRA_V3_MAX_IMAGE_COUNT;
}

export function buildPrivateReferenceStorageKey(params: {
  userId: number;
  journeyId: number;
  assetId: string;
  mimeType: typeof MIRA_V3_IMAGE_MIME_TYPES[number];
}) {
  const extension = params.mimeType === "image/jpeg" ? "jpg" : params.mimeType === "image/png" ? "png" : "webp";
  return `mira-v3/${params.userId}/${params.journeyId}/references/${params.assetId}.${extension}`;
}

export function latestConsentStatus(
  rows: Array<{ scope: MiraV3ConsentScope; status: "granted" | "revoked"; createdAt: Date }>,
) {
  const status: Record<MiraV3ConsentScope, "granted" | "revoked" | "missing"> = {
    image_upload: "missing",
    image_analysis: "missing",
  };
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (status[row.scope] === "missing") status[row.scope] = row.status;
  }
  return status;
}
