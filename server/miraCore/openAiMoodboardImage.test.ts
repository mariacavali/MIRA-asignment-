import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fully mocked: no real network call and no dependency on the ambient
// OPENAI_API_KEY (env.ts computes ENV once at module load, so mutating
// process.env in a test would have no effect on an already-imported ENV).
vi.mock("../_core/env", () => ({ ENV: { embeddingApiKey: "test-key" } }));
vi.mock("../storage", () => ({ storagePut: vi.fn() }));

import { generateMoodboardImageViaOpenAI } from "./openAiMoodboardImage";

describe("generateMoodboardImageViaOpenAI retry/backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a transient failure once and succeeds without ever calling the real OpenAI API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://images.example/rendered.png" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = generateMoodboardImageViaOpenAI({ prompt: "a quiet studio portrait" });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ url: "https://images.example/rendered.png" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/images/generations");
  });

  it("exhausts retries and surfaces the final failure instead of hanging or fabricating a result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("still failing", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = generateMoodboardImageViaOpenAI({ prompt: "a quiet studio portrait" });
    const assertion = expect(promise).rejects.toThrow(/OpenAI image generation failed/);
    await vi.runAllTimersAsync();
    await assertion;

    // RETRY_MAX_RETRIES = 4 in server/_core/llm.ts -> 1 initial attempt + 4 retries = 5 calls.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("never calls fetch at all when the OpenAI key isn't configured", async () => {
    vi.doMock("../_core/env", () => ({ ENV: { embeddingApiKey: "" } }));
    vi.resetModules();
    const { generateMoodboardImageViaOpenAI: generateWithoutKey } = await import("./openAiMoodboardImage");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateWithoutKey({ prompt: "a quiet studio portrait" }))
      .rejects.toThrow("OPENAI_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.doUnmock("../_core/env");
    vi.resetModules();
  });
});
