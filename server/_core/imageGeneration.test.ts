import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("server/storage", () => storageMocks);

import { generateImage, resolveImageInputUrl } from "./imageGeneration";

const originalNodeEnv = process.env.NODE_ENV;
const originalDevVisualPlaceholders = process.env.DEV_LOCAL_VISUAL_PLACEHOLDERS;

describe("resolveImageInputUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDevVisualPlaceholders === undefined) {
      delete process.env.DEV_LOCAL_VISUAL_PLACEHOLDERS;
    } else {
      process.env.DEV_LOCAL_VISUAL_PLACEHOLDERS = originalDevVisualPlaceholders;
    }
  });

  it("keeps existing HTTPS image inputs unchanged", async () => {
    await expect(resolveImageInputUrl("https://images.example/source.png?signature=private"))
      .resolves.toBe("https://images.example/source.png?signature=private");
    expect(storageMocks.storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("converts generated Manus storage paths into signed HTTPS edit inputs", async () => {
    storageMocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/generated/reference.png?signature=private");

    await expect(resolveImageInputUrl("/manus-storage/generated/reference.png"))
      .resolves.toBe("https://storage.example/generated/reference.png?signature=private");
    expect(storageMocks.storageGetSignedUrl).toHaveBeenCalledWith("generated/reference.png");
  });

  it("rejects non-HTTP image inputs that are not managed storage paths", async () => {
    await expect(resolveImageInputUrl("file:///private/reference.png"))
      .rejects.toThrow("Image input must be an absolute HTTP(S) URL or a /manus-storage path");
  });

  it("returns a deterministic local placeholder image in development without calling the provider", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_LOCAL_VISUAL_PLACEHOLDERS = "true";
    storageMocks.storagePut.mockResolvedValue({ key: "generated/local-placeholder-test.svg", url: "/manus-storage/generated/local-placeholder-test.svg" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({ prompt: "DIRECTION: material intimacy", model: "MODEL_GPT_IMAGE_2", quality: "medium" }))
      .resolves.toEqual({ url: "/manus-storage/generated/local-placeholder-test.svg" });

    expect(storageMocks.storagePut).toHaveBeenCalledTimes(1);
    const [key, svg, contentType] = storageMocks.storagePut.mock.calls[0] ?? [];
    expect(String(key)).toContain("generated/local-placeholder");
    expect(String(svg)).toContain("LOCAL TEST PLACEHOLDER");
    expect(String(svg)).toContain("material intimacy");
    expect(contentType).toBe("image/svg+xml");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
