import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
const storageMocks = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn(), storagePut: vi.fn() }));
const imageMocks = vi.hoisted(() => ({ generateImage: vi.fn(), resolveImageInputUrl: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  appendMiraV4CreativeTurn: vi.fn(),
  appendMiraV4RecognitionTurn: vi.fn(),
  claimMiraV4CreativeDna: vi.fn(),
  claimMiraV4VisualSet: vi.fn(),
  completeMiraV4CreativeDna: vi.fn(),
  completeMiraV4Inspiration: vi.fn(),
  completeMiraV4VisualSet: vi.fn(),
  createMiraV4Journey: vi.fn(),
  failMiraV4CreativeDna: vi.fn(),
  failMiraV4VisualSet: vi.fn(),
  getMiraV4CreativeDnaRecord: vi.fn(),
  getMiraV4CreativeDnaSource: vi.fn(),
  getMiraV4CreativeState: vi.fn(),
  getMiraV4MoodboardState: vi.fn(),
  getMiraV4RecognitionState: vi.fn(),
  getOwnedMiraV4Journey: vi.fn(),
  listMiraV4Journeys: vi.fn(),
  saveMiraV4BirthDetails: vi.fn(),
  saveMiraV4CreativeBrief: vi.fn(),
  saveMiraV4InspirationAsset: vi.fn(),
  saveMiraV4QuickContext: vi.fn(),
  startMiraV4Recognition: vi.fn(),
}));

vi.mock("../_core/llm", () => llmMocks);
vi.mock("../storage", () => storageMocks);
vi.mock("../_core/imageGeneration", () => imageMocks);
vi.mock("./db", () => dbMocks);

import { miraV4Router } from "./router";
import {
  MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
  MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
  miraV4CreativeDnaSchema,
  type MiraV4CreativeDna,
} from "../../shared/miraV4CreativeDna";

const validCreativeDna: MiraV4CreativeDna = {
  schemaVersion: "1.0",
  identity: {
    recognitionSummary: "A quiet editorial practice that helps people trust their own perspective.",
    brandRole: "A discerning guide who makes inner clarity visible.",
    coreValues: ["clarity", "self-trust", "depth"],
    coreTensions: ["restraint and warmth", "structure and intuition"],
    underrepresentedQuality: "Tactile confidence",
    becomingIdentity: "An unmistakable editorial authority",
    creativeBoundaries: ["Never perform luxury", "Avoid visual noise"],
  },
  creativeEssence: {
    philosophy: ["Recognition precedes expression"],
    ambition: ["Make self-trust feel practical"],
    emotionalSignature: "Quiet inevitability",
    desiredImpact: "People feel more certain of what is already theirs.",
    energy: ["grounded", "precise", "unhurried"],
    atmosphere: ["private", "textural", "editorial"],
    tempo: "Slow, spacious, and deliberate",
    contrast: ["weathered detail against clean structure"],
  },
  visualWorld: {
    overallLanguage: "Restrained editorial structure softened by weathered, tactile detail.",
    colourWorld: {
      description: "Earth-led neutrals with one aged metallic accent.",
      colours: [
        { name: "Graphite", hex: "#343331", role: "Primary depth" },
        { name: "Parchment", hex: "#E7DFCF", role: "Breathing space" },
        { name: "Weathered Brass", hex: "#8A6F43", role: "Human accent" },
      ],
    },
    light: {
      quality: "Soft directional window light",
      temperature: "Warm neutral",
      contrast: "Low to medium",
      timeReference: "Late afternoon",
    },
    materials: ["uncoated paper", "weathered brass", "dark wood"],
    textures: ["graphite", "linen", "subtle grain"],
    architecture: ["quiet libraries", "restrained studios"],
    nature: ["dry grasses", "stone", "winter branches"],
    movement: ["stillness", "slow hand gestures"],
    composition: {
      framing: "Editorial crops with one clear subject",
      negativeSpace: "Generous and intentional",
      scale: "Human detail within architectural calm",
      balance: "Asymmetrical but stable",
      perspective: "Eye-level and intimate",
    },
  },
  creativeDirection: {
    overallDirection: "Build trust through restraint, tactility, and precise editorial rhythm.",
    photographyDirection: ["natural light", "observed gestures", "close material details"],
    stylingDirection: ["tonal layers", "natural fibres", "minimal ornament"],
    locationDirection: ["private studio", "aged European interior"],
    creativeRules: {
      mustInclude: ["visible material texture", "breathing space"],
      avoid: ["glossy corporate polish", "trend-led colour"],
    },
    keywords: ["quiet", "tactile", "editorial", "grounded"],
    creativeSummary: "A quiet editorial world where material honesty makes clarity feel lived rather than declared.",
  },
  implementationHints: {
    shootType: "Editorial portrait and atmospheric detail study",
    wardrobePriority: ["natural fibres", "tonal tailoring"],
    lightingPriority: ["window light", "soft shadow"],
    locationPriority: ["textural interior", "architectural quiet"],
    propsPriority: ["weathered brass object", "uncoated paper"],
    practicalNotes: ["Protect negative space", "Keep the palette restrained"],
  },
  renderTokens: {
    palette: ["graphite", "parchment", "weathered brass"],
    materials: ["linen", "uncoated paper", "dark wood"],
    architecture: ["restrained studio", "quiet library"],
    nature: ["stone", "dry grasses"],
    light: ["soft directional window light", "late afternoon"],
    composition: ["asymmetrical balance", "generous negative space"],
    fashion: ["tonal tailoring", "natural fibres"],
    mood: ["quiet inevitability", "grounded clarity"],
    styleReferences: ["independent editorial publishing"],
    avoid: ["high gloss", "visual clutter", "literal symbolism"],
  },
  inspiration: {
    imageReference: "mira-v4/7/41/inspiration/weathered-key.png",
    userExplanation: "I love the aged brass, quiet shadow, and sense that the object carries a private history.",
    influenceRule: "supporting_evidence_only",
  },
};

