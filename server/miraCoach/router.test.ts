import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import { createCoachRouter } from "./router";
import type { CoachRuntime } from "./runtime";
import { newCallClock, callClockStatus } from "./callClock";
import { prepareDirectionBrief } from "../miraBrandDirection/brief";

const conversationId = "c030dd28-c3ee-471f-8bf3-c50a4a3a48fa";
const input = { workspaceId: 10, conversationId, requestId: "d684f589-d2a5-4a8a-9e2a-c1f2af162635", message: "Help with my brand" };
function fixture(userId: number | null = 7, enabled = true) {
  const service: CoachRuntime = {
    readDirectionBrief: vi.fn(async () => prepareDirectionBrief({ revision: 0, configuration: null, reflection: null })),
    remainingCallMs: vi.fn(async () => 60_000),
    readSpokenReply: vi.fn(async () => "Saved reply"),
    readCallClock: vi.fn(async () => null),
    controlCallClock: vi.fn(async () => callClockStatus(newCallClock(0))),
    runCall: vi.fn(async () => ({ response: "Timed reply", memoryProposals: [] })),
    confirmInterviewReflection: vi.fn(async () => ({ revision: 1 })),
    readInterview: vi.fn(async () => ({ revision: 0, coverage: null, reflection: null })),
    reviewInterview: vi.fn(async () => ({ revision: 1 })),
    reviewInterviewProposal: vi.fn(async () => ({ revision: 1 })),
    confirmInterviewReview: vi.fn(async () => ({ revision: 1 })),
    readDirection: vi.fn(async () => ({ revision: 0, configuration: null, records: [] })),
    configureDirection: vi.fn(async () => ({ revision: 1 })),
    saveDirection: vi.fn(async () => ({ revision: 1, directionId: input.requestId })),
    reviewDirection: vi.fn(async () => ({ revision: 1 })),
    approveDirection: vi.fn(async () => ({ revision: 1 })),
    addSource: vi.fn(async () => ({ sourceId: input.requestId, revision: 1 })),
    listSources: vi.fn(async () => ({ sources: [], revision: 0, nextCursor: null })),
    withdrawSource: vi.fn(async () => ({ revision: 1 })),
    listMemory: vi.fn(async () => ({ revision: 0, proposals: [], nextCursor: null })),
    decideMemory: vi.fn(async () => ({ revision: 1, status: "confirmed" as const })),
    listConversations: vi.fn(async () => ({ conversations: [], nextCursor: null })),
    createConversation: vi.fn(async () => conversationId),
    readBrandContext: vi.fn(async () => ({ workspaceId: 10, conversationId, ownerUserId: 7,
      revision: 1, messages: [], evidence: [] })),
    run: vi.fn(async () => ({ response: "Tell me about your audience.", memoryProposals: [] })),
  };
  const runtime = vi.fn(async () => service);
  const caller = createCoachRouter({ enabled: () => enabled, runtime }).createCaller({
    user: userId === null ? null : { id: userId }, req: {}, res: {},
  } as TrpcContext);
  return { caller, runtime, service };
}

