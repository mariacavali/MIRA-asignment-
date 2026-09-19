import { describe, expect, it } from "vitest";
import {
  buildReferenceDescription,
  storedReferencePurpose,
  referenceCategory,
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_FOCUS_OPTIONS,
  REFERENCE_PURPOSE_OPTIONS,
  referenceImageFileError,
  referenceImageMimeType,
  referenceUploadErrorMessage,
} from "../../client/src/lib/referenceImageUpload";
import { shootVisualReferenceUploadSchema } from "./visualReferences";

describe("reference selection and upload feedback", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s within the server's size limit",
    type => {
      expect(
        referenceImageFileError({
          name: "reference",
          type,
          size: MAX_REFERENCE_IMAGE_BYTES,
        })
      ).toBeNull();
    }
  );
  it("recovers omitted MIME metadata without accepting a conflicting type", () => {
    expect(
      referenceImageMimeType({ name: "photo.JPG", type: "", size: 512 })
    ).toBe("image/jpeg");
    expect(
      referenceImageMimeType({
        name: "photo.JPG",
        type: "image/heic",
        size: 512,
      })
    ).toBeNull();
  });
  it("explains HEIC, empty and oversized files before upload", () => {
    expect(
      referenceImageFileError({
        name: "photo.HEIC",
        type: "image/heic",
        size: 512,
      })
    ).toContain("export it as JPG");
    expect(
      referenceImageFileError({ name: "photo.png", type: "image/png", size: 0 })
    ).toContain("empty");
    expect(
      referenceImageFileError({
        name: "photo.png",
        type: "image/png",
        size: MAX_REFERENCE_IMAGE_BYTES + 1,
      })
    ).toContain("larger than 8 MB");
  });
  it("distinguishes storage failures from invalid image input without exposing server details", () => {
    const message = referenceUploadErrorMessage({
      data: { code: "INTERNAL_SERVER_ERROR" },
      message: "private provider credentials and response",
    });
    expect(message).toContain("Image storage");
    expect(message).not.toContain("credentials");
    expect(
      referenceUploadErrorMessage({ data: { code: "BAD_REQUEST" } })
    ).toContain("valid JPG");
    expect(
      referenceUploadErrorMessage(new Error("network disconnected"))
    ).toContain("connection");
  });
});

describe("intentional reference choices", () => {
  it("allows clicks alone to produce a meaningful upload description", () => {
    expect(buildReferenceDescription("like", ["Lighting", "Colours"], "")).toBe(
      "What I like in this image: Lighting, Colours. Use these aspects as inspiration."
    );
  });
  it("allows a category alone without inventing a specific visual preference", () => {
    expect(buildReferenceDescription("like", [], "")).toContain(
      "No specific feature selected"
    );
    expect(buildReferenceDescription("wardrobe", [], "")).toContain(
      "Work with these clothes"
    );
    expect(
      referenceCategory(
        storedReferencePurpose("wardrobe"),
        buildReferenceDescription("wardrobe", [], "")
      )
    ).toBe("wardrobe");
  });
  it("preserves negative preferences and contextual images", () => {
    expect(buildReferenceDescription("dislike", ["Pose"], "")).toBe(
      "What I want to avoid in this image: Pose."
    );
    expect(buildReferenceDescription("portrait", ["Clothing"], "")).toContain(
      "This is context, not a style preference."
    );
    expect(
      buildReferenceDescription(
        "location",
        ["Lighting"],
        "The window faces north."
      )
    ).toContain("My note: The window faces north.");
  });
  it.each(REFERENCE_PURPOSE_OPTIONS)(
    "fits the existing server contract for $value without a schema change",
    ({ value }) => {
      const clientDescription = buildReferenceDescription(
        value,
        [...REFERENCE_FOCUS_OPTIONS],
        "a".repeat(500)
      );
      expect(clientDescription.length).toBeLessThanOrEqual(800);
      expect(
        shootVisualReferenceUploadSchema.safeParse({
          originalName: "reference.png",
          mimeType: "image/png",
          base64: "aGVsbG8=",
          clientDescription,
          referencePurpose: storedReferencePurpose(value),
          evidenceKind: "observed",
        }).success
      ).toBe(true);
    }
  );
});