function caller(userId = 7) {
  return miraV4Router.createCaller({ user: { id: userId }, req: {}, res: {} } as never);
}

function sourceState(currentStep = "pre_generation_mirror") {
  return {
    journey: {
      id: 41,
      userId: 7,
      status: "creative_discovery",
      currentStep,
      turnCount: 2,
      creativeTurnCount: 5,
      building: "An editorial personal-brand studio",
      currentPosition: "Ready to become visible without performing",
      needMost: "A coherent visual direction",
      firstCreation: "A private direction she can return to",
      birthDate: "1985-01-16",
      birthTime: "13:05",
      birthTimeUnknown: 0,
      birthCity: "Vilnius, Lithuania",
      creativeInputs: {
        warmth: 35,
        structure: 70,
        expression: 55,
        texture: "Tactile",
        colorAttraction: "Earthy",
        typography: "Editorial serif",
        imageryWorld: "Atmospheric spaces",
      },
      inspirationStorageKey: "mira-v4/7/41/inspiration/weathered-key.png",
      inspirationExplanation: "I love the aged brass, quiet shadow, and sense that the object carries a private history.",
    },
    messages: [
      { phase: "recognition", role: "assistant", content: "What are you building?" },
      { phase: "recognition", role: "user", content: "A studio that helps people trust their own perspective." },
      { phase: "creative_discovery", role: "assistant", content: "What atmosphere holds your attention?" },
      { phase: "creative_discovery", role: "user", content: "Quiet editorial spaces with tactile detail." },
    ],
  };
}

function completeRecord() {
  return {
    id: 1,
    journeyId: 41,
    userId: 7,
    status: "complete",
    schemaVersion: MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION,
    promptVersion: MIRA_V4_CREATIVE_DNA_PROMPT_VERSION,
    creativeDnaJson: validCreativeDna,
  };
}

