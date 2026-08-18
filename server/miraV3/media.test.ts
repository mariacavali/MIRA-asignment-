import { describe, expect, it } from "vitest";
import { buildPrivateReferenceStorageKey, canAcceptReferenceImage, decodeAndValidateReferenceImage, latestConsentStatus, MIRA_V3_MAX_IMAGE_BYTES } from "./media";

describe("Mira V3 private media boundary", () => {
  it("accepts supported images only when the declared MIME matches the bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    expect(decodeAndValidateReferenceImage({ journeyId: 1, originalName: "reference.png", mimeType: "image/png", base64: png.toString("base64") })).toEqual(png);
    expect(() => decodeAndValidateReferenceImage({ journeyId: 1, originalName: "spoof.png", mimeType: "image/png", base64: Buffer.from("not an image").toString("base64") })).toThrow(/does not match/);
  });

  it("rejects decoded content larger than the private image limit", () => {
    const oversized = Buffer.alloc(MIRA_V3_MAX_IMAGE_BYTES + 1);
    oversized.set([0xff, 0xd8, 0xff]);
    expect(() => decodeAndValidateReferenceImage({ journeyId: 1, originalName: "large.jpg", mimeType: "image/jpeg", base64: oversized.toString("base64") })).toThrow(/8 MB/);
  });

  it("resolves consent independently by scope from the newest record", () => {
    const status = latestConsentStatus([
      { scope: "image_upload", status: "granted", createdAt: new Date("2026-01-01") },
      { scope: "image_analysis", status: "granted", createdAt: new Date("2026-01-02") },
      { scope: "image_upload", status: "revoked", createdAt: new Date("2026-01-03") },
    ]);
    expect(status).toEqual({ image_upload: "revoked", image_analysis: "granted" });
  });

  it("enforces the six-image limit deterministically", () => {
    expect(canAcceptReferenceImage(0)).toBe(true);
    expect(canAcceptReferenceImage(5)).toBe(true);
    expect(canAcceptReferenceImage(6)).toBe(false);
    expect(canAcceptReferenceImage(-1)).toBe(false);
  });

  it("builds only the private owner-and-journey storage prefix", () => {
    expect(buildPrivateReferenceStorageKey({ userId: 42, journeyId: 9, assetId: "asset-id", mimeType: "image/png" }))
      .toBe("mira-v3/42/9/references/asset-id.png");
  });
});
