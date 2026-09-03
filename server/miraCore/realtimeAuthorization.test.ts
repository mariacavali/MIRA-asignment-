import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  startOrResumeRealtimeSession: vi.fn(),
  getLatestShootMemory: vi.fn(),
  getClientInvitation: vi.fn(),
  listShootVisualEvidenceForRealtime: vi.fn(),
  updateRealtimeProviderCall: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./visualReferences", () => ({ listShootVisualEvidenceForRealtime: dbMocks.listShootVisualEvidenceForRealtime }));
vi.mock("../_core/env", () => ({ ENV: {
  embeddingApiKey: "test-key-never-returned",
  openAiRealtimeModel: "gpt-realtime-2.1",
  openAiRealtimeVoice: "marin",
  openAiRealtimeTranscriptionModel: "gpt-4o-mini-transcribe",
} }));

import { createRealtimeWebRtcCall } from "./realtime";

describe("realtime WebRTC authorization boundary", () => {
  beforeEach(() => { vi.restoreAllMocks(); dbMocks.startOrResumeRealtimeSession.mockReset(); });

  it("does not contact the provider when the secure invitation cannot authorize a session", async () => {
    dbMocks.startOrResumeRealtimeSession.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(createRealtimeWebRtcCall({ token: "invalid", sdp: "offer" })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps permanent credentials server-side and returns only call negotiation data", async () => {
    dbMocks.startOrResumeRealtimeSession.mockResolvedValue({
      reused: false,
      shoot: { id: 9, title: "Portrait", shootType: null, clientName: "Client", clientEmail: null, scheduledAt: null, timezone: "UTC", intendedUse: null, location: null, durationMinutes: null, photographerNotes: null, roomState: "welcome" },
      session: { id: "session-id", startedAt: new Date(), allowedSeconds: 1200 },
    });
    dbMocks.getClientInvitation.mockResolvedValue({ photographer: null });
    dbMocks.listShootVisualEvidenceForRealtime.mockResolvedValue([]);
    dbMocks.getLatestShootMemory.mockResolvedValue({ schemaVersion: "1.0", identity: {}, brand: {}, expression: {}, visualWorld: {}, shootContext: {}, openQuestions: [], completeness: { identity: "missing", brand: "missing", expression: "missing", visualWorld: "missing", shootContext: "missing" } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("answer-sdp", { status: 200, headers: { location: "/v1/realtime/calls/provider-call" } }));
    const result = await createRealtimeWebRtcCall({ token: "valid", sdp: "offer-sdp" });
    expect(fetchSpy).toHaveBeenCalledWith("https://api.openai.com/v1/realtime/calls", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer test-key-never-returned" }) }));
    expect(JSON.stringify(result)).not.toContain("test-key-never-returned");
    expect(result).toMatchObject({ answerSdp: "answer-sdp", sessionId: "session-id", remainingSeconds: 1200 });
    expect(dbMocks.updateRealtimeProviderCall).toHaveBeenCalledWith("session-id", "provider-call");
  });
});