describe("coach API boundary", () => {
  it.each([[null, true, "UNAUTHORIZED"], [7, false, "NOT_FOUND"]] as const)(
    "blocks user %s with feature %s before runtime construction", async (user, enabled, code) => {
      const { caller, runtime } = fixture(user, enabled);
      for (const call of [() => caller.readInterview({ workspaceId: 10, conversationId }),
        () => caller.readDirectionBrief({ workspaceId: 10, conversationId }),
        () => caller.readCallClock({ workspaceId: 10, conversationId }),
        () => caller.controlCallClock({ workspaceId: 10, conversationId, requestId: input.requestId, expectedRevision: 0, action: "start" }),
        () => caller.callTurn(input),
        () => caller.confirmInterviewReflection({ workspaceId: 10, conversationId, expectedRevision: 0, fingerprint: "a".repeat(64) }),
        () => caller.reviewInterviewProposal({ workspaceId: 10, conversationId, expectedRevision: 0, proposalId: "a".repeat(64), action: "accept" }),
        () => caller.reviewInterview({ workspaceId: 10, conversationId, expectedRevision: 0, area: "offer", status: "unknown", memoryId: null }),
        () => caller.confirmInterviewReview({ workspaceId: 10, conversationId, expectedRevision: 0 }),
        () => caller.readDirection({ workspaceId: 10, conversationId }), () => caller.listConversations({ workspaceId: 10 }), () => caller.createConversation({ workspaceId: 10 }),
        () => caller.getConversation({ workspaceId: 10, conversationId }), () => caller.turn(input),
        () => caller.listSources({ workspaceId: 10, conversationId }),
        () => caller.addSource({ workspaceId: 10, conversationId, expectedRevision: 0,
          source: { title: "Notes", text: "Client notes", rightsBasis: "client_owned", approvedForCoaching: true } }),
        () => caller.withdrawSource({ workspaceId: 10, conversationId, sourceId: input.requestId, expectedRevision: 0 }),
        () => caller.listMemory({ workspaceId: 10, conversationId }),
        () => caller.decideMemory({ workspaceId: 10, conversationId, proposalId: input.requestId, expectedRevision: 0, decision: "confirmed" })]) {
        await expect(call()).rejects.toMatchObject({ code });
      }
      expect(runtime).not.toHaveBeenCalled();
    });
  it("reports availability without constructing providers and requires authentication", async () => {
    const disabled = fixture(7, false);
    expect(await disabled.caller.availability()).toEqual({ enabled: false });
    expect(disabled.runtime).not.toHaveBeenCalled();
    await expect(fixture(null).caller.availability()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("uses authenticated identity for every operation and exposes only conversation history", async () => {
    const { caller, service } = fixture();
    expect(await caller.availability()).toEqual({ enabled: true });
    await caller.listConversations({ workspaceId: 10 });
    expect(service.listConversations).toHaveBeenCalledWith(7, 10, undefined);
    expect(await caller.createConversation({ workspaceId: 10 })).toEqual({ conversationId });
    expect(service.createConversation).toHaveBeenCalledWith(7, 10);
    expect(await caller.getConversation({ workspaceId: 10, conversationId })).toEqual({ conversationId, revision: 1, messages: [] });
    expect(service.readBrandContext).toHaveBeenCalledWith({ workspaceId: 10, conversationId, userId: 7 });
    await caller.readInterview({ workspaceId: 10, conversationId });
    expect(service.readInterview).toHaveBeenCalledWith({ workspaceId: 10, conversationId, userId: 7 });
    await caller.readDirectionBrief({ workspaceId: 10, conversationId });
    expect(service.readDirectionBrief).toHaveBeenCalledWith({ workspaceId: 10, conversationId, userId: 7 });
    await caller.readCallClock({ workspaceId: 10, conversationId });
    expect(service.readCallClock).toHaveBeenCalledWith({ workspaceId: 10, conversationId, userId: 7 });
    const call = { workspaceId: 10, conversationId, requestId: input.requestId, expectedRevision: 0, action: "start" as const };
    await caller.controlCallClock(call);
    expect(service.controlCallClock).toHaveBeenCalledWith(7, call);
    await caller.callTurn(input);
    expect(service.runCall).toHaveBeenCalledWith(7, input);
    const reflection = { workspaceId: 10, conversationId, expectedRevision: 1, fingerprint: "a".repeat(64) };
    await caller.confirmInterviewReflection(reflection);
    expect(service.confirmInterviewReflection).toHaveBeenCalledWith(7, reflection);
    const discovery = { workspaceId: 10, conversationId, expectedRevision: 1, area: "offer" as const, status: "unknown" as const, memoryId: null };
    await caller.reviewInterview(discovery);
    expect(service.reviewInterview).toHaveBeenCalledWith(7, discovery);
    const proposalReview = { workspaceId: 10, conversationId, expectedRevision: 1, proposalId: "a".repeat(64), action: "dismiss" as const };
    await caller.reviewInterviewProposal(proposalReview);
    expect(service.reviewInterviewProposal).toHaveBeenCalledWith(7, proposalReview);
    await caller.confirmInterviewReview({ workspaceId: 10, conversationId, expectedRevision: 2 });
    expect(service.confirmInterviewReview).toHaveBeenCalledWith(7, { workspaceId: 10, conversationId, expectedRevision: 2 });
    const add = { workspaceId: 10, conversationId, expectedRevision: 0,
      source: { title: "Notes", text: "Client notes", rightsBasis: "client_owned" as const, approvedForCoaching: true as const } };
    await caller.addSource(add); expect(service.addSource).toHaveBeenCalledWith(7, add);
    await caller.listSources({ workspaceId: 10, conversationId });
    expect(service.listSources).toHaveBeenCalledWith({ workspaceId: 10, conversationId, userId: 7 }, undefined);
    const withdraw = { workspaceId: 10, conversationId, sourceId: input.requestId, expectedRevision: 0 };
    await caller.withdrawSource(withdraw); expect(service.withdrawSource).toHaveBeenCalledWith(7, withdraw);
    await caller.listMemory({ workspaceId: 10, conversationId });
    expect(service.listMemory).toHaveBeenCalledWith({ workspaceId: 10, conversationId, userId: 7 }, undefined);
    const decision = { workspaceId: 10, conversationId, proposalId: input.requestId, expectedRevision: 0, decision: "confirmed" as const };
    await caller.decideMemory(decision);
    expect(service.decideMemory).toHaveBeenCalledWith(7, decision);
    await caller.turn(input);
    expect(service.run).toHaveBeenCalledWith(7, input);
  });
  it("rejects injected identity, grants and invalid inputs before runtime construction", async () => {
    const { caller, runtime } = fixture();
    await expect(caller.addSource({ workspaceId: 10, conversationId, expectedRevision: 0,
      source: { title: "Notes", text: "Client notes", rightsBasis: "client_owned", approvedForCoaching: false } } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.withdrawSource({ workspaceId: 10, conversationId, sourceId: input.requestId, expectedRevision: 0, userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.turn({ ...input, userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.createConversation({ workspaceId: 10, grants: [] } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.getConversation({ workspaceId: 10, conversationId: "bad" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.readDirectionBrief({ workspaceId: 10, conversationId, userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.decideMemory({ workspaceId: 10, conversationId, proposalId: input.requestId,
      expectedRevision: -1, decision: "confirmed" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.decideMemory({ workspaceId: 10, conversationId, proposalId: input.requestId,
      expectedRevision: 0, decision: "confirmed", userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(runtime).not.toHaveBeenCalled();
  });
  it("rejects injected discovery authority and answers without a source", async () => {
    const { caller, runtime } = fixture();
    const base = { workspaceId: 10, conversationId, expectedRevision: 0, area: "offer", status: "unknown", memoryId: null };
    await expect(caller.reviewInterview({ ...base, userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reviewInterview({ ...base, status: "answered" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.reviewInterviewProposal({ workspaceId: 10, conversationId, expectedRevision: 0, proposalId: "a".repeat(64), action: "accept", userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.confirmInterviewReview({ workspaceId: 10, conversationId, expectedRevision: 0, remainingMs: 3600000 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.confirmInterviewReflection({ workspaceId: 10, conversationId, expectedRevision: 0, fingerprint: "a".repeat(64), userId: 99 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.controlCallClock({ workspaceId: 10, conversationId, requestId: input.requestId, expectedRevision: 0, action: "start", allowanceMs: 99999999 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.callTurn({ ...input, call: true, remainingMs: 99999 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(runtime).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "NOT_FOUND", "CONFLICT"] as const)("preserves safe access/concurrency failure %s", async code => {
    const { caller, service } = fixture();
    vi.mocked(service.run).mockRejectedValue(new TRPCError({ code, message: "Safe failure" }));
    await expect(caller.turn(input)).rejects.toMatchObject({ code, message: "Safe failure" });
  });
  it("sanitises runtime and operation failures without attaching private causes", async () => {
    const { caller, runtime, service } = fixture();
    vi.mocked(service.run).mockRejectedValue(new Error("SQL with private client content"));
    try { await caller.turn(input); throw new Error("expected failure"); }
    catch (error) {
      expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect((error as TRPCError).cause).toBeUndefined();
      expect(String(error)).not.toContain("private client");
    }
    runtime.mockRejectedValue(new Error("secret provider configuration"));
    await expect(caller.createConversation({ workspaceId: 10 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
