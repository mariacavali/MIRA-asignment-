import { afterEach, describe, expect, it, vi } from "vitest";
import { MIRA_COACH_POLICY_VERSION } from "./policy";
import { createCoachObserver, langsmithEndpoint } from "./observability";
import { createCoachWorkflow, type CoachDependencies } from "./graph";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const event = { outcome: "success" as const, durationMs: 10, policyVersion: MIRA_COACH_POLICY_VERSION };

describe("private coach observability", () => {
  it("does nothing while disabled and accepts only trusted LangSmith destinations", async () => {
    const fetcher = vi.fn();
    await createCoachObserver({ enabled: false }, fetcher)(event);
    expect(fetcher).not.toHaveBeenCalled();
    expect(langsmithEndpoint("https://eu.api.smith.langchain.com/")).toBe("https://eu.api.smith.langchain.com");
    expect(() => langsmithEndpoint("https://attacker.example")).toThrow();
  });

  it("sends metadata-only telemetry and rejects injected client fields", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (_url, init) => {
      requests.push(init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : String(init?.body ?? ""));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const observer = createCoachObserver({ enabled: true, apiKey: "synthetic-key", project: "synthetic-project" }, fetcher);
    await observer(event);
    expect(requests.join("")).toContain("MIRA coach turn");
    expect(requests.join("")).not.toContain("synthetic-key");
    expect(requests.join("")).not.toContain("conversationId");
    await expect(observer({ ...event, prompt: "private-client-text" } as never)).rejects.toThrow();
    expect(requests.join("")).not.toContain("private-client-text");
  });

  it("suppresses automatic graph tracing even when global modern tracing is enabled", async () => {
    vi.stubEnv("LANGSMITH_TRACING", "true"); vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
    vi.stubEnv("LANGSMITH_API_KEY", "synthetic-key"); vi.stubEnv("LANGCHAIN_TRACING", "");
    const fetcher = vi.fn(async () => { throw new Error("Unexpected outbound request"); });
    vi.stubGlobal("fetch", fetcher);
    const dependencies: CoachDependencies = {
      loadAccess: async () => ({ context: { userId: 1, workspace: { id: 10, ownerUserId: 1, status: "active" }, memberships: [] },
        grants: [{ workspaceId: 10, capability: "brand_coaching", status: "active", startsAt: new Date(0), expiresAt: null }] }),
      beginTurn: async () => ({ kind: "claimed", leaseToken: "lease", expectedRevision: 0 }),
      readBrandContext: async scope => ({ ...scope, ownerUserId: 1, revision: 0, messages: [], evidence: [] }),
      draftReply: async () => ({ response: "Reply", memoryProposals: [] }),
      saveTurn: async input => input.result, abandonTurn: async () => {}, now: () => new Date(),
    };
    // Explicitly return only the context contract (the actor is not model-visible state).
    dependencies.readBrandContext = async scope => ({ workspaceId: scope.workspaceId, conversationId: scope.conversationId, ownerUserId: 1, revision: 0, messages: [], evidence: [] });
    const observer = vi.fn(async () => { throw new Error("Telemetry offline"); });
    const input = { workspaceId: 10, conversationId: "c030dd28-c3ee-471f-8bf3-c50a4a3a48fa", requestId: "d684f589-d2a5-4a8a-9e2a-c1f2af162635", message: "private-client-text" };
    expect(await createCoachWorkflow(dependencies, observer).run(1, input)).toMatchObject({ response: "Reply" });
    // The SDK may perform a credentialed GET /info during initialisation;
    // it must never emit graph state or a trace run through ambient tracing.
    for (const [url, init] of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(url).toBe("https://api.smith.langchain.com/info");
      expect(init.method).toBe("GET"); expect(init.body).toBeUndefined();
    }
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({ outcome: "success" }));
    expect(JSON.stringify(observer.mock.calls)).not.toContain("private-client-text");
    vi.stubEnv("LANGCHAIN_TRACING", "true");
    await expect(createCoachWorkflow(dependencies).run(1, input)).rejects.toThrow("Remove legacy");
  });
});
