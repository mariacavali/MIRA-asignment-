import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  appendMiraV3ReflectionTurn: vi.fn(),
  confirmMiraV3MirrorRevision: vi.fn(),
  createMiraV3Journey: vi.fn(),
  createMiraV3MediaAsset: vi.fn(),
  createMiraV3MirrorDraft: vi.fn(),
  createMiraV3MirrorEdit: vi.fn(),
  getLatestMiraV3ModuleOutput: vi.fn(),
  getMiraV3ConsentState: vi.fn(),
  getMiraV3JourneyState: vi.fn(),
  getMiraV3MediaAssetForAnalysis: vi.fn(),
  getOwnedMiraV3Journey: vi.fn(),
  listMiraV3Journeys: vi.fn(),
  listMiraV3MediaAssets: vi.fn(),
  recordMiraV3Consent: vi.fn(),
  removeMiraV3MediaAsset: vi.fn(),
  saveMiraV3MediaAnalysis: vi.fn(),
  saveMiraV3ModuleOutput: vi.fn(),
  saveMiraV3RenderArtifact: vi.fn(),
  softDeleteMiraV3Journey: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn(), storagePut: vi.fn() }));
const imageMocks = vi.hoisted(() => ({ analyzePrivateReferenceImage: vi.fn() }));

vi.mock("./db", () => dbMocks);
vi.mock("../storage", () => storageMocks);
vi.mock("./imageAnalysis", async importOriginal => {
  const actual = await importOriginal<typeof import("./imageAnalysis")>();
  return { ...actual, analyzePrivateReferenceImage: imageMocks.analyzePrivateReferenceImage };
});

import { miraV3Router } from "./router";

const assetId = "550e8400-e29b-41d4-a716-446655440000";
const consent = { image_upload: "granted", image_analysis: "granted" } as const;

function caller() {
  return miraV3Router.createCaller({ user: { id: 7 }, req: {}, res: {} } as never);
}

describe("Mira V3 private media storage failure routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getMiraV3ConsentState.mockResolvedValue(consent);
    dbMocks.listMiraV3MediaAssets.mockResolvedValue([]);
    dbMocks.getMiraV3MediaAssetForAnalysis.mockResolvedValue({
      id: assetId,
      storageKey: `mira-v3/7/11/references/${assetId}.png`,
      mimeType: "image/png",
      status: "uploaded",
    });
    dbMocks.saveMiraV3MediaAnalysis.mockResolvedValue(true);
    dbMocks.saveMiraV3ModuleOutput.mockResolvedValue({ id: 31 });
  });

  it("fails upload deterministically without creating an orphan media record when private storage is unavailable", async () => {
    storageMocks.storagePut.mockRejectedValue(new Error("Private object storage unavailable"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

    await expect(caller().uploadReferenceImage({
      journeyId: 11,
      originalName: "reference.png",
      mimeType: "image/png",
      base64: png.toString("base64"),
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Private image storage is temporarily unavailable. No image record was created.",
    });

    expect(dbMocks.createMiraV3MediaAsset).not.toHaveBeenCalled();
    expect(dbMocks.saveMiraV3MediaAnalysis).not.toHaveBeenCalled();
    expect(dbMocks.saveMiraV3ModuleOutput).not.toHaveBeenCalled();
    expect(dbMocks.getMiraV3JourneyState).not.toHaveBeenCalled();
  });

  it("persists failed analysis state and leaves journey lifecycle untouched when a signed image URL cannot be created", async () => {
    storageMocks.storageGetSignedUrl.mockRejectedValue(new Error("Signed URL service unavailable"));

    await expect(caller().analyzeReferenceImage({ journeyId: 11, assetId })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Private image storage is temporarily unavailable. The image was not analyzed.",
    });

    expect(imageMocks.analyzePrivateReferenceImage).not.toHaveBeenCalled();
    expect(dbMocks.saveMiraV3MediaAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      journeyId: 11,
      assetId,
      status: "failed",
      analysis: expect.objectContaining({
        summary: "Private image analysis is temporarily unavailable. No visual inferences were stored.",
      }),
    }));
    expect(dbMocks.saveMiraV3ModuleOutput).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      journeyId: 11,
      moduleType: "image_reference_analysis",
      status: "failed",
      input: { assetIds: [assetId] },
      provenance: expect.objectContaining({ assetId, fallback: true, reason: "private_storage_unavailable" }),
    }));
    expect(dbMocks.appendMiraV3ReflectionTurn).not.toHaveBeenCalled();
    expect(dbMocks.confirmMiraV3MirrorRevision).not.toHaveBeenCalled();
    expect(dbMocks.createMiraV3MirrorDraft).not.toHaveBeenCalled();
    expect(dbMocks.createMiraV3MirrorEdit).not.toHaveBeenCalled();
    expect(dbMocks.softDeleteMiraV3Journey).not.toHaveBeenCalled();
  });
});
