import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { rm } from "node:fs/promises";

// storage.ts computes storage decisions from ENV read at call time (not at
// module load), so mocking the module lets each test vary
// isProduction/forge/the local-storage opt-in independently.
const mocks = vi.hoisted(() => ({
  env: {
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "",
    allowLocalStorageInProduction: false,
  },
}));

vi.mock("./_core/env", () => ({ ENV: mocks.env }));

import { LOCAL_STORAGE_ROOT, storageGetSignedUrl, storagePut } from "./storage";

const testKeyPrefix = "test-storage-flag-fixtures";

beforeEach(() => {
  mocks.env.isProduction = false;
  mocks.env.forgeApiUrl = "";
  mocks.env.forgeApiKey = "";
  mocks.env.allowLocalStorageInProduction = false;
  vi.unstubAllGlobals();
});

afterEach(async () => {
  await rm(join(LOCAL_STORAGE_ROOT, testKeyPrefix), { recursive: true, force: true });
});

describe("MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION opt-in (storage.ts)", () => {
  it("prefers Forge when fully configured, even with the opt-in flag enabled", async () => {
    mocks.env.isProduction = true;
    mocks.env.forgeApiUrl = "https://forge.example";
    mocks.env.forgeApiKey = "forge-key";
    mocks.env.allowLocalStorageInProduction = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://s3.example/presigned-put" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await storagePut(`${testKeyPrefix}/forge-preferred.txt`, "hello", "text/plain");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("v1/storage/presign/put");
  });

  it("production + Forge missing + flag disabled fails closed", async () => {
    mocks.env.isProduction = true;
    await expect(storageGetSignedUrl(`${testKeyPrefix}/whatever.png`)).rejects.toThrow("Storage config missing");
  });

  it("production + Forge missing + flag enabled resolves an existing local asset (reference signed/data URL path)", async () => {
    const { key } = await storagePut(`${testKeyPrefix}/existing-asset.png`, Buffer.from([137, 80, 78, 71]), "image/png");

    mocks.env.isProduction = true;
    mocks.env.allowLocalStorageInProduction = true;
    const url = await storageGetSignedUrl(key);

    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("development behaviour is unchanged (Forge absent, flag never consulted)", async () => {
    const { url } = await storagePut(`${testKeyPrefix}/dev-write.txt`, "dev content", "text/plain");
    expect(url).toMatch(/^\/manus-storage\//);
  });

  it("rejects a traversal key even when the production opt-in is enabled", async () => {
    mocks.env.isProduction = true;
    mocks.env.allowLocalStorageInProduction = true;
    await expect(storageGetSignedUrl("../../etc/passwd")).rejects.toThrow("Invalid local storage key");
  });
});
