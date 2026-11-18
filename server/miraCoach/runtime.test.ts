import { afterEach, describe, expect, it, vi } from "vitest";
import { syntheticKnowledgeBundle } from "../miraKnowledge/fixtures";
import type { CoachDependencies } from "./graph";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), store: vi.fn(), knowledgeSnapshot: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./store", () => ({ createCoachStore: mocks.store }));
vi.mock("../miraKnowledge/repository", () => ({ createKnowledgeRepository: () => ({ publishedSnapshot: mocks.knowledgeSnapshot }) }));
import { createCoachRuntime } from "./runtime";
import { createCoachRouter } from "./router";
import type { TrpcContext } from "../_core/context";
import { interviewCoverage } from "./coverage";

const input = { workspaceId: 10, conversationId: "c030dd28-c3ee-471f-8bf3-c50a4a3a48fa",
  requestId: "d684f589-d2a5-4a8a-9e2a-c1f2af162635", message: "Who is my audience?" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("configured coach runtime integration", () => {
  it("connects authenticated API, graph, structured provider adapter and persistence with telemetry disabled", async () => {
    vi.stubEnv("LANGCHAIN_TRACING", ""); vi.stubEnv("LANGCHAIN_VERBOSE", "false");
    const db = {}; mocks.getDb.mockResolvedValue(db);
    let grant = true;
    const ports: Omit<CoachDependencies, "draftReply"> = {
      loadAccess: vi.fn(async () => ({ context: { userId: 7, workspace: { id: 10, ownerUserId: 7, status: "active" }, memberships: [] },
        grants: grant ? [{ workspaceId: 10, capability: "brand_coaching", status: "active", startsAt: new Date(0), expiresAt: null }] : [] })),
      readBrandContext: vi.fn(async () => ({ workspaceId: 10, conversationId: input.conversationId, ownerUserId: 7,
        revision: 0, messages: [], evidence: [], configuration: { segment: "personal_brand", accessMethod: "standalone_brand", discoveryDepth: "deep", brandStage: "unknown", shootId: null, shootFormat: null } })),
      beginTurn: vi.fn(async () => ({ kind: "claimed", leaseToken: "lease", expectedRevision: 0 })),
      saveTurn: vi.fn(async value => value.result), abandonTurn: vi.fn(async () => {}), now: () => new Date(),
    };
    mocks.store.mockReturnValue(ports);
    const provider = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify({ response: "Who do you most enjoy helping?", memoryProposals: [{ text: "Exploring audience", kind: "interpreted" }] }),
    } }] }), { status: 200 }));
    vi.stubGlobal("fetch", provider);
    const bundle = syntheticKnowledgeBundle();
    mocks.knowledgeSnapshot.mockResolvedValue({ items: bundle.items, sources: bundle.sources, releaseId: input.conversationId, hash: "a".repeat(64), revision: 3 });
    const runtime = await createCoachRuntime({ MIRA_COACH_KNOWLEDGE_ENABLED: "true", MIRA_COACH_PROVIDER: "openai", OPENAI_API_KEY: "synthetic-test-key",
      MIRA_COACH_MODEL: "synthetic-model", MIRA_COACH_TELEMETRY_ENABLED: "false" });
    const caller = createCoachRouter({ enabled: () => true, runtime: async () => runtime }).createCaller({ user: { id: 7 }, req: {}, res: {} } as TrpcContext);
    const result = await caller.turn(input);
    expect(result.memoryProposals[0]).toMatchObject({ status: "pending_confirmation", sourceRequestId: input.requestId });
    expect(mocks.store).toHaveBeenCalledWith(db, expect.any(Function), { interviewEnabled: false, callEnabled: false });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result.knowledgeTrace?.selected[0].id).toBe("audience-before-style");
    expect(mocks.knowledgeSnapshot).toHaveBeenCalledTimes(1);
    const providerBody = JSON.parse(String((provider.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(providerBody.messages[1].content).toContain("Published expert guidance");
    expect(providerBody.messages[2].content).toContain("Private client evidence");
    expect(provider.mock.calls[0]).toBeDefined();
    expect(ports.saveTurn).toHaveBeenCalledWith(expect.objectContaining({ scope: { userId: 7, workspaceId: 10, conversationId: input.conversationId }, result }));
    grant = false;
    await expect(caller.turn(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("fails closed when SQL or provider configuration is absent", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(createCoachRuntime({})).rejects.toThrow("Coach database unavailable");
    expect(mocks.store).not.toHaveBeenCalled();
    mocks.getDb.mockResolvedValue({}); mocks.store.mockReturnValue({});
    // Reviewing memory must work even before a model key is configured.
    await expect(createCoachRuntime({ MIRA_COACH_PROVIDER: "openai" })).resolves.toHaveProperty("run");
  });
  it("routes timed API turns through active-call claims and the server-owned remaining-time port", async () => {
    mocks.getDb.mockResolvedValue({});
    const configuration = { segment: "personal_brand" as const, accessMethod: "standalone_brand" as const, discoveryDepth: "deep" as const, brandStage: "starting" as const, shootId: null, shootFormat: null };
    const ports = {
      loadAccess: vi.fn(async () => ({ context: { userId: 7, workspace: { id: 10, ownerUserId: 7, status: "active" }, memberships: [] }, grants: [{ workspaceId: 10, capability: "brand_coaching", status: "active", startsAt: new Date(0), expiresAt: null }] })),
      readBrandContext: vi.fn(async () => ({ workspaceId: 10, conversationId: input.conversationId, ownerUserId: 7, revision: 0, messages: [], evidence: [], configuration, interview: interviewCoverage(configuration, null, [])! })),
      remainingCallMs: vi.fn(async () => 120_000),
      beginTurn: vi.fn(async () => ({ kind: "claimed", leaseToken: "lease", expectedRevision: 0 })),
      saveTurn: vi.fn(async (value: Parameters<CoachDependencies["saveTurn"]>[0]) => value.result), abandonTurn: vi.fn(async () => {}), now: () => new Date(),
    };
    mocks.store.mockReturnValue(ports);
    const provider = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ response: "Let’s bring together what you’ve shared.", memoryProposals: [], interviewProposals: [], interviewStates: [] }) } }] })));
    vi.stubGlobal("fetch", provider);
    const runtime = await createCoachRuntime({ MIRA_COACH_INTERVIEW_ENABLED: "true", MIRA_COACH_CALL_ENABLED: "true", MIRA_COACH_PROVIDER: "openai", OPENAI_API_KEY: "synthetic", MIRA_COACH_TELEMETRY_ENABLED: "false" });
    const caller = createCoachRouter({ enabled: () => true, runtime: async () => runtime }).createCaller({ user: { id: 7 }, req: {}, res: {} } as TrpcContext);
    const result = await caller.callTurn(input);
    expect(ports.beginTurn).toHaveBeenCalledWith(expect.objectContaining({ call: true }));
    expect(ports.saveTurn).toHaveBeenCalledWith(expect.objectContaining({ call: true }));
    expect(ports.remainingCallMs).toHaveBeenCalledWith({ userId: 7, workspaceId: 10, conversationId: input.conversationId });
    expect(result.interviewPlan).toMatchObject({ phase: "reflection", remainingMs: 120_000, nextArea: null });
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