describe("Mira V4 Stage 4 Creative DNA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getMiraV4CreativeDnaRecord.mockResolvedValue(undefined);
    dbMocks.getMiraV4CreativeDnaSource.mockResolvedValue(sourceState());
    dbMocks.claimMiraV4CreativeDna.mockResolvedValue({ claimed: true, record: { status: "in_progress" } });
    dbMocks.completeMiraV4CreativeDna.mockResolvedValue(completeRecord());
    storageMocks.storageGetSignedUrl.mockResolvedValue("https://private.example/inspiration.png?signature=test");
    imageMocks.resolveImageInputUrl.mockResolvedValue("https://private.example/selected.png?signature=test");
    llmMocks.invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify(validCreativeDna) } }],
      usage: { prompt_tokens: 800, completion_tokens: 1200, total_tokens: 2000 },
    });
  });

  it("requires authentication before any owner-scoped lookup", async () => {
    const unauthenticated = miraV4Router.createCaller({ user: undefined, req: {}, res: {} } as never);
    await expect(unauthenticated.synthesizeCreativeDna({ journeyId: 41 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMocks.getMiraV4CreativeDnaRecord).not.toHaveBeenCalled();
  });

  it("enforces ownership through the current authenticated user id", async () => {
    dbMocks.getMiraV4CreativeDnaSource.mockResolvedValue(undefined);
    await expect(caller(99).synthesizeCreativeDna({ journeyId: 41 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMocks.getMiraV4CreativeDnaRecord).toHaveBeenCalledWith(99, 41);
    expect(dbMocks.getMiraV4CreativeDnaSource).toHaveBeenCalledWith(99, 41);
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("requires the completed Stage 3 boundary before synthesis", async () => {
    dbMocks.getMiraV4CreativeDnaSource.mockResolvedValue(sourceState("inspiration"));
    await expect(caller().synthesizeCreativeDna({ journeyId: 41 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(dbMocks.claimMiraV4CreativeDna).not.toHaveBeenCalled();
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("makes exactly one structured model call, assembles all source evidence, and persists one validated object", async () => {
    await expect(caller().synthesizeCreativeDna({ journeyId: 41 })).resolves.toEqual({
      status: "complete",
      reused: false,
      schemaVersion: "1.0",
      promptVersion: "creative-dna-v1",
    });

    expect(llmMocks.invokeLLM).toHaveBeenCalledTimes(1);
    const request = llmMocks.invokeLLM.mock.calls[0]?.[0];
    expect(request.max_completion_tokens).toBe(4096);
    expect(request.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    const schema = request.response_format.json_schema.schema as {
      properties?: Record<string, { properties?: Record<string, Record<string, unknown>> }>;
    };
    const inspirationSchema = schema.properties?.inspiration?.properties;
    expect(inspirationSchema?.imageReference).toMatchObject({
      type: ["string", "null"],
      minLength: 1,
      maxLength: 1024,
    });
    expect(inspirationSchema?.userExplanation).toMatchObject({
      type: ["string", "null"],
      minLength: 1,
      maxLength: 500,
    });
    expect(inspirationSchema?.imageReference).not.toHaveProperty("anyOf");
    expect(inspirationSchema?.userExplanation).not.toHaveProperty("anyOf");
    const userContent = request.messages[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(userContent[0]?.text).toContain("A studio that helps people trust their own perspective");
    expect(userContent[0]?.text).toContain("Editorial serif");
    expect(userContent[0]?.text).toContain("supporting_evidence_only");
    expect(userContent[1]?.image_url?.url).toContain("private.example");
    expect(dbMocks.completeMiraV4CreativeDna).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      journeyId: 41,
      creativeDna: validCreativeDna,
      model: "gpt-5-mini",
    }));
  });

  it("accepts structured text-part content from the model without treating it as a failed JSON response", async () => {
    llmMocks.invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: [{ type: "text", text: JSON.stringify(validCreativeDna) }] } }],
      usage: { prompt_tokens: 800, completion_tokens: 1200, total_tokens: 2000 },
    });

    await expect(caller().synthesizeCreativeDna({ journeyId: 41 })).resolves.toMatchObject({
      status: "complete",
      reused: false,
    });
    expect(dbMocks.completeMiraV4CreativeDna).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      journeyId: 41,
      creativeDna: validCreativeDna,
    }));
    expect(dbMocks.failMiraV4CreativeDna).not.toHaveBeenCalled();
  });

  it("returns an existing Creative DNA with zero model calls", async () => {
    dbMocks.getMiraV4CreativeDnaRecord.mockResolvedValue(completeRecord());
    await expect(caller().synthesizeCreativeDna({ journeyId: 41 })).resolves.toMatchObject({ status: "complete", reused: true });
    expect(dbMocks.getMiraV4CreativeDnaSource).not.toHaveBeenCalled();
    expect(dbMocks.claimMiraV4CreativeDna).not.toHaveBeenCalled();
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("rejects duplicate concurrent claims before a second model call", async () => {
    dbMocks.claimMiraV4CreativeDna.mockResolvedValue({ claimed: false, record: { status: "in_progress" } });
    await expect(caller().synthesizeCreativeDna({ journeyId: 41 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(llmMocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("rejects invalid model output, persists no Creative DNA, and marks the claim retryable", async () => {
    llmMocks.invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{ message: { content: JSON.stringify({ schemaVersion: "1.0", identity: {} }) } }],
    });
    await expect(caller().synthesizeCreativeDna({ journeyId: 41 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("can be retried"),
    });
    expect(llmMocks.invokeLLM).toHaveBeenCalledTimes(1);
    expect(dbMocks.completeMiraV4CreativeDna).not.toHaveBeenCalled();
    expect(dbMocks.failMiraV4CreativeDna).toHaveBeenCalledWith(7, 41, "creative_dna_synthesis_failed");
  });

  it("uses the same strict schema for the realistic mock and preserves explicit versions and inspiration", () => {
    expect(miraV4CreativeDnaSchema.parse(validCreativeDna)).toEqual(validCreativeDna);
    expect(validCreativeDna.schemaVersion).toBe(MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION);
    expect(MIRA_V4_CREATIVE_DNA_PROMPT_VERSION).toBe("creative-dna-v1");
    expect(validCreativeDna.inspiration).toEqual({
      imageReference: "mira-v4/7/41/inspiration/weathered-key.png",
      userExplanation: "I love the aged brass, quiet shadow, and sense that the object carries a private history.",
      influenceRule: "supporting_evidence_only",
    });
  });

  it("keeps Stage 4 synthesis isolated while handing its completed evidence to the approved downstream visual pipeline", () => {
    const schemaSource = readFileSync(new URL("../../drizzle/schema.ts", import.meta.url), "utf8");
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const serviceSource = readFileSync(new URL("./creativeDna.ts", import.meta.url), "utf8");
    const routerSource = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
    expect(schemaSource.match(/mysqlTable\(\s*"mira_v4_creative_dna"/g)).toHaveLength(1);
    expect(schemaSource).toContain("mira_v4_creative_dna_journey_uidx");
    expect(dbSource).toContain("db.transaction(async tx =>");
    expect(dbSource).toContain('.set({ status: "brand_dna_draft", currentStep: "visual_discovery" })');
    expect(dbSource).toContain("schemaVersion: MIRA_V4_CREATIVE_DNA_SCHEMA_VERSION");
    expect(dbSource).toContain("promptVersion: MIRA_V4_CREATIVE_DNA_PROMPT_VERSION");
    expect(serviceSource).toContain('invokeLLM({');
    expect(serviceSource).not.toMatch(/from ["'].*imageGeneration/);
    expect(routerSource).toContain("generateVisualReferences");
    expect(routerSource).toContain("generateImage");
    expect(`${serviceSource}\n${routerSource}`).not.toMatch(/from ["'].*(?:pdf|krea|fal|flux|ideogram)/i);
  });

  it("marks a post-claim refinement image failure retryable while preserving the selected initial reference", async () => {
    const initialReference = {
      id: "material intimacy",
      direction: "material intimacy",
      prompt: "Initial visual reference",
      url: "/manus-storage/generated/initial-reference.png",
    };
    const visualState = {
      journey: { ...sourceState("visual_discovery").journey, currentStep: "visual_discovery" },
      creativeDna: completeRecord(),
      initial: { status: "complete", referencesJson: [initialReference] },
      refined: undefined as any,
      moodboard: undefined as any,
    };
    dbMocks.getMiraV4MoodboardState.mockResolvedValue(visualState);
    dbMocks.claimMiraV4VisualSet.mockResolvedValue({ claimed: true, record: { status: "in_progress" } });
    imageMocks.resolveImageInputUrl.mockResolvedValue("https://private.example/initial-reference.png?signature=test");
    imageMocks.generateImage.mockRejectedValue(new Error("provider unavailable"));

    await expect(caller().refineVisualReferences({
      journeyId: 41,
      referenceId: initialReference.id,
      reasons: ["Keep the material intimacy"],
      note: null,
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("can be retried"),
    });

    expect(imageMocks.resolveImageInputUrl).toHaveBeenCalledWith(initialReference.url);
    expect(dbMocks.completeMiraV4VisualSet).not.toHaveBeenCalled();
    expect(dbMocks.failMiraV4VisualSet).toHaveBeenCalledWith({
      userId: 7,
      journeyId: 41,
      stage: "refined",
      errorCode: "visual_refinement_failed",
    });
    expect(visualState.initial.referencesJson[0]).toEqual(initialReference);
    expect(visualState.refined).toBeUndefined();
  });

  it("marks image-provider usage exhaustion retryable and returns explicit safe-retry guidance for Visual Direction", async () => {
    const visualState = {
      journey: { ...sourceState("visual_discovery").journey, currentStep: "visual_discovery" },
      creativeDna: completeRecord(),
      initial: undefined as any,
      refined: undefined as any,
      moodboard: undefined as any,
    };
    dbMocks.getMiraV4MoodboardState.mockResolvedValue(visualState);
    dbMocks.claimMiraV4VisualSet.mockResolvedValue({ claimed: true, record: { status: "in_progress" } });
    imageMocks.generateImage.mockRejectedValue(new Error('Image generation request failed (400 Bad Request): {"message":"your account has hit a usage exhausted"}'));

    await expect(caller().generateVisualReferences({ journeyId: 41 })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: expect.stringContaining("usage limit"),
    });

    expect(dbMocks.completeMiraV4VisualSet).not.toHaveBeenCalled();
    expect(dbMocks.failMiraV4VisualSet).toHaveBeenCalledWith({
      userId: 7,
      journeyId: 41,
      stage: "initial",
      errorCode: "image_generation_usage_exhausted",
    });
  });

  it("runs the protected five-image visual pipeline once, then reuses the completed Moodboard without duplicate image calls", async () => {
    const visualState = {
      journey: { ...sourceState("visual_discovery").journey, currentStep: "visual_discovery" },
      creativeDna: completeRecord(),
      initial: undefined as any,
      refined: undefined as any,
      moodboard: undefined as any,
    };
    let generatedImageCount = 0;

    dbMocks.getMiraV4MoodboardState.mockImplementation(async () => visualState);
    dbMocks.claimMiraV4VisualSet.mockResolvedValue({ claimed: true, record: { status: "in_progress" } });
    dbMocks.completeMiraV4VisualSet.mockImplementation(async (params: { stage: "initial" | "refined" | "moodboard"; references?: Array<Record<string, string>> }) => {
      const record = { status: "complete", referencesJson: params.references ?? [] };
      visualState[params.stage] = record;
      return record;
    });
    imageMocks.generateImage.mockImplementation(async () => ({ url: `https://private.example/generated-${++generatedImageCount}.png` }));

    const api = caller();
    await expect(api.generateVisualReferences({ journeyId: 41 })).resolves.toEqual({ status: "complete", reused: false });
    expect(imageMocks.generateImage).toHaveBeenCalledTimes(5);
    const initialReference = visualState.initial.referencesJson[0];

    await expect(api.refineVisualReferences({
      journeyId: 41,
      referenceId: initialReference.id,
      reasons: ["More shadow", "Keep the material intimacy"],
      note: "Retain quiet human presence.",
    })).resolves.toEqual({ status: "complete", reused: false });
    expect(imageMocks.generateImage).toHaveBeenCalledTimes(10);
    expect(imageMocks.resolveImageInputUrl).toHaveBeenCalledWith(initialReference.url);
    const refinedClaim = dbMocks.claimMiraV4VisualSet.mock.calls
      .map(([params]) => params)
      .find((params: { stage: string }) => params.stage === "refined");
    expect(refinedClaim.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(refinedClaim.sourceFingerprint).not.toContain("More shadow");
    const refinedReference = visualState.refined.referencesJson[0];

    await expect(api.generateFinalMoodboard({
      journeyId: 41,
      referenceId: refinedReference.id,
      preserve: "quiet material intimacy",
      avoid: "high gloss",
      note: "Keep the human presence restrained.",
    })).resolves.toMatchObject({ status: "complete", reused: false });

    expect(imageMocks.generateImage).toHaveBeenCalledTimes(15);
    expect(imageMocks.resolveImageInputUrl).toHaveBeenCalledWith(refinedReference.url);
    const moodboardClaim = dbMocks.claimMiraV4VisualSet.mock.calls
      .map(([params]) => params)
      .find((params: { stage: string }) => params.stage === "moodboard");
    expect(moodboardClaim.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(moodboardClaim.sourceFingerprint).not.toContain("quiet material intimacy");
    const finalGenerationRequests = imageMocks.generateImage.mock.calls.slice(10).map(([request]) => request);
    expect(finalGenerationRequests).toHaveLength(5);
    for (const request of finalGenerationRequests) {
      expect(request).toMatchObject({
        quality: "high",
        originalImages: [{ url: "https://private.example/selected.png?signature=test", mimeType: "image/png" }],
      });
      expect(request.prompt).toContain("AUTHORITATIVE MARIA VISUAL-DIRECTION LAYER");
      expect(request.prompt).toContain("A five-image Moodboard is one campaign story, not five unrelated beautiful images.");
    }

    await expect(api.generateFinalMoodboard({
      journeyId: 41,
      referenceId: refinedReference.id,
      preserve: "quiet material intimacy",
      avoid: "high gloss",
      note: "Keep the human presence restrained.",
    })).resolves.toMatchObject({ status: "complete", reused: true });
    expect(imageMocks.generateImage).toHaveBeenCalledTimes(15);
    expect(dbMocks.claimMiraV4VisualSet).toHaveBeenCalledTimes(3);
    expect(dbMocks.completeMiraV4VisualSet).toHaveBeenCalledTimes(3);
  });
});
