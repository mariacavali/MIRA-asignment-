import { beforeEach, describe, expect, it, vi } from "vitest";

const llmMocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  getMiraV4CreativeDnaSource: vi.fn(),
}));

vi.mock("../_core/llm", () => llmMocks);
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getMiraV4CreativeDnaSource: dbMocks.getMiraV4CreativeDnaSource,
  };
});

import { miraV4Router } from "./router";

function caller(userId = 7) {
  return miraV4Router.createCaller({ user: { id: userId }, req: {}, res: {} } as never);
}

describe("Mira V4 Brand Blueprint preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getMiraV4CreativeDnaSource.mockResolvedValue({
      journey: {
        id: 41,
        userId: 7,
        currentStep: "creative_brief",
        building: "A personal brand studio",
        currentPosition: "Clear in essence, not yet visible enough",
        needMost: "Recognition and trust",
        firstCreation: "A visual world for a brand shoot",
      },
      messages: [
        { phase: "recognition", role: "assistant", content: "If your brand threw a party, where would it be?" },
        { phase: "recognition", role: "user", content: "In a beautiful old apartment with music, candlelight, and people who stay longer than they planned." },
        { phase: "creative_discovery", role: "assistant", content: "What should your brand never look or feel like?" },
        { phase: "creative_discovery", role: "user", content: "Never cold, over-polished, or generic. It has to feel like me, not like a template." },
      ],
    });
    llmMocks.invokeLLM.mockResolvedValue({
      model: "gpt-5-mini",
      choices: [{
        message: {
          content: JSON.stringify({
            yourWords: [
              "beautiful old apartment with music, candlelight, and people who stay longer than they planned.",
              "Never cold, over-polished, or generic.",
              "It has to feel like me, not like a template.",
            ],
            miraSees: "A brand that wants intimacy, refinement, and recognisable humanity over formula.",
            signaturePatterns: [
              "A pull toward lived-in elegance rather than performance.",
              "A strong rejection of generic polish.",
              "A need for the brand world to feel socially warm and emotionally recognisable.",
            ],
            definingTensions: ["elegance and ease"],
            brandWorld: {
              atmosphere: "Intimate, warm, and editorial.",
              colour: "Muted, candlelit tones with soft contrast.",
              light: "Warm low light with shape and depth.",
              materials: "Aged woods, soft textiles, and tactile surfaces.",
              environmentArchitecture: "Residential spaces with character and restraint.",
              styling: "Refined but lived-in, never costume-like.",
              movement: "Natural movement with social ease.",
              composition: "Composed frames that still leave room to breathe.",
            },
            presence: {
              expression: "Warm, direct, and unforced.",
              bodyLanguage: "Grounded and at ease.",
              movement: "Small gestures and natural shifts.",
              relationshipToCamera: "Aware of the camera without performing for it.",
            },
            creativeRules: {
              belongs: ["Warmth", "Character", "Recognisable personal detail"],
              avoid: ["Cold polish", "Generic luxury", "Template energy"],
            },
            suggestedCreativeBrief: {
              warmth: 74,
              structure: 58,
              expression: 44,
              texture: "Tactile",
              colorAttraction: "Earthy",
              typography: "Editorial serif",
              imageryWorld: "Atmospheric spaces",
            },
          }),
        },
      }],
    });
  });

  it("returns a separate derived preview while preserving exact user language", async () => {
    const preview = await caller().getBrandBlueprintPreview({ journeyId: 41 });
    expect(preview.yourWords).toContain("Never cold, over-polished, or generic.");
    expect(preview.miraSees).toContain("intimacy");
    expect(preview.signaturePatterns).toHaveLength(3);
    expect(preview.suggestedCreativeBrief.typography).toBe("Editorial serif");
  });
});