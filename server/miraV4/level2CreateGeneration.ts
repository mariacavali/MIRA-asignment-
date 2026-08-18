import type { GenerateImageOptions } from "../_core/imageGeneration";
import type { MiraLevel2CreateDirection } from "./level2Create";

export type MiraLevel2CreateFrameState = {
  id: string;
  direction: string;
  prompt: string;
  status: "pending" | "generating" | "complete" | "failed";
  url?: string;
  errorCode: string | null;
};

export function createInitialFrameStates(direction: MiraLevel2CreateDirection): MiraLevel2CreateFrameState[] {
  return direction.frames.map(frame => ({
    id: frame.id,
    direction: frame.title,
    prompt: frame.prompt,
    status: "pending",
    errorCode: null,
  }));
}

export async function generateLevel2CreateFrames(params: {
  direction: MiraLevel2CreateDirection;
  existing: MiraLevel2CreateFrameState[];
  frameIds?: string[];
  generate: (options: GenerateImageOptions) => Promise<{ url?: string }>;
  resolveReference: (url: string) => Promise<string>;
  onState: (frames: MiraLevel2CreateFrameState[]) => Promise<void>;
  inspirationImages?: Array<{ url: string; mimeType: string }>;
  personalReferenceImage?: { url: string; mimeType: string };
}) {
  const frameById = new Map(params.direction.frames.map(frame => [frame.id, frame]));
  const existingById = new Map(params.existing.map(frame => [frame.id, frame]));
  const frames = params.direction.frames.map(frame => existingById.get(frame.id) ?? createInitialFrameStates(params.direction).find(item => item.id === frame.id)!);
  const requested = new Set(params.frameIds?.length ? params.frameIds : params.direction.frames.map(frame => frame.id));
  const targets = frames
    .filter(frame => requested.has(frame.id) && frame.status !== "complete")
    .sort((a, b) => (a.id === "frame_2" ? -1 : b.id === "frame_2" ? 1 : a.id.localeCompare(b.id)));

  let identityAnchorUrl = frames.find(frame => frame.id === "frame_2" && frame.status === "complete")?.url;
  for (const target of targets) {
    target.status = "generating";
    target.errorCode = null;
    await params.onState(frames);
    try {
      const definition = frameById.get(target.id)!;
      const referenceUrl = target.id !== "frame_2" && identityAnchorUrl
        ? await params.resolveReference(identityAnchorUrl)
        : null;
      const inspirationImages = target.id === "frame_2"
        ? await Promise.all((params.inspirationImages ?? []).slice(0, 5).map(async image => ({ url: await params.resolveReference(image.url), mimeType: image.mimeType })))
        : [];
      const personalReferenceImage = target.id === "frame_2" && params.personalReferenceImage
        ? { url: await params.resolveReference(params.personalReferenceImage.url), mimeType: params.personalReferenceImage.mimeType }
        : null;
      const prompt = [
        definition.prompt,
        target.id === "frame_2"
          ? personalReferenceImage
            ? "IDENTITY ANCHOR: original image 1 is the user's personal identity reference. Use it only for recognizable visible appearance—face, hair, approximate age and physical presence. Never infer personality or sensitive traits, and do not copy its pose, expression, head angle, wardrobe or composition. Any remaining original images are inspiration references for style, mood, colour, lighting and composition only; never use people in them as the subject identity."
            : "IDENTITY ANCHOR: establish the campaign subject from the confirmed brief. Original images, when supplied, are inspiration references for style, mood, colour, lighting and composition only; never copy a person in an inspiration image as the subject identity, pose or expression."
          : "IDENTITY CONTINUITY: preserve the exact same recognizable person, face and hair plus the coordinated wardrobe language, colour grade, lighting logic and location world. Do NOT copy the anchor's facial expression, gaze, head angle, pose, body position or exact outfit configuration; follow this frame's distinct shot plan.",
      ].join("\n");
      const image = await params.generate({
        prompt,
        originalImages: referenceUrl
          ? [{ url: referenceUrl, mimeType: "image/png" }]
          : personalReferenceImage
            ? [personalReferenceImage, ...inspirationImages]
            : inspirationImages.length ? inspirationImages : undefined,
        quality: "high",
      });
      if (!image.url) throw new Error("Image generation returned no URL");
      target.url = image.url;
      target.status = "complete";
      target.errorCode = null;
      if (target.id === "frame_2") identityAnchorUrl = image.url;
    } catch {
      target.status = "failed";
      target.errorCode = "image_generation_failed";
    }
    await params.onState(frames);
  }
  return frames;
}
