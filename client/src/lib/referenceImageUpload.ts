export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
export type ReferenceImageMimeType = "image/jpeg" | "image/png" | "image/webp";
type ImageFile = { name: string; type: string; size: number };

export const REFERENCE_PURPOSE_OPTIONS = [
  { value: "location", label: "Shoot location" },
  { value: "wardrobe", label: "Clothes I may wear" },
  { value: "portrait", label: "A photo of me" },
  { value: "current_identity", label: "My current brand" },
  { value: "like", label: "Inspiration I like" },
  { value: "dislike", label: "Something to avoid" },
  { value: "direction_to_explore", label: "A direction to explore" },
  { value: "other", label: "Other context" },
] as const;
export type ReferencePurposeValue =
  (typeof REFERENCE_PURPOSE_OPTIONS)[number]["value"];
export const REFERENCE_FOCUS_OPTIONS = [
  "Lighting",
  "Colours",
  "Mood",
  "Pose",
  "Clothing",
  "Composition",
  "Location",
] as const;
export type ReferenceFocus = (typeof REFERENCE_FOCUS_OPTIONS)[number];

// Keep wardrobe contextual without changing the database enum.
export function storedReferencePurpose(purpose: ReferencePurposeValue) {
  return purpose === "wardrobe" ? ("other" as const) : purpose;
}
export function referenceCategory(purpose: string | null, note: string | null) {
  return purpose === "other" && note?.startsWith("My outfit for this shoot.")
    ? "wardrobe"
    : purpose;
}

// Save the client's explicit choices in the existing description field. The
// purpose remains separate, preserving preference versus contextual evidence.
export function buildReferenceDescription(
  purpose: ReferencePurposeValue,
  focuses: ReferenceFocus[],
  note: string
): string {
  if (!focuses.length) {
    const context: Record<ReferencePurposeValue, string> = {
      like: "Inspiration I like. No specific feature selected; ask what appeals before treating details as preferences.",
      dislike:
        "Something I want to avoid. Ask which aspects before interpreting this reference.",
      current_identity:
        "This shows my current brand. This is context, not a request to copy it.",
      portrait:
        "This is a photo of me. This is context, not a style preference.",
      location: "This is my shoot location. Work with this actual space.",
      wardrobe:
        "My outfit for this shoot. Work with these clothes; do not assume I will buy a new outfit.",
      direction_to_explore:
        "A direction I want to explore. Ask what interests me before assuming a specific preference.",
      other: "Additional context for my shoot. Ask how to use it if unclear.",
    };
    return context[purpose] + (note.trim() ? ` My note: ${note.trim()}` : "");
  }
  const detail = focuses.join(", ");
  const statements: Record<ReferencePurposeValue, string> = {
    like: `What I like in this image: ${detail}. Use these aspects as inspiration.`,
    dislike: `What I want to avoid in this image: ${detail}.`,
    current_identity: `This shows my current brand. Notice: ${detail}. This is context, not a request to copy it.`,
    direction_to_explore: `A direction I want to explore. Focus on: ${detail}.`,
    portrait: `This is a photo of me. Notice: ${detail}. This is context, not a style preference.`,
    location: `This is my shoot location. Notice: ${detail}. This is context, not a style preference.`,
    wardrobe: `My outfit for this shoot. Notice: ${detail}. Work with these clothes; do not assume I will buy a new outfit.`,
    other: `Additional context for my shoot. Notice: ${detail}.`,
  };
  return statements[purpose] + (note.trim() ? ` My note: ${note.trim()}` : "");
}

export function referenceImageMimeType(
  file: ImageFile
): ReferenceImageMimeType | null {
  if (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp"
  )
    return file.type;
  // Some file pickers omit MIME metadata. The server still verifies the bytes.
  if (!file.type) {
    if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
    if (/\.png$/i.test(file.name)) return "image/png";
    if (/\.webp$/i.test(file.name)) return "image/webp";
  }
  return null;
}

export function referenceImageFileError(file: ImageFile): string | null {
  if (!referenceImageMimeType(file))
    return "Choose a JPG, PNG or WebP image. For an iPhone HEIC photo, export it as JPG first.";
  if (file.size === 0)
    return "This file is empty. Please choose another image.";
  if (file.size > MAX_REFERENCE_IMAGE_BYTES)
    return "This image is larger than 8 MB. Please choose a smaller image.";
  return null;
}

export function referenceUploadErrorMessage(error: unknown): string {
  const failure = error as {
    data?: { code?: string };
    message?: string;
  } | null;
  if (failure?.data?.code === "INTERNAL_SERVER_ERROR") {
    return "Image storage is unavailable. Please contact your photographer if this continues.";
  }
  if (
    failure?.data?.code === "NOT_FOUND" ||
    failure?.data?.code === "FORBIDDEN" ||
    failure?.data?.code === "UNAUTHORIZED"
  ) {
    return "This Shoot Room cannot accept the image. Please reopen your invitation link or contact your photographer.";
  }
  if (failure?.data?.code === "BAD_REQUEST") {
    if (/^A shoot can (include|contain)/.test(failure.message ?? ""))
      return "This shoot has reached its reference limit. Remove an existing reference before adding another.";
    return "This file could not be accepted. Choose a valid JPG, PNG or WebP up to 8 MB and complete both fields.";
  }
  return "We couldn't confirm the upload. Check your connection and refresh your references before trying again.";
}
