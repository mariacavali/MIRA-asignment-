import { describe, expect, it, vi } from "vitest";
import { buildLevel2FixtureAnswers, synthesizeMiraLevel2Preparation } from "./level2";
import { compileLevel2CreateDirection } from "./level2Create";
import { createInitialFrameStates, generateLevel2CreateFrames } from "./level2CreateGeneration";

const secondaryUnavailable = {
  numerology: { status: "unavailable" as const, confidence: "low" as const, contextSummary: "Unavailable", lens: "None", source: "none" as const },
  humanDesign: { status: "unavailable" as const, confidence: "low" as const, note: "Unavailable", source: "none" as const },
};

function direction() {
  return compileLevel2CreateDirection(synthesizeMiraLevel2Preparation({
    answers: buildLevel2FixtureAnswers("quiet_luxury"),
    level1Result: null,
    secondaryHypotheses: secondaryUnavailable,
  }));
}

describe("MIRA real CREATE frame generation", () => {
  it("generates frame 02 first as the identity anchor and references it for companion frames", async () => {
    const create = direction();
    const calls: Array<{ prompt: string; originalImages?: Array<{ url?: string }> }> = [];
    const states: string[][] = [];
    const frames = await generateLevel2CreateFrames({
      direction: create,
      existing: createInitialFrameStates(create),
      generate: vi.fn(async options => {
        calls.push(options);
        return { url: `/manus-storage/${calls.length}.png` };
      }),
      resolveReference: vi.fn(async () => "https://signed.example/identity.png"),
      onState: vi.fn(async current => { states.push(current.map(frame => frame.status)); }),
    });

    expect(calls).toHaveLength(5);
    expect(calls[0]?.prompt).toContain("IDENTITY ANCHOR");
    expect(calls[0]?.prompt).toContain("inspiration references for style");
    expect(calls[0]?.originalImages).toBeUndefined();
    expect(calls.slice(1).every(call => call.originalImages?.[0]?.url === "https://signed.example/identity.png")).toBe(true);
    expect(calls.slice(1).every(call => call.prompt.includes("Do NOT copy the anchor's facial expression"))).toBe(true);
    expect(frames.every(frame => frame.status === "complete" && frame.url)).toBe(true);
    expect(states.length).toBeGreaterThanOrEqual(10);
  });

  it("preserves successful frames and retries only one failed frame", async () => {
    const create = direction();
    let attempt = 0;
    const first = await generateLevel2CreateFrames({
      direction: create,
      existing: createInitialFrameStates(create),
      generate: vi.fn(async () => {
        attempt += 1;
        if (attempt === 3) throw new Error("provider unavailable");
        return { url: `/manus-storage/generated-${attempt}.png` };
      }),
      resolveReference: vi.fn(async () => "https://signed.example/identity.png"),
      onState: vi.fn(async () => undefined),
    });
    const failed = first.find(frame => frame.status === "failed")!;
    const completedUrls = new Map(first.filter(frame => frame.status === "complete").map(frame => [frame.id, frame.url]));
    const retryGenerate = vi.fn(async () => ({ url: "/manus-storage/retry.png" }));
    const retried = await generateLevel2CreateFrames({
      direction: create,
      existing: first,
      frameIds: [failed.id],
      generate: retryGenerate,
      resolveReference: vi.fn(async () => "https://signed.example/identity.png"),
      onState: vi.fn(async () => undefined),
    });
    expect(retryGenerate).toHaveBeenCalledTimes(1);
    expect(retried.find(frame => frame.id === failed.id)).toMatchObject({ status: "complete", url: "/manus-storage/retry.png" });
    for (const [id, url] of completedUrls) expect(retried.find(frame => frame.id === id)?.url).toBe(url);
  });

  it("attempts all five frames when one provider generation fails", async () => {
    const create = direction();
    let attempt = 0;
    const generate = vi.fn(async () => {
      attempt += 1;
      if (attempt === 3) throw new Error("provider timeout");
      return { url: `/manus-storage/generated-${attempt}.png` };
    });
    const frames = await generateLevel2CreateFrames({
      direction: create,
      existing: createInitialFrameStates(create),
      generate,
      resolveReference: vi.fn(async () => "https://signed.example/identity.png"),
      onState: vi.fn(async () => undefined),
    });

    expect(generate).toHaveBeenCalledTimes(5);
    expect(frames.filter(frame => frame.status === "complete")).toHaveLength(4);
    expect(frames.filter(frame => frame.status === "failed")).toHaveLength(1);
  });

  it("uses inspiration images for style without treating their people as identity", async () => {
    const create = direction();
    const calls: Array<{ prompt: string; originalImages?: Array<{ url?: string }> }> = [];
    await generateLevel2CreateFrames({
      direction: create,
      existing: createInitialFrameStates(create),
      inspirationImages: [{ url: "/manus-storage/inspiration.png", mimeType: "image/png" }],
      generate: vi.fn(async options => { calls.push(options); return { url: `/manus-storage/out-${calls.length}.png` }; }),
      resolveReference: vi.fn(async url => `https://signed.example/${url.split("/").pop()}`),
      onState: vi.fn(async () => undefined),
    });
    expect(calls[0]?.originalImages?.[0]?.url).toContain("inspiration.png");
    expect(calls[0]?.prompt).toContain("inspiration references for style");
    expect(calls[0]?.prompt).toContain("never copy a person in an inspiration image as the subject identity");
    expect(calls.slice(1).every(call => call.originalImages?.[0]?.url?.includes("out-1.png"))).toBe(true);
  });

  it("uses a personal photo as identity reference and keeps inspiration references style-only", async () => {
    const create = direction();
    const calls: Array<{ prompt: string; originalImages?: Array<{ url?: string }> }> = [];
    await generateLevel2CreateFrames({
      direction: create,
      existing: createInitialFrameStates(create),
      personalReferenceImage: { url: "/manus-storage/me.webp", mimeType: "image/webp" },
      inspirationImages: [{ url: "/manus-storage/world.png", mimeType: "image/png" }],
      generate: vi.fn(async options => { calls.push(options); return { url: `/manus-storage/out-${calls.length}.png` }; }),
      resolveReference: vi.fn(async url => `https://signed.example/${url.split("/").pop()}`),
      onState: vi.fn(async () => undefined),
    });
    expect(calls[0]?.originalImages?.map(image => image.url)).toEqual([
      "https://signed.example/me.webp",
      "https://signed.example/world.png",
    ]);
    expect(calls[0]?.prompt).toContain("original image 1 is the user's personal identity reference");
    expect(calls[0]?.prompt).toContain("Never infer personality or sensitive traits");
    expect(calls.slice(1).every(call => call.originalImages?.[0]?.url?.includes("out-1.png"))).toBe(true);
  });
});
