import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getMiraV3JourneyState: vi.fn(),
  saveMiraV3RenderArtifact: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({ storagePut: vi.fn() }));
const pdfMocks = vi.hoisted(() => ({ renderPdfFromHtml: vi.fn() }));

vi.mock("./db", () => ({
  appendMiraV3ReflectionTurn: vi.fn(),
  confirmMiraV3MirrorRevision: vi.fn(),
  createMiraV3MirrorDraft: vi.fn(),
  createMiraV3MirrorEdit: vi.fn(),
  createMiraV3Journey: vi.fn(),
  getMiraV3JourneyState: dbMocks.getMiraV3JourneyState,
  getOwnedMiraV3Journey: vi.fn(),
  listMiraV3Journeys: vi.fn(),
  saveMiraV3RenderArtifact: dbMocks.saveMiraV3RenderArtifact,
  softDeleteMiraV3Journey: vi.fn(),
}));
vi.mock("../storage", () => ({ storagePut: storageMocks.storagePut }));
vi.mock("./pdf", async importOriginal => {
  const actual = await importOriginal<typeof import("./pdf")>();
  return { ...actual, renderPdfFromHtml: pdfMocks.renderPdfFromHtml };
});

import { miraV3Router } from "./router";
import { MIRA_V3_PDF_UNAVAILABLE_MESSAGE } from "./pdf";

const bundle = {
  mirror: {
    whatHasAlwaysBeenTrue: "I make difficult ideas feel clear without making them smaller.",
    thread: "People return when they need language for what they already sense.",
    whoThisIsFor: "Thoughtful founders who want recognition rather than performance.",
    returningSentence: "Make the invisible precise without making it smaller.",
    recognition: "The work is not louder. It is more exact.",
  },
  essence: {
    coreTruth: "Clarity can preserve depth.", naturalGift: "Naming the hidden thread.",
    feltExperience: "Quiet recognition.", peoplePortrait: "Thoughtful founders.",
    direction: "Let precision lead and promotion follow.", voiceQualities: ["quiet", "exact", "human"],
    currentChapter: "Choosing precision over performance.",
    strengths: ["Pattern recognition", "Clear language", "Quiet discernment"],
    zoneOfGenius: "Making the invisible precise without reducing its depth.",
    shadows: ["Over-refining before sharing", "Mistaking quiet for hesitation"],
    decisionCompass: "Choose what preserves depth and returns agency.",
    naturalContribution: "Language that helps thoughtful people recognize what they already know.",
    growthEdge: "Let the work be seen before every edge is resolved.",
  },
  visualDirection: {
    atmosphere: "Limestone quiet with editorial tension.",
    colorIntentions: ["mineral warmth", "grounded shadow", "restrained light"],
    materialCues: ["paper grain", "soft stone", "brushed metal"],
    compositionPrinciples: ["asymmetric calm", "one idea per field", "generous pause"],
    photographicDirection: "Close, unperformed, tactile portraits with natural falloff.",
  },
  evidence: Array.from({ length: 8 }, (_, index) => ({ turn: index + 1, quote: `Exact answer ${index + 1}`, supports: [index < 2 ? "mirror" : index < 5 ? "brand_soul" : "visual_direction"] })),
  generation: { model: "gpt-5-mini", fallback: false, promptTokens: 100, completionTokens: 100, totalTokens: 200 },
};

function caller() {
  return miraV3Router.createCaller({ user: { id: 7 }, req: {}, res: {} } as never);
}

function state(status: "mirror_draft" | "mirror_confirmed", revisionStatus: "draft" | "confirmed") {
  return {
    journey: { id: 11, status, currentStep: status, turnCount: 8, activeSessionId: null },
    sessions: [], messages: [],
    revisions: [{ id: 21, status: revisionStatus, bundle }],
  };
}

describe("Mira V3 owner-scoped HTML/PDF procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.renderPdfFromHtml.mockResolvedValue(Buffer.from("%PDF deterministic test document"));
    storageMocks.storagePut.mockResolvedValue({ key: "mira-v3/7/11/21/mira-11-the-mirror.pdf", url: "private://artifact" });
  });

  it("rejects unconfirmed journeys on both server render paths", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(state("mirror_draft", "draft"));
    await expect(caller().getDeliverableHtml({ journeyId: 11, deliverable: "mirror" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller().downloadDeliverablePdf({ journeyId: 11, deliverable: "mirror" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(storageMocks.storagePut).not.toHaveBeenCalled();
  });

  it("returns HTML and PDF only for the confirmed owner journey", async () => {
    dbMocks.getMiraV3JourneyState.mockResolvedValue(state("mirror_confirmed", "confirmed"));
    const html = await caller().getDeliverableHtml({ journeyId: 11, deliverable: "mirror" });
    const pdf = await caller().downloadDeliverablePdf({ journeyId: 11, deliverable: "mirror" });
    expect(html.html).toContain("Mira · Private confirmed document");
    expect(Buffer.from(pdf.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(storageMocks.storagePut).toHaveBeenCalledOnce();
    expect(dbMocks.saveMiraV3RenderArtifact).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, journeyId: 11, revisionId: 21, status: "ready" }));
  });

  it("fails closed deterministically when PDF rendering is unavailable without changing the confirmed deliverable state", async () => {
    const confirmedState = state("mirror_confirmed", "confirmed");
    dbMocks.getMiraV3JourneyState.mockResolvedValue(confirmedState);
    pdfMocks.renderPdfFromHtml.mockRejectedValue(new Error("PDF renderer unavailable"));

    await expect(caller().downloadDeliverablePdf({ journeyId: 11, deliverable: "mirror" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: MIRA_V3_PDF_UNAVAILABLE_MESSAGE,
    });

    expect(storageMocks.storagePut).not.toHaveBeenCalled();
    expect(dbMocks.saveMiraV3RenderArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 7,
      journeyId: 11,
      revisionId: 21,
      deliverable: "mirror",
      status: "pending",
    }));
    expect(dbMocks.saveMiraV3RenderArtifact).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 7,
      journeyId: 11,
      revisionId: 21,
      deliverable: "mirror",
      status: "failed",
      errorMessage: "PDF renderer unavailable",
    }));
    expect(confirmedState.journey.status).toBe("mirror_confirmed");
    expect(confirmedState.revisions).toEqual([expect.objectContaining({ id: 21, status: "confirmed" })]);
  });
});
