import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildShootReferenceStorageKey, evidenceKindForReferencePurpose, shootVisualReferenceUploadSchema, visualEvidenceMayBecomePreference } from "./visualReferences";
import { decodeAndValidateReferenceImage, MIRA_V3_MAX_IMAGE_BYTES } from "../miraV3/media";

const visualReferencesSource = readFileSync(new URL("./visualReferences.ts", import.meta.url), "utf8");

const routerSource = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
const realtimeSource = readFileSync(new URL("./realtime.ts", import.meta.url), "utf8");
const visualUploadSource = readFileSync(new URL("../../client/src/components/mira/VisualReferenceUpload.tsx", import.meta.url), "utf8");

describe("shoot visual-reference foundation", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  it("accepts only bounded MVP image types with signature validation", () => {
    const input = shootVisualReferenceUploadSchema.parse({ originalName: "brand.png", mimeType: "image/png", base64: png.toString("base64"), clientDescription: null, evidenceKind: "observed" });
    expect(decodeAndValidateReferenceImage({ journeyId: 1, ...input })).toEqual(png);
    expect(() => shootVisualReferenceUploadSchema.parse({ ...input, mimeType: "application/pdf" })).toThrow();
    expect(() => shootVisualReferenceUploadSchema.parse({ ...input, base64: "a".repeat(Math.ceil(MIRA_V3_MAX_IMAGE_BYTES * 4 / 3) + 20) })).toThrow();
  });

  it("keeps observation separate from explicit preference and confirmed direction", () => {
    expect(visualEvidenceMayBecomePreference("observed")).toBe(false);
    expect(visualEvidenceMayBecomePreference("mira_hypothesis")).toBe(false);
    expect(visualEvidenceMayBecomePreference("explicit_preference")).toBe(true);
    expect(visualEvidenceMayBecomePreference("confirmed_direction")).toBe(true);
  });

  it("uses photographer and shoot ownership in private storage keys", () => {
    expect(buildShootReferenceStorageKey({ photographerUserId: 7, shootId: 42, assetId: "asset", mimeType: "image/webp" }))
      .toBe("mira-shoots/7/42/references/asset.webp");
  });

  it("binds public uploads to the token-resolved shoot instead of accepting owner or shoot IDs", () => {
    const publicRoute = routerSource.slice(routerSource.indexOf("uploadClientVisualReference"), routerSource.indexOf("createRealtimeCall"));
    expect(publicRoute).toContain("getClientInvitation(input.token)");
    expect(publicRoute).toContain("shootId: state.shoot.id");
    expect(publicRoute).toContain("photographerUserId: state.shoot.photographerUserId");
    expect(publicRoute).not.toContain("input.shootId");
    expect(publicRoute).not.toContain("input.photographerUserId");
  });

  it("exposes a real upload control and forbids fake social-link inspection", () => {
    expect(visualUploadSource).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(visualUploadSource).toContain("MIRA cannot inspect social or website links directly");
    expect(realtimeSource).toContain("you cannot inspect a social or website URL directly");
    expect(realtimeSource).toContain("Explicit client statements outrank visual inference");
  });

  it("preserves the evidence distinction when deriving evidenceKind from the client-facing purpose", () => {
    expect(evidenceKindForReferencePurpose("like")).toBe("explicit_preference");
    expect(evidenceKindForReferencePurpose("dislike")).toBe("explicit_preference");
    expect(evidenceKindForReferencePurpose("direction_to_explore")).toBe("explicit_preference");
    expect(evidenceKindForReferencePurpose("current_identity")).toBe("observed");
    expect(evidenceKindForReferencePurpose("portrait")).toBe("observed");
    expect(evidenceKindForReferencePurpose("location")).toBe("observed");
    expect(evidenceKindForReferencePurpose("other")).toBe("observed");
  });

  it("requires the client-facing upload to ask for both a purpose and a short explanation before submitting", () => {
    const publicUploadSchema = routerSource.slice(routerSource.indexOf("uploadClientVisualReference"), routerSource.indexOf("createRealtimeCall"));
    expect(publicUploadSchema).toContain("referencePurpose: referencePurposeSchema");
    expect(publicUploadSchema).toContain("clientDescription: z.string().trim().min(1)");
    expect(visualUploadSource).toContain("canSubmit");
    expect(visualUploadSource).toContain("!purpose");
    expect(visualUploadSource).toContain("description.trim().length > 0");
  });

  it("never triggers Creative DNA or moodboard generation on upload", () => {
    expect(visualReferencesSource).not.toMatch(/creativeDnaAdapter|moodboardAdapter|generateShootCreativeDna|generateShootMoodboard/);
  });
});
