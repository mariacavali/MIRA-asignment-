import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createKnowledgeRepository } from "../miraKnowledge/repository";
import { createKnowledgeRetriever } from "../miraKnowledge/retrieve";
import { createPineconeKnowledgeRetriever } from "../miraKnowledge/pineconeRetrieve";
import { preparePineconeSeedPlan } from "../miraKnowledge/pineconePlan";
import { syntheticKnowledgeBundle } from "../miraKnowledge/fixtures";
import { createCoachStore } from "./store";
import { interviewOpening } from "./interviewMethod";
import { createCoachWorkflow, type CoachScope, type CompletedCoachTurn, type TurnClaim } from "./graph";
import { planInterview } from "./questionPlanner";

const enabled = process.env.RUN_MIRA_DB_TESTS === "1";
describe.skipIf(!enabled)("durable coach SQL integration", () => {
  const name = `test_mira_coach_${randomUUID().replaceAll("-", "")}`;
  let admin: mysql.Connection | undefined;
  let pool: mysql.Pool;
  let db: ReturnType<typeof drizzle>;
  let store: ReturnType<typeof createCoachStore>;
  let scope: CoachScope;
  let clock = new Date("2026-10-15T12:00:00Z");
  let created = false;
  const result = (requestId: string, response = "Specific guidance"): CompletedCoachTurn => ({
    response, memoryProposals: [{ text: "Possible direction", kind: "interpreted", status: "pending_confirmation", sourceRequestId: requestId }],
  });
  const claim = (value: TurnClaim) => {
    if (value.kind !== "claimed") throw new Error("Expected a fresh claim");
    return value;
  };
  const begin = (requestId = randomUUID(), message = "My question") => store.beginTurn({ scope, requestId, message });
  const save = (requestId: string, lease: ReturnType<typeof claim>, response = "Specific guidance") => store.saveTurn({
    scope, requestId, message: "My question", ...lease, result: result(requestId, response),
  });

  beforeAll(async () => {
    const socketPath = process.env.MIRA_TEST_DB_SOCKET;
    if (!socketPath?.startsWith("/")) throw new Error("An isolated local socket is required.");
    admin = await mysql.createConnection({ socketPath, user: "root" });
    await admin.query(`CREATE DATABASE \`${name}\``); created = true;
    await admin.changeUser({ database: name });
    await admin.query("CREATE TABLE users (id int NOT NULL PRIMARY KEY)");
    await admin.query("INSERT INTO users (id) VALUES (1),(2),(3)");
    for (const file of ["0019_mira_brand_workspaces.sql", "0020_mira_coach_conversations.sql", "0021_mira_coach_sources.sql", "0022_mira_brand_directions.sql", "0023_mira_knowledge_catalogue.sql", "0024_mira_coach_interviews.sql", "0025_mira_coach_call_clocks.sql"]) {
      const sql = readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), "utf8");
      for (const statement of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await admin.query(statement);
    }
    pool = mysql.createPool({ socketPath, user: "root", database: name, connectionLimit: 4 });
    db = drizzle(pool);
  }, 15_000);

  beforeEach(async () => {
    clock = new Date("2026-10-15T12:00:00Z");
    store = createCoachStore(db, () => clock);
    for (const table of ["mira_knowledge_catalogue", "mira_knowledge_releases", "mira_knowledge_versions", "mira_knowledge_withdrawals"]) await pool.query(`DELETE FROM \`${table}\``);
    const [insert] = await pool.execute<mysql.ResultSetHeader>("INSERT INTO mira_brand_workspaces (ownerUserId,name) VALUES (1,'Test brand')");
    const workspaceId = insert.insertId;
    await pool.execute("INSERT INTO mira_workspace_grants (workspaceId,capability,status,startsAt,sourceReference) VALUES (?,'brand_coaching','active','2026-01-01','synthetic-test')", [workspaceId]);
    scope = { userId: 1, workspaceId, conversationId: await store.createConversation(1, workspaceId) };
  });

  afterAll(async () => {
    await pool?.end();
    try { if (admin && created) await admin.query(`DROP DATABASE \`${name}\``); }
    finally { await admin?.end(); }
  });

  it("resumes from SQL using a fresh store and deduplicates without drafting again", async () => {
    const draftReply = vi.fn(async () => ({ response: "Remembered reply", memoryProposals: [] }));
    const requestId = randomUUID();
    const input = { workspaceId: scope.workspaceId, conversationId: scope.conversationId, requestId, message: "My question" };
    const first = await createCoachWorkflow({ ...store, draftReply }).run(1, input);
    const fresh = createCoachStore(db, () => clock);
    expect(await fresh.readSpokenReply(scope, requestId)).toBe("Remembered reply");
    await expect(fresh.readSpokenReply({ ...scope, userId: 2 }, requestId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fresh.readSpokenReply({ ...scope, conversationId: await fresh.createConversation(1, scope.workspaceId) }, requestId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await createCoachWorkflow({ ...fresh, draftReply }).run(1, input)).toEqual(first);
    expect(draftReply).toHaveBeenCalledTimes(1);
    expect(await fresh.readBrandContext(scope)).toMatchObject({ revision: 1, messages: [
      { role: "client", content: "My question" }, { role: "assistant", content: "Remembered reply" },
    ], evidence: [] });
  });

  it.each(["personal", "personal_brand"] as const)("preserves the %s opener and first answer through save, reload and retry", async segment => {
    await store.configureDirection(1, { workspaceId: scope.workspaceId, conversationId: scope.conversationId,
      expectedRevision: 0, configuration: { segment, accessMethod: "paid_shoot", discoveryDepth: "light", brandStage: "unknown", shootId: null, shootFormat: null } });
    const opening = interviewOpening(segment)!;
    const empty = await store.readBrandContext(scope);
    expect(empty).toMatchObject({ revision: 1, entryOpening: opening, messages: [{ role: "assistant", content: opening.question }] });
    // Merely opening/reloading the conversation doesn't create a turn or spend a model call.
    expect((await createCoachStore(db, () => clock).readBrandContext(scope)).revision).toBe(1);
    const draftReply = vi.fn(async () => ({ response: "What mattered to you about that moment?", memoryProposals: [] }));
    const workflow = createCoachWorkflow({ ...store, draftReply });
    const input = { workspaceId: scope.workspaceId, conversationId: scope.conversationId, requestId: randomUUID(), message: "I was helping someone in my own way." };
    const completed = await workflow.run(1, input);
    expect(completed.interviewOpening).toEqual(opening);
    expect(draftReply).toHaveBeenCalledWith(expect.objectContaining({ messages: empty.messages, message: input.message }));
    const fresh = createCoachStore(db, () => clock);
    const resumed = await fresh.readBrandContext(scope);
    expect(resumed.entryOpening).toBeUndefined();
    expect(resumed.messages).toEqual([
      { role: "assistant", content: opening.question },
      { role: "client", content: input.message },
      { role: "assistant", content: completed.response },
    ]);
    expect(resumed.evidence).toEqual([]);
    expect(await createCoachWorkflow({ ...fresh, draftReply }).run(1, input)).toEqual(completed);
    expect(draftReply).toHaveBeenCalledTimes(1);
    await createCoachWorkflow({ ...fresh, draftReply }).run(1, { ...input, requestId: randomUUID(), message: "I would rather skip that." });
    const history = await fresh.readBrandContext(scope);
    expect(history.messages.filter(message => message.content === opening.question)).toHaveLength(1);
    expect(history.messages).toHaveLength(5);
    expect(history.evidence).toEqual([]);
  });

  it("rejects an in-flight duplicate and request-ID reuse with changed text", async () => {
    const requestId = randomUUID(); const lease = claim(await begin(requestId));
    await expect(begin(requestId)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(begin(requestId, "Different question")).rejects.toMatchObject({ code: "CONFLICT" });
    await save(requestId, lease);
    await expect(begin(requestId, "Different question")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("commits exactly one of two competing revisions", async () => {
    const one = randomUUID(), two = randomUUID();
    const leaseOne = claim(await begin(one)), leaseTwo = claim(await begin(two));
    const outcomes = await Promise.allSettled([save(one, leaseOne, "First"), save(two, leaseTwo, "Second")]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const failed = outcomes.find(item => item.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "CONFLICT" });
    expect(await store.readBrandContext(scope)).toMatchObject({ revision: 1 });
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT p.* FROM mira_coach_memory_proposals p JOIN mira_coach_turns t ON t.id=p.turnId WHERE t.conversationId=?", [scope.conversationId]);
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe("pending_confirmation");
  });

  it("recovers expired leases and prevents an old worker from saving or abandoning the new claim", async () => {
    const requestId = randomUUID(); const old = claim(await begin(requestId));
    clock = new Date(clock.getTime() + 121_000);
    const fresh = claim(await begin(requestId));
    await expect(save(requestId, old)).rejects.toMatchObject({ code: "CONFLICT" });
    await store.abandonTurn({ scope, requestId, leaseToken: old.leaseToken });
    await save(requestId, fresh);
    expect(await store.readBrandContext(scope)).toMatchObject({ revision: 1 });
  });

  it("releases failed model turns for a clean retry without adding history", async () => {
    const requestId = randomUUID();
    const input = { workspaceId: scope.workspaceId, conversationId: scope.conversationId, requestId, message: "My question" };
    const draftReply = vi.fn().mockRejectedValueOnce(new Error("model unavailable"))
      .mockResolvedValueOnce({ response: "Recovered", memoryProposals: [] });
    const workflow = createCoachWorkflow({ ...store, draftReply });
    await expect(workflow.run(1, input)).rejects.toThrow("model unavailable");
    expect(await store.readBrandContext(scope)).toMatchObject({ revision: 0, messages: [] });
    expect(await workflow.run(1, input)).toMatchObject({ response: "Recovered" });
    expect(await store.readBrandContext(scope)).toMatchObject({ revision: 1 });
  });

  it("rechecks revoked grants at commit and before serving cached replies", async () => {
    const requestId = randomUUID(); const lease = claim(await begin(requestId));
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(save(requestId, lease)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.execute("UPDATE mira_workspace_grants SET status='active' WHERE workspaceId=?", [scope.workspaceId]);
    await save(requestId, lease);
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(begin(requestId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps private conversations scoped to actor and workspace, including editors", async () => {
    await pool.execute("INSERT INTO mira_workspace_members (workspaceId,userId,role) VALUES (?,2,'editor')", [scope.workspaceId]);
    await expect(store.readBrandContext({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await store.createConversation(2, scope.workspaceId);
    expect(await store.readBrandContext({ ...scope, userId: 2, conversationId: own })).toMatchObject({ ownerUserId: 2, messages: [] });
    await expect(store.readBrandContext({ ...scope, workspaceId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(store.readBrandContext({ ...scope, userId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.execute("UPDATE mira_workspace_members SET status='revoked' WHERE workspaceId=? AND userId=2", [scope.workspaceId]);
    await expect(store.readBrandContext({ ...scope, userId: 2, conversationId: own })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bounds resumed history without treating pending proposals as confirmed facts", async () => {
    for (let i = 0; i < 51; i++) {
      const requestId = randomUUID(); await save(requestId, claim(await begin(requestId)), `Reply ${i}`);
    }
    const context = await store.readBrandContext(scope);
    expect(context.revision).toBe(51); expect(context.messages).toHaveLength(100);
    expect(context.messages[1].content).toBe("Reply 1");
    expect(context.messages[99].content).toBe("Reply 50");
    expect(context.evidence).toEqual([]);
  });
  async function proposal() {
    const requestId = randomUUID(); await save(requestId, claim(await begin(requestId)));
    return (await store.listMemory(scope)).proposals[0];
  }
  const decide = (proposalId: string, expectedRevision: number, decision: "confirmed" | "rejected" = "confirmed", userId = 1) =>
    store.decideMemory(userId, { workspaceId: scope.workspaceId, conversationId: scope.conversationId,
      proposalId, expectedRevision, decision });

  it("retrieves only explicitly confirmed memory and supports withdrawal without changing the original turn", async () => {
    const item = await proposal();
    expect(item).toMatchObject({ status: "pending_confirmation", kind: "interpreted" });
    expect((await store.readBrandContext(scope)).evidence).toEqual([]);
    expect(await decide(item.id, 1)).toEqual({ revision: 2, status: "confirmed" });
    expect((await createCoachStore(db).readBrandContext(scope)).evidence).toEqual([
      { id: item.id, text: item.text, kind: "interpreted", confirmed: true },
    ]);
    const draftReply = vi.fn(async () => ({ response: "Confirmed guidance", memoryProposals: [] }));
    await createCoachWorkflow({ ...store, draftReply }).run(1, { workspaceId: scope.workspaceId,
      conversationId: scope.conversationId, requestId: randomUUID(), message: "Use my confirmed direction" });
    expect(draftReply).toHaveBeenCalledWith(expect.objectContaining({ evidence: [expect.objectContaining({ id: item.id, confirmed: true })] }));
    expect(await decide(item.id, 3)).toEqual({ revision: 3, status: "confirmed" });
    await decide(item.id, 3, "rejected");
    expect((await store.readBrandContext(scope)).evidence).toEqual([]);
    expect((await store.listMemory(scope)).proposals[0].status).toBe("rejected");
    await expect(decide(item.id, 4)).rejects.toMatchObject({ code: "CONFLICT" });
    // Historical model output remains an immutable proposal, never a claim of approval.
    const prior = await begin(item.sourceRequestId);
    expect(prior).toMatchObject({ kind: "completed", result: { memoryProposals: [{ status: "pending_confirmation" }] } });
  });

  it("rejects stale decisions and invalidates drafts generated before memory confirmation", async () => {
    const item = await proposal();
    const requestId = randomUUID(); const lease = claim(await begin(requestId));
    await decide(item.id, 1);
    await expect(decide(item.id, 1, "rejected")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(save(requestId, lease)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await store.readBrandContext(scope)).evidence).toHaveLength(1);
  });

  it("scopes memory listing and decisions to the actor, conversation and current grants", async () => {
    const item = await proposal();
    await pool.execute("INSERT INTO mira_workspace_members (workspaceId,userId,role) VALUES (?,2,'editor')", [scope.workspaceId]);
    await expect(store.listMemory({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(decide(item.id, 1, "confirmed", 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = await store.createConversation(1, scope.workspaceId);
    await expect(store.decideMemory(1, { workspaceId: scope.workspaceId, conversationId: other,
      proposalId: item.id, expectedRevision: 0, decision: "confirmed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(store.listMemory(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decide(item.id, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("pages all proposals without leaking another conversation and bounds confirmed evidence", async () => {
    const requestId = randomUUID(); await save(requestId, claim(await begin(requestId)));
    const [turns] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM mira_coach_turns WHERE conversationId=?", [scope.conversationId]);
    for (let i = 0; i < 105; i++) {
      await pool.execute("INSERT INTO mira_coach_memory_proposals (id,turnId,text,kind,status) VALUES (?,?,?,'explicit','confirmed')",
        [randomUUID(), turns[0].id, `Confirmed ${i}`]);
    }
    const first = await store.listMemory(scope);
    expect(first.proposals).toHaveLength(100); expect(first.nextCursor).not.toBeNull();
    const second = await store.listMemory(scope, first.nextCursor!);
    expect(second.proposals).toHaveLength(6); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.proposals, ...second.proposals].map(p => p.id)).size).toBe(106);
    expect((await store.readBrandContext(scope)).evidence).toHaveLength(100);
    const other = await store.createConversation(1, scope.workspaceId);
    expect((await store.listMemory({ ...scope, conversationId: other })).proposals).toEqual([]);
    expect((await store.readBrandContext({ ...scope, conversationId: other })).evidence).toEqual([]);
  });

  const sourceInput = () => ({ workspaceId: scope.workspaceId, conversationId: scope.conversationId,
    expectedRevision: 0, source: { title: "Offer notes", text: "Portrait sessions for designers.",
      referenceUrl: "https://example.com/offer", rightsBasis: "client_owned" as const, approvedForCoaching: true as const } });

  it("persists approved source provenance and retrieves it as reference data for the coach", async () => {
    const added = await store.addSource(1, sourceInput());
    expect(added.revision).toBe(1);
    const list = await createCoachStore(db).listSources(scope);
    expect(list.sources[0]).toMatchObject({ id: added.sourceId, status: "active", rightsBasis: "client_owned" });
    const draftReply = vi.fn(async () => ({ response: "Which designers do you serve?", memoryProposals: [] }));
    await createCoachWorkflow({ ...store, draftReply }).run(1, { workspaceId: scope.workspaceId,
      conversationId: scope.conversationId, requestId: randomUUID(), message: "Help with portrait sessions" });
    expect(draftReply).toHaveBeenCalledWith(expect.objectContaining({ evidence: [expect.objectContaining({
      text: "Portrait sessions for designers.", confirmed: false,
      provenance: expect.objectContaining({ sourceId: added.sourceId, title: "Offer notes" }),
    })] }));
    expect((await store.readBrandContext(scope, "packaging")).evidence).toEqual([]);
  });

  it("withdraws sources from retrieval and invalidates replies using the old corpus", async () => {
    const added = await store.addSource(1, sourceInput());
    const requestId = randomUUID(); const lease = claim(await begin(requestId));
    const withdraw = { workspaceId: scope.workspaceId, conversationId: scope.conversationId,
      sourceId: added.sourceId, expectedRevision: 1 };
    expect(await store.withdrawSource(1, withdraw)).toEqual({ revision: 2 });
    expect((await store.readBrandContext(scope, "portrait")).evidence).toEqual([]);
    await expect(save(requestId, lease)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await store.listSources(scope)).sources[0]).toMatchObject({ status: "withdrawn", withdrawnAt: expect.any(Date) });
    expect(await store.withdrawSource(1, { ...withdraw, expectedRevision: 2 })).toEqual({ revision: 2 });
    const replacement = await store.addSource(1, { ...sourceInput(), expectedRevision: 2,
      source: { ...sourceInput().source, text: "Commercial portrait sessions for artists." } });
    expect(replacement.sourceId).not.toBe(added.sourceId);
    expect((await store.readBrandContext(scope, "portrait")).evidence).toHaveLength(1);
  });

  it("protects source operations from cross-actor, cross-conversation and revoked access", async () => {
    const added = await store.addSource(1, sourceInput());
    await pool.execute("INSERT INTO mira_workspace_members (workspaceId,userId,role) VALUES (?,2,'editor')", [scope.workspaceId]);
    await expect(store.listSources({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(store.addSource(2, { ...sourceInput(), expectedRevision: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await store.createConversation(2, scope.workspaceId);
    await expect(store.withdrawSource(2, { workspaceId: scope.workspaceId, conversationId: own,
      sourceId: added.sourceId, expectedRevision: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await store.readBrandContext({ ...scope, userId: 2, conversationId: own }, "portrait")).evidence).toEqual([]);
    await expect(store.addSource(1, sourceInput())).rejects.toMatchObject({ code: "CONFLICT" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(store.listSources(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(store.addSource(1, { ...sourceInput(), expectedRevision: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(store.withdrawSource(1, { workspaceId: scope.workspaceId, conversationId: scope.conversationId,
      sourceId: added.sourceId, expectedRevision: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("pages source records and enforces the active-source cap without losing older active evidence", async () => {
    for (let revision = 0; revision < 50; revision++) await store.addSource(1, { ...sourceInput(), expectedRevision: revision });
    const page1 = await store.listSources(scope);
    const page2 = await store.listSources(scope, page1.nextCursor!);
    const page3 = await store.listSources(scope, page2.nextCursor!);
    expect(new Set([...page1.sources, ...page2.sources, ...page3.sources].map(item => item.id)).size).toBe(50);
    expect(page3.nextCursor).toBeNull();
    await expect(store.addSource(1, { ...sourceInput(), expectedRevision: 50 })).rejects.toMatchObject({ code: "CONFLICT" });
    await store.withdrawSource(1, { workspaceId: scope.workspaceId, conversationId: scope.conversationId,
      sourceId: page1.sources[0].id, expectedRevision: 50 });
    await expect(store.addSource(1, { ...sourceInput(), expectedRevision: 51 })).resolves.toMatchObject({ revision: 52 });
  });

  it("lists only the actor's conversations with bounded pagination and fresh grant checks", async () => {
    for (let i = 0; i < 22; i++) await store.createConversation(1, scope.workspaceId);
    await pool.execute("INSERT INTO mira_workspace_members (workspaceId,userId,role) VALUES (?,2,'editor')", [scope.workspaceId]);
    const other = await store.createConversation(2, scope.workspaceId);
    const page1 = await store.listConversations(1, scope.workspaceId);
    const page2 = await store.listConversations(1, scope.workspaceId, page1.nextCursor!);
    const all = [...page1.conversations, ...page2.conversations];
    expect(page1.conversations).toHaveLength(20); expect(page2.conversations).toHaveLength(3);
    expect(new Set(all.map(row => row.id)).size).toBe(23); expect(page2.nextCursor).toBeNull();
    expect(all.some(row => row.id === other)).toBe(false);
    expect((await store.listConversations(2, scope.workspaceId)).conversations.map(row => row.id)).toEqual([other]);
    await expect(store.listConversations(3, scope.workspaceId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(store.listConversations(1, scope.workspaceId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  const configuration = { segment: "personal_brand" as const, accessMethod: "standalone_brand" as const, discoveryDepth: "deep" as const, brandStage: "unknown" as const, shootId: null, shootFormat: null };
  const apiScope = () => ({ workspaceId: scope.workspaceId, conversationId: scope.conversationId });
  async function directionFixture() {
    await store.configureDirection(1, { ...apiScope(), expectedRevision: 0, configuration });
    const source = await store.addSource(1, { ...apiScope(), expectedRevision: 1, source: { title: "Client brief", text: "Warm, direct, natural light", rightsBasis: "client_owned", approvedForCoaching: true } });
    const shared = { evidence: [{ kind: "source" as const, id: source.sourceId }], explanation: "Client brief", uncertainty: "", questionIds: [] as string[], knowledge: [] };
    const draft = { decisions: [
      { ...shared, id: randomUUID(), dimension: "brand.meaning" as const, value: { purpose: "Helping", audience: "Founders", intendedUse: ["Website"] } },
      { ...shared, id: randomUUID(), dimension: "voice.profile" as const, value: { traits: ["Warm"], avoid: ["Jargon"], examples: ["Welcome"] } },
      { ...shared, id: randomUUID(), dimension: "visual.direction" as const, value: { light: "Natural", colour: "Warm", composition: "Simple", references: ["Brief"], boundaries: ["No neon"] } },
    ], unknowns: [] };
    const saved = await store.saveDirection(1, { ...apiScope(), expectedRevision: 2, parentId: null, draft });
    return { draft, directionId: saved.directionId, sourceId: source.sourceId };
  }
  it("persists evidence-linked drafts, partial reviews, final approval and correction history", async () => {
    const { draft, directionId } = await directionFixture();
    await expect(store.approveDirection(1, { ...apiScope(), expectedRevision: 3, directionId })).rejects.toMatchObject({ code: "CONFLICT" });
    let revision = 3;
    for (const decision of draft.decisions) {
      const input = { ...apiScope(), directionId, decisionId: decision.id, expectedRevision: revision, requestId: randomUUID(), action: "accept" as const, reason: "Fits" };
      const reviewed = await store.reviewDirection(1, input);
      expect(await store.reviewDirection(1, input)).toEqual(reviewed);
      revision = reviewed.revision;
    }
    await store.approveDirection(1, { ...apiScope(), expectedRevision: revision, directionId });
    const fresh = createCoachStore(db, () => clock);
    expect((await fresh.readDirection(scope)).records[0]).toMatchObject({ state: "approved", stale: false });
    await fresh.saveDirection(1, { ...apiScope(), expectedRevision: revision + 1, parentId: directionId, draft: { ...draft, unknowns: ["Corrected direction pending review"] } });
    const records = (await fresh.readDirection(scope)).records;
    expect(records.map(r => r.state)).toEqual(["approved", "draft"]);
    expect(records[1].reviews).toEqual([]);
  });
  it("serialises competing reviews and invalidates approvals after source withdrawal", async () => {
    const { draft, directionId, sourceId } = await directionFixture();
    const input = { ...apiScope(), expectedRevision: 3, directionId, decisionId: draft.decisions[0].id, reason: "", action: "accept" as const };
    const outcomes = await Promise.allSettled([store.reviewDirection(1, { ...input, requestId: randomUUID() }), store.reviewDirection(1, { ...input, requestId: randomUUID() })]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    let revision = 4;
    for (const decision of draft.decisions.slice(1)) {
      await store.reviewDirection(1, { ...input, decisionId: decision.id, expectedRevision: revision++, requestId: randomUUID() });
    }
    await store.approveDirection(1, { ...apiScope(), expectedRevision: revision++, directionId });
    await store.withdrawSource(1, { ...apiScope(), expectedRevision: revision++, sourceId });
    expect((await store.readDirection(scope)).records[0].stale).toBe(true);
    await expect(store.reviewDirection(1, { ...input, expectedRevision: revision, requestId: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(store.saveDirection(1, { ...apiScope(), expectedRevision: revision, parentId: directionId, draft })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects foreign evidence, fabricated lineage and access after grant revocation", async () => {
    const { draft, directionId } = await directionFixture();
    const foreign = structuredClone(draft); foreign.decisions[0].evidence[0].id = randomUUID();
    await expect(store.saveDirection(1, { ...apiScope(), expectedRevision: 3, parentId: directionId, draft: foreign })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(store.readDirection({ ...apiScope(), userId: 2 })).rejects.toBeDefined();
    const linked = structuredClone(draft); linked.decisions[0].questionIds = [randomUUID()];
    await expect(store.saveDirection(1, { ...apiScope(), expectedRevision: 3, parentId: directionId, draft: linked })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(store.readDirection(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps configuration invalidation permanent and personal contracts separate without granting access", async () => {
    const { draft, directionId } = await directionFixture();
    const business = { ...configuration, segment: "small_business" as const, accessMethod: "social_plan" as const, brandStage: "established" as const };
    await store.configureDirection(1, { ...apiScope(), expectedRevision: 3, configuration: business });
    await store.configureDirection(1, { ...apiScope(), expectedRevision: 4, configuration });
    expect((await store.readDirection(scope)).records[0].stale).toBe(true);
    const personal = { ...configuration, segment: "personal" as const, accessMethod: "paid_shoot" as const };
    await store.configureDirection(1, { ...apiScope(), expectedRevision: 5, configuration: personal });
    await expect(store.saveDirection(1, { ...apiScope(), expectedRevision: 6, parentId: directionId, draft })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await store.saveDirection(1, { ...apiScope(), expectedRevision: 6, parentId: directionId, draft: { ...draft, decisions: draft.decisions.filter(d => d.dimension !== "voice.profile") } });
    const [grants] = await pool.execute<mysql.RowDataPacket[]>("SELECT capability FROM mira_workspace_grants WHERE workspaceId=?", [scope.workspaceId]);
    expect(grants.map(g => g.capability)).toEqual(["brand_coaching"]);
  });

  async function discoveryFixture() {
    const enabledStore = createCoachStore(db, () => clock, { interviewEnabled: true });
    await enabledStore.configureDirection(1, { ...apiScope(), expectedRevision: 0, configuration });
    return enabledStore;
  }
  async function callFixture(allowanceMs = 3_600_000) {
    await discoveryFixture();
    const service = createCoachStore(db, () => clock, { interviewEnabled: true, callEnabled: true, callAllowanceMs: allowanceMs });
    const control = async (action: "start" | "pause" | "resume" | "end" | "heartbeat", conversationId = scope.conversationId) => {
      const current = await service.readCallClock({ ...scope, conversationId });
      return service.controlCallClock(1, { ...apiScope(), conversationId, expectedRevision: current!.revision, requestId: randomUUID(), action });
    };
    const workflow = (draftReply: Parameters<typeof createCoachWorkflow>[0]["draftReply"]) => createCoachWorkflow({ ...service, draftReply, remainingInterviewMs: service.remainingCallMs }, undefined, { call: true });
    return { service, control, workflow };
  }
  it("keeps the clock off by default, personal-brand scoped, and absent until an explicit start", async () => {
    const { service } = await callFixture();
    expect(await store.readCallClock(scope)).toBeNull();
    expect(await service.readCallClock(scope)).toMatchObject({ state: "ready", usedMs: 0, remainingMs: 3_600_000 });
    const [rows] = await pool.execute<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM mira_coach_call_clocks WHERE workspaceId=?", [scope.workspaceId]);
    expect(rows[0].count).toBe(0);
    await expect(store.controlCallClock(1, { ...apiScope(), expectedRevision: 0, requestId: randomUUID(), action: "start" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.configureDirection(1, { ...apiScope(), expectedRevision: 1, configuration: { ...configuration, segment: "personal", accessMethod: "paid_shoot" } });
    expect(await service.readCallClock(scope)).toBeNull();
    await expect(service.controlCallClock(1, { ...apiScope(), expectedRevision: 0, requestId: randomUUID(), action: "start" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("persists active time and free pauses across fresh stores, restarts and conversations", async () => {
    const { service, control } = await callFixture();
    await control("start"); clock = new Date(clock.getTime() + 12_345);
    const paused = await control("pause");
    expect(paused).toMatchObject({ state: "paused", usedMs: 12_345, remainingMs: 3_587_655 });
    clock = new Date(clock.getTime() + 86_400_000);
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true, callEnabled: true, callAllowanceMs: 999 });
    expect(await fresh.readCallClock(scope)).toMatchObject({ usedMs: 12_345, allowanceMs: 3_600_000 });
    await fresh.controlCallClock(1, { ...apiScope(), expectedRevision: paused.revision, requestId: randomUUID(), action: "resume" });
    clock = new Date(clock.getTime() + 5000);
    const current = await fresh.readCallClock(scope);
    const ended = await fresh.controlCallClock(1, { ...apiScope(), expectedRevision: current!.revision, requestId: randomUUID(), action: "end" });
    const other = await fresh.createConversation(1, scope.workspaceId);
    const again = await fresh.controlCallClock(1, { ...apiScope(), conversationId: other, expectedRevision: ended.revision, requestId: randomUUID(), action: "start" });
    expect(again).toMatchObject({ conversationId: other, state: "active", usedMs: 17_345, remainingMs: 3_582_655 });
    expect((await service.readCallClock(scope))!.usedMs).toBe(17_345);
  });
  it("auto-pauses a disconnected clock and serialises competing browser commands", async () => {
    const { service, control } = await callFixture();
    const started = await control("start"); clock = new Date(clock.getTime() + 120_000);
    expect(await service.readCallClock(scope)).toMatchObject({ state: "paused", pauseReason: "connection_lost", usedMs: 30_000 });
    await expect(service.controlCallClock(1, { ...apiScope(), expectedRevision: started.revision, requestId: randomUUID(), action: "heartbeat" })).rejects.toMatchObject({ code: "CONFLICT" });
    const resumed = await control("resume");
    const other = await service.createConversation(1, scope.workspaceId);
    await expect(control("start", other)).rejects.toMatchObject({ code: "CONFLICT" });
    const results = await Promise.allSettled([service.controlCallClock(1, { ...apiScope(), expectedRevision: resumed.revision, requestId: randomUUID(), action: "pause" }),
      service.controlCallClock(1, { ...apiScope(), expectedRevision: resumed.revision, requestId: randomUUID(), action: "end" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    expect((await service.readCallClock(scope))!.usedMs).toBe(30_000);
  });
  it("deduplicates a lost control response without extending the lease or reusing its identity", async () => {
    const { service } = await callFixture();
    const input = { ...apiScope(), expectedRevision: 0, requestId: randomUUID(), action: "start" as const };
    const started = await service.controlCallClock(1, input); clock = new Date(clock.getTime() + 10_000);
    const replay = await service.controlCallClock(1, input);
    expect(replay).toMatchObject({ revision: started.revision, leaseUntilMs: started.leaseUntilMs, usedMs: 10_000 });
    await expect(service.controlCallClock(1, { ...input, action: "end" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("supplies server time to adaptive call planning and replays a finished turn without paid work", async () => {
    const { service, control, workflow } = await callFixture(240_000);
    await control("start");
    const draftReply = vi.fn(async () => ({ response: "Let’s reflect on what matters most to you.", memoryProposals: [] }));
    const input = { ...apiScope(), requestId: randomUUID(), message: "Here is my story." };
    const result = await workflow(draftReply).run(1, input);
    expect(result.interviewPlan).toMatchObject({ phase: "reflection", mode: "adaptive", nextArea: null, remainingMs: 240_000, progressPercent: 10 });
    await control("end");
    expect(await workflow(draftReply).run(1, input)).toEqual(result);
    expect(draftReply).toHaveBeenCalledTimes(1);
    // The separate existing text coach has no authority to extend call time.
    await createCoachWorkflow({ ...service, draftReply }).run(1, { ...input, requestId: randomUUID(), message: "A typed follow-up outside the call." });
    expect((await service.readCallClock(scope))!.state).toBe("ended");
  });
  it("blocks inactive calls before the model and rejects late replies after pause/resume", async () => {
    const { service, control, workflow } = await callFixture();
    const draftReply = vi.fn(async () => ({ response: "A reply", memoryProposals: [] }));
    const input = { ...apiScope(), requestId: randomUUID(), message: "Continue" };
    await expect(workflow(draftReply).run(1, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(draftReply).not.toHaveBeenCalled();
    await control("start");
    draftReply.mockImplementationOnce(async () => { await control("pause"); await control("resume"); return { response: "An obsolete reply", memoryProposals: [] }; });
    await expect(workflow(draftReply).run(1, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await service.readBrandContext(scope)).messages.some(message => message.content === "An obsolete reply")).toBe(false);
    expect(await workflow(draftReply).run(1, input)).toMatchObject({ response: "A reply" });
    expect(draftReply).toHaveBeenCalledTimes(2);
  });
  it("finishes one reply started inside the allowance and blocks the next model call at exhaustion", async () => {
    const { service, control, workflow } = await callFixture(10_000);
    await control("start");
    const draftReply = vi.fn(async () => { clock = new Date(clock.getTime() + 15_000); return { response: "Your final reflection is saved.", memoryProposals: [] }; });
    const input = { ...apiScope(), requestId: randomUUID(), message: "Let’s wrap up." };
    expect(await workflow(draftReply).run(1, input)).toMatchObject({ response: "Your final reflection is saved." });
    expect(await service.readCallClock(scope)).toMatchObject({ state: "exhausted", usedMs: 10_000, remainingMs: 0 });
    await expect(workflow(draftReply).run(1, { ...input, requestId: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(control("start")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(draftReply).toHaveBeenCalledTimes(1);
  });
  it("rejects concurrent call turns, wrong actors, revoked access and late disconnected replies", async () => {
    const { service, control, workflow } = await callFixture();
    await control("start");
    const requestId = randomUUID(), message = "A pending question";
    const lease = claim(await service.beginTurn({ scope, requestId, message, call: true }));
    const draftReply = vi.fn(async () => ({ response: "No extra call", memoryProposals: [] }));
    await expect(workflow(draftReply).run(1, { ...apiScope(), requestId: randomUUID(), message })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(draftReply).not.toHaveBeenCalled();
    await service.abandonTurn({ scope, requestId, leaseToken: lease.leaseToken });
    const late = vi.fn(async () => { clock = new Date(clock.getTime() + 31_000); return { response: "A disconnected reply", memoryProposals: [] }; });
    await expect(workflow(late).run(1, { ...apiScope(), requestId: randomUUID(), message })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.readCallClock({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(service.readCallClock(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.controlCallClock(1, { ...apiScope(), expectedRevision: 2, requestId: randomUUID(), action: "resume" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  async function discoveryAnswer(enabledStore: ReturnType<typeof createCoachStore>) {
    const draftReply = async () => ({ response: "Let’s check that meaning.", memoryProposals: [{ text: "The client's stated discovery answer", kind: "explicit" as const }] });
    await createCoachWorkflow({ ...enabledStore, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "Here is my answer." });
    return (await enabledStore.listMemory(scope)).proposals[0];
  }
  async function mappedAnswer(enabledStore: ReturnType<typeof createCoachStore>, text = "I want a website that explains my offer.") {
    const draftReply = vi.fn(async () => ({ response: "Who do you want to reach?", memoryProposals: [{ text, kind: "explicit" as const }],
      interviewProposals: [{ area: "intended_use" as const, memoryId: null, memoryProposalIndex: 0 }] }));
    const input = { ...apiScope(), requestId: randomUUID(), message: text };
    const workflow = createCoachWorkflow({ ...enabledStore, draftReply });
    const completed = await workflow.run(1, input);
    const review = await enabledStore.readInterview(scope);
    const proposal = review.coverage!.proposals![0];
    return { draftReply, input, completed, proposal, review };
  }
  it("prepares a read-only source brief only after exact reflection confirmation and survives reload", async () => {
    const service = await discoveryFixture(), text = "I want a website that explains my offer.";
    await mappedAnswer(service, text);
    expect(await service.readDirectionBrief(scope)).toMatchObject({ state: "needs_confirmation", statements: [] });
    const review = await service.readInterview(scope);
    await service.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: review.revision, fingerprint: review.reflection!.fingerprint });
    const approvedReflection = await service.readInterview(scope), fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    const brief = await fresh.readDirectionBrief(scope);
    expect(brief).toMatchObject({ state: "collecting", revision: approvedReflection.revision, reflectionFingerprint: approvedReflection.reflection!.fingerprint,
      statements: [{ text, areas: ["intended_use"] }] });
    expect((await fresh.readDirectionBrief(scope)).fingerprint).toBe(brief.fingerprint);
    expect((await fresh.readInterview(scope)).revision).toBe(approvedReflection.revision);
    expect((await fresh.readDirection(scope)).records).toEqual([]);
    await expect(fresh.readDirectionBrief({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.execute("INSERT INTO mira_workspace_members (workspaceId,userId,role) VALUES (?,2,'editor')", [scope.workspaceId]);
    await expect(fresh.readDirectionBrief({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(fresh.readDirectionBrief(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("withdraws old preparation during corrections and rechecks rejected meaning and service configuration", async () => {
    const service = await discoveryFixture(); await mappedAnswer(service);
    const before = await service.readInterview(scope);
    await service.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: before.revision, fingerprint: before.reflection!.fingerprint });
    const old = await service.readDirectionBrief(scope), correction = "Actually, the website should help people book my workshops.";
    await createCoachWorkflow({ ...service, draftReply: async () => ({ response: "What would you like them to know about the workshops?",
      memoryProposals: [{ text: correction, kind: "explicit" }], interviewProposals: [{ area: "intended_use", memoryId: null, memoryProposalIndex: 0, correctionQuote: correction }] }) })
      .run(1, { ...apiScope(), requestId: randomUUID(), message: correction });
    expect(await service.readDirectionBrief(scope)).toMatchObject({ state: "needs_confirmation", statements: [] });
    const pending = await service.readInterview(scope);
    await service.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: pending.revision, fingerprint: pending.reflection!.fingerprint });
    const updated = await service.readDirectionBrief(scope);
    expect(updated.statements.map(item => item.text)).toEqual([correction]); expect(updated.fingerprint).not.toBe(old.fingerprint);
    await service.decideMemory(1, { ...apiScope(), expectedRevision: updated.revision, proposalId: updated.statements[0].memoryId, decision: "rejected" });
    const rejected = await service.readDirectionBrief(scope);
    expect(rejected.statements).toEqual([]); expect(rejected.state).toBe("needs_confirmation");
    await service.configureDirection(1, { ...apiScope(), expectedRevision: rejected.revision, configuration: { ...configuration, segment: "personal", accessMethod: "paid_shoot" } });
    expect(await service.readDirectionBrief(scope)).toMatchObject({ state: "unavailable", statements: [] });
  });
  it("runs a multi-area answer and one reflection review without manual memory or category decisions", async () => {
    const enabledStore = await discoveryFixture();
    const text = "I illustrate book covers for independent publishers, and I want a portfolio that explains this work.";
    const draftReply = vi.fn(async () => ({ response: "What do you most want those publishers to understand about the work?",
      memoryProposals: [{ text, kind: "explicit" as const }, { text: "An unrelated tentative idea that is not part of the reflection", kind: "interpreted" as const }],
      interviewProposals: (["offer", "audience", "intended_use"] as const).map(area => ({ area, memoryId: null, memoryProposalIndex: 0 })) }));
    await createCoachWorkflow({ ...enabledStore, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: text });
    const before = await enabledStore.readInterview(scope);
    expect(before.coverage).toMatchObject({ answered: 0, progressPercent: 10 });
    expect(before.reflection!.answers).toHaveLength(3);
    expect(new Set(before.reflection!.answers.map(answer => answer.memoryId)).size).toBe(1);
    // No client operation has confirmed memory or assigned a category.
    expect((await enabledStore.listMemory(scope)).proposals.every(memory => memory.status === "pending_confirmation")).toBe(true);
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    await fresh.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: before.revision, fingerprint: before.reflection!.fingerprint });
    const after = await fresh.readInterview(scope);
    expect(after).toMatchObject({ coverage: { answered: 3, unresolved: 5, reviewed: true, progressPercent: 50 }, reflection: { reviewed: true } });
    expect(after.coverage!.areas.filter(area => area.status === "missing")).toHaveLength(5);
    expect((await fresh.listMemory(scope)).proposals.filter(memory => memory.status === "confirmed")).toHaveLength(1);
    expect(planInterview(after.coverage!, configuration)).toMatchObject({ mode: "adaptive", phase: "discovery", nextArea: null, question: null });
    expect(draftReply).toHaveBeenCalledTimes(1);
    expect((await fresh.readDirection(scope)).records).toEqual([]);
  });
  it("revises provisional meaning through conversation before the single reflection review", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    const correction = "Actually, the portfolio is for getting workshop bookings.";
    const draftReply = async () => ({ response: "What kind of workshop would you like people to book?", memoryProposals: [{ text: correction, kind: "explicit" as const }],
      interviewProposals: [{ area: "intended_use", memoryId: null, memoryProposalIndex: 0, correctionQuote: correction }] });
    await createCoachWorkflow({ ...enabledStore, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: correction });
    const review = await enabledStore.readInterview(scope);
    expect(review.coverage!.proposals).toHaveLength(1);
    expect(review.reflection!.answers[0]).toMatchObject({ text: correction, status: "proposed" });
    expect(review.reflection!.answers[0].memoryId).not.toBe(proposal.memoryId);
    expect((await enabledStore.readBrandContext(scope)).interviewWorkingEvidence).toEqual([{ area: "intended_use", memoryId: review.reflection!.answers[0].memoryId, text: correction, kind: "explicit" }]);
    await enabledStore.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: review.revision, fingerprint: review.reflection!.fingerprint });
    expect((await enabledStore.readInterview(scope)).coverage).toMatchObject({ answered: 1, reviewed: true, progressPercent: 30 });
    expect((await enabledStore.listMemory(scope)).proposals.find(memory => memory.id === proposal.memoryId)!.status).toBe("pending_confirmation");
  });
  it("holds corrected confirmed meaning out of model evidence until the revised reflection is approved", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    const first = await enabledStore.readInterview(scope);
    await enabledStore.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: first.revision, fingerprint: first.reflection!.fingerprint });
    const correction = "No, I want to promote workshops rather than my illustration offer.";
    await createCoachWorkflow({ ...enabledStore, draftReply: async () => ({ response: "What matters most about these workshops?", memoryProposals: [{ text: "The goal is workshop promotion.", kind: "explicit" as const }],
      interviewProposals: [{ area: "intended_use", memoryId: null, memoryProposalIndex: 0, correctionQuote: correction }] }) }).run(1, { ...apiScope(), requestId: randomUUID(), message: correction });
    const pending = await enabledStore.readInterview(scope), context = await enabledStore.readBrandContext(scope);
    expect(pending.coverage).toMatchObject({ answered: 0, reviewed: false, progressPercent: 10 });
    expect(pending.coverage!.areas[0].status).toBe("needs_review");
    expect(context.evidence.some(item => item.id === proposal.memoryId)).toBe(false);
    expect(context.interviewWorkingEvidence![0].text).toBe("The goal is workshop promotion.");
    await enabledStore.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: pending.revision, fingerprint: pending.reflection!.fingerprint });
    const memory = await enabledStore.listMemory(scope);
    expect(memory.proposals.find(item => item.id === proposal.memoryId)!.status).toBe("rejected");
    expect((await enabledStore.readBrandContext(scope)).evidence.map(item => item.text)).toEqual(["The goal is workshop promotion."]);
    expect((await enabledStore.readInterview(scope)).reflection!.reviewed).toBe(true);
  });
  it("binds reflection approval to exact text, current revision and current configuration", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    const before = await enabledStore.readInterview(scope), input = { ...apiScope(), expectedRevision: before.revision, fingerprint: before.reflection!.fingerprint };
    await expect(enabledStore.confirmInterviewReflection(1, { ...input, fingerprint: "0".repeat(64) })).rejects.toMatchObject({ code: "CONFLICT" });
    await pool.execute("UPDATE mira_coach_memory_proposals SET text=? WHERE id=?", ["Changed text", proposal.memoryId]);
    await expect(enabledStore.confirmInterviewReflection(1, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await pool.execute("UPDATE mira_coach_memory_proposals SET text=? WHERE id=?", [before.reflection!.answers[0].text, proposal.memoryId]);
    const other = await enabledStore.createConversation(1, scope.workspaceId);
    await enabledStore.configureDirection(1, { ...apiScope(), conversationId: other, expectedRevision: 0, configuration: { ...configuration, brandStage: "established" } });
    await expect(enabledStore.confirmInterviewReflection(1, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await enabledStore.listMemory(scope)).proposals[0].status).toBe("pending_confirmation");
  });
  it("serialises reflection reviews and checks ownership/grants without requiring every topic answered", async () => {
    const enabledStore = await discoveryFixture();
    const empty = await enabledStore.readInterview(scope);
    await expect(enabledStore.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: empty.revision, fingerprint: empty.reflection!.fingerprint })).rejects.toMatchObject({ code: "CONFLICT" });
    await mappedAnswer(enabledStore);
    const before = await enabledStore.readInterview(scope), input = { ...apiScope(), expectedRevision: before.revision, fingerprint: before.reflection!.fingerprint };
    await expect(enabledStore.confirmInterviewReflection(2, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const results = await Promise.allSettled([enabledStore.confirmInterviewReflection(1, input), enabledStore.confirmInterviewReflection(1, input)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    const after = await enabledStore.readInterview(scope);
    expect(await enabledStore.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: after.revision, fingerprint: after.reflection!.fingerprint })).toEqual({ revision: after.revision });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(enabledStore.confirmInterviewReflection(1, { ...apiScope(), expectedRevision: after.revision, fingerprint: after.reflection!.fingerprint })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("records conversational skips/uncertainty privately without manual classification or false completion", async () => {
    const enabledStore = await discoveryFixture();
    const message = "I'd rather skip visual references. I'm not sure about my audience yet.";
    await createCoachWorkflow({ ...enabledStore, draftReply: async () => ({ response: "What would make this work useful to you?", memoryProposals: [],
      interviewStates: [{ area: "visual_preferences", status: "declined", quote: "I'd rather skip visual references." }, { area: "audience", status: "unknown", quote: "I'm not sure about my audience yet." }] }) }).run(1, { ...apiScope(), requestId: randomUUID(), message });
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true }), review = await fresh.readInterview(scope);
    expect(review.coverage).toMatchObject({ answered: 0, reviewed: false, progressPercent: 10 });
    expect(review.coverage!.areas).toEqual(expect.arrayContaining([{ area: "visual_preferences", status: "declined", memoryId: null, answer: null }, { area: "audience", status: "unknown", memoryId: null, answer: null }]));
    expect((await fresh.listMemory(scope)).proposals).toEqual([]);
    const workflow = createCoachWorkflow({ ...fresh, draftReply: async () => ({ response: "Continuing naturally.", memoryProposals: [] }) });
    for (let i = 0; i < 51; i++) await workflow.run(1, { ...apiScope(), requestId: randomUUID(), message: `Synthetic continuation ${i}` });
    expect((await fresh.readBrandContext(scope)).interview!.areas.find(item => item.area === "audience")!.status).toBe("unknown");
    // The client may voluntarily revisit, with their own words as provenance.
    const revisit = "Actually, I'd like to reach independent designers.";
    await createCoachWorkflow({ ...fresh, draftReply: async () => ({ response: "What would you like them to understand about your work?", memoryProposals: [{ text: "I would like to reach independent designers.", kind: "explicit" as const }],
      interviewProposals: [{ area: "audience", memoryId: null, memoryProposalIndex: 0, correctionQuote: revisit }] }) }).run(1, { ...apiScope(), requestId: randomUUID(), message: revisit });
    const updated = await fresh.readInterview(scope);
    expect(updated.reflection!.answers[0]).toMatchObject({ area: "audience", status: "proposed" });
    expect(updated.coverage!.areas.find(item => item.area === "visual_preferences")!.status).toBe("declined");
    expect(updated.coverage!.progressPercent).toBe(10);
  });
  it("persists pending semantic proposals, requires both reviews, and replays without another model call", async () => {
    const enabledStore = await discoveryFixture();
    const { draftReply, input, completed, proposal } = await mappedAnswer(enabledStore);
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ answered: 0, progressPercent: 10,
      proposals: [{ id: proposal.id, answer: input.message, memoryStatus: "pending_confirmation", sourceRequestId: input.requestId }] });
    await expect(fresh.reviewInterviewProposal(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.id, action: "accept" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await fresh.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.memoryId, decision: "confirmed" });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ answered: 0, progressPercent: 10, proposals: [{ memoryStatus: "confirmed" }] });
    expect((await fresh.readBrandContext(scope)).interview?.proposals?.[0].memoryId).toBe(proposal.memoryId);
    await fresh.reviewInterviewProposal(1, { ...apiScope(), expectedRevision: 3, proposalId: proposal.id, action: "accept" });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ answered: 1, progressPercent: 20, reviewed: false, proposals: [] });
    expect((await fresh.readDirection(scope)).records).toEqual([]);
    expect(await createCoachWorkflow({ ...fresh, draftReply }).run(1, input)).toEqual(completed);
    expect(draftReply).toHaveBeenCalledTimes(1);
    expect((await fresh.listMemory(scope)).proposals).toHaveLength(1);
    await expect(fresh.reviewInterviewProposal(1, { ...apiScope(), expectedRevision: 4, proposalId: proposal.id, action: "accept" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("keeps a dismissal durable and does not reoffer identical meaning as a new memory", async () => {
    const enabledStore = await discoveryFixture(), { proposal, input } = await mappedAnswer(enabledStore);
    await enabledStore.reviewInterviewProposal(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.id, action: "dismiss" });
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    const draftReply = async () => ({ response: "What would you like to add?", memoryProposals: [{ text: input.message, kind: "explicit" as const }],
      interviewProposals: [{ area: "intended_use" as const, memoryId: null, memoryProposalIndex: 0 }] });
    await createCoachWorkflow({ ...fresh, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "Continue" });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ answered: 0, progressPercent: 10, proposals: [] });
    // Dismissing a link does not reject or approve the underlying client memory.
    expect((await fresh.listMemory(scope)).proposals.every(item => item.status === "pending_confirmation")).toBe(true);
  });
  it("invalidates proposals and accepted links when their exact answer changes or is rejected", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.memoryId, decision: "confirmed" });
    await pool.execute("UPDATE mira_coach_memory_proposals SET text=? WHERE id=?", ["Corrected meaning", proposal.memoryId]);
    expect((await enabledStore.readInterview(scope)).coverage?.proposals).toEqual([]);
    await expect(enabledStore.reviewInterviewProposal(1, { ...apiScope(), expectedRevision: 3, proposalId: proposal.id, action: "accept" })).rejects.toMatchObject({ code: "CONFLICT" });
    await enabledStore.reviewInterview(1, { ...apiScope(), expectedRevision: 3, area: "intended_use", status: "answered", memoryId: proposal.memoryId });
    await pool.execute("UPDATE mira_coach_memory_proposals SET text=? WHERE id=?", ["Changed again", proposal.memoryId]);
    expect((await enabledStore.readInterview(scope)).coverage).toMatchObject({ answered: 0, progressPercent: 10, areas: expect.arrayContaining([expect.objectContaining({ area: "intended_use", status: "needs_review" })]) });
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 4, proposalId: proposal.memoryId, decision: "rejected" });
    expect((await enabledStore.readInterview(scope)).coverage?.proposals).toEqual([]);
  });
  it("serialises conflicting proposal reviews and rejects a reply drafted before a dismissal", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.memoryId, decision: "confirmed" });
    const review = { ...apiScope(), expectedRevision: 3, proposalId: proposal.id };
    const outcomes = await Promise.allSettled([enabledStore.reviewInterviewProposal(1, { ...review, action: "accept" }), enabledStore.reviewInterviewProposal(1, { ...review, action: "dismiss" })]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(item => item.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    // A second proposal is dismissed while a normal reply is being generated.
    const context = await enabledStore.readBrandContext(scope);
    await enabledStore.reviewInterview(1, { ...apiScope(), expectedRevision: context.revision, area: "intended_use", status: "needs_review", memoryId: null });
    const second = await mappedAnswer(enabledStore, "I want a new portfolio.");
    const draftReply = async () => {
      await enabledStore.reviewInterviewProposal(1, { ...apiScope(), expectedRevision: second.review.revision, proposalId: second.proposal.id, action: "dismiss" });
      return { response: "Unsaved outdated reply", memoryProposals: [] };
    };
    await expect(createCoachWorkflow({ ...enabledStore, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "Continue" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await enabledStore.readBrandContext(scope)).messages.some(item => item.content === "Unsaved outdated reply")).toBe(false);
  });
  it("rejects foreign, unconfirmed and invalid indexed sources at the durable save boundary", async () => {
    const enabledStore = await discoveryFixture(), memory = await discoveryAnswer(enabledStore);
    const other = await enabledStore.createConversation(1, scope.workspaceId);
    for (const target of [{ memoryId: memory.id, memoryProposalIndex: null }, { memoryId: null, memoryProposalIndex: 8 }]) {
      const requestId = randomUUID(), message = "Invalid source";
      const lease = claim(await enabledStore.beginTurn({ scope, requestId, message }));
      const coverage = (await enabledStore.readInterview(scope)).coverage!;
      await expect(enabledStore.saveTurn({ scope, requestId, message, ...lease, result: { response: "Must not save", memoryProposals: [],
        interviewPlan: planInterview(coverage, configuration), interviewProposals: [{ area: "intended_use", ...target }] } })).rejects.toThrow();
      await enabledStore.abandonTurn({ scope, requestId, leaseToken: lease.leaseToken });
    }
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: memory.id, decision: "confirmed" });
    const otherScope = { ...scope, conversationId: other }, requestId = randomUUID(), message = "Foreign source";
    const lease = claim(await enabledStore.beginTurn({ scope: otherScope, requestId, message }));
    const coverage = (await enabledStore.readInterview(otherScope)).coverage!;
    await expect(enabledStore.saveTurn({ scope: otherScope, requestId, message, ...lease, result: { response: "Must not save", memoryProposals: [],
      interviewPlan: planInterview(coverage, configuration), interviewProposals: [{ area: "intended_use", memoryId: memory.id, memoryProposalIndex: null }] } })).rejects.toThrow("source");
    expect((await enabledStore.readInterview(otherScope)).coverage?.proposals).toEqual([]);
    expect((await enabledStore.listMemory(otherScope)).proposals).toEqual([]);
  });
  it("keeps pending proposals outside the history window and supports confirmed existing memory", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    const workflow = createCoachWorkflow({ ...enabledStore, draftReply: async () => ({ response: "Continuing", memoryProposals: [] }) });
    for (let i = 0; i < 51; i++) await workflow.run(1, { ...apiScope(), requestId: randomUUID(), message: `Synthetic continuation ${i}` });
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    const review = await fresh.readInterview(scope);
    expect(review.coverage?.proposals?.[0].id).toBe(proposal.id);
    expect((await fresh.readBrandContext(scope)).messages).toHaveLength(100);
    await fresh.decideMemory(1, { ...apiScope(), expectedRevision: review.revision, proposalId: proposal.memoryId, decision: "confirmed" });
    await createCoachWorkflow({ ...fresh, draftReply: async () => ({ response: "Check where this fits.", memoryProposals: [],
      interviewProposals: [{ area: "offer", memoryId: proposal.memoryId, memoryProposalIndex: null }] }) }).run(1, { ...apiScope(), requestId: randomUUID(), message: "This is also relevant to the offer." });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ answered: 0, progressPercent: 10, proposals: [expect.objectContaining({ area: "intended_use" }), expect.objectContaining({ area: "offer", memoryStatus: "confirmed" })] });
  });
  it("enforces ownership, revoked access and current service for suggestion review", async () => {
    const enabledStore = await discoveryFixture(), { proposal } = await mappedAnswer(enabledStore);
    const input = { ...apiScope(), expectedRevision: 2, proposalId: proposal.id, action: "dismiss" as const };
    await expect(enabledStore.reviewInterviewProposal(2, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await enabledStore.createConversation(1, scope.workspaceId);
    await expect(enabledStore.reviewInterviewProposal(1, { ...input, conversationId: other, expectedRevision: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
    await enabledStore.configureDirection(1, { ...apiScope(), conversationId: other, expectedRevision: 0, configuration: { ...configuration, brandStage: "established" } });
    await expect(enabledStore.reviewInterviewProposal(1, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await enabledStore.readInterview(scope)).coverage?.proposals).toEqual([]);
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(enabledStore.reviewInterviewProposal(1, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps discovery off by default and requires confirmed, scoped answers when enabled", async () => {
    const enabledStore = await discoveryFixture();
    expect((await store.readInterview(scope)).coverage).toBeNull();
    expect((await enabledStore.readInterview(scope)).coverage).toMatchObject({ answered: 0, progressPercent: 10 });
    const proposal = await discoveryAnswer(enabledStore);
    const review = { ...apiScope(), expectedRevision: 2, area: "intended_use" as const, status: "answered" as const, memoryId: proposal.id };
    await expect(enabledStore.reviewInterview(1, review)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.id, decision: "confirmed" });
    await enabledStore.reviewInterview(1, { ...review, expectedRevision: 3 });
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ answered: 1, progressPercent: 20 });
    const context = await fresh.readBrandContext(scope);
    expect(context.interview?.areas[0]).toMatchObject({ memoryId: proposal.id, status: "answered", answer: proposal.text });
    const reply = await createCoachWorkflow({ ...fresh, draftReply: async () => ({ response: "Let’s explore your offer.", memoryProposals: [] }) }).run(1, { ...apiScope(), requestId: randomUUID(), message: "Continue" });
    expect(reply.interviewPlan).toMatchObject({ nextArea: null, mode: "adaptive", answered: 1, remainingMs: null });
  });
  it("serialises coverage edits and rejects an answer drafted against older coverage", async () => {
    const enabledStore = await discoveryFixture();
    const requestId = randomUUID();
    const lease = claim(await enabledStore.beginTurn({ scope, requestId, message: "My question" }));
    const input = { ...apiScope(), expectedRevision: 1, area: "offer" as const, status: "unknown" as const, memoryId: null };
    const outcomes = await Promise.allSettled([enabledStore.reviewInterview(1, input), enabledStore.reviewInterview(1, { ...input, status: "declined" })]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(item => item.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    await expect(enabledStore.saveTurn({ scope, requestId, message: "My question", ...lease, result: result(requestId) })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await enabledStore.readInterview(scope)).coverage?.answered).toBe(0);
  });
  it("reviews unresolved areas honestly and reopens review after a changed decision", async () => {
    const enabledStore = await discoveryFixture();
    await expect(enabledStore.confirmInterviewReview(1, { ...apiScope(), expectedRevision: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    const areas = (await enabledStore.readInterview(scope)).coverage!.areas;
    let revision = 1;
    for (const { area } of areas) await enabledStore.reviewInterview(1, { ...apiScope(), expectedRevision: revision++, area, status: "unknown", memoryId: null });
    await enabledStore.confirmInterviewReview(1, { ...apiScope(), expectedRevision: revision++ });
    const fresh = createCoachStore(db, () => clock, { interviewEnabled: true });
    expect((await fresh.readInterview(scope)).coverage).toMatchObject({ reviewed: true, answered: 0, unresolved: 8, progressPercent: 20 });
    expect((await fresh.readDirection(scope)).records).toEqual([]);
    await fresh.reviewInterview(1, { ...apiScope(), expectedRevision: revision++, area: "offer", status: "needs_review", memoryId: null });
    expect((await fresh.readInterview(scope)).coverage?.reviewed).toBe(false);
    await expect(fresh.confirmInterviewReview(1, { ...apiScope(), expectedRevision: revision })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("invalidates answered coverage after memory withdrawal or a changed service configuration", async () => {
    const enabledStore = await discoveryFixture(), proposal = await discoveryAnswer(enabledStore);
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.id, decision: "confirmed" });
    await enabledStore.reviewInterview(1, { ...apiScope(), expectedRevision: 3, area: "voice", status: "answered", memoryId: proposal.id });
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 4, proposalId: proposal.id, decision: "rejected" });
    expect((await enabledStore.readInterview(scope)).coverage?.areas.find(item => item.area === "voice")).toMatchObject({ status: "needs_review", memoryId: null });
    await enabledStore.configureDirection(1, { ...apiScope(), expectedRevision: 5, configuration: { ...configuration, segment: "personal", accessMethod: "paid_shoot" } });
    expect((await enabledStore.readInterview(scope)).coverage).toBeNull();
    await expect(enabledStore.reviewInterview(1, { ...apiScope(), expectedRevision: 6, area: "offer", status: "unknown", memoryId: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects other conversations' answers and revoked access without leaking private sources", async () => {
    const enabledStore = await discoveryFixture(), proposal = await discoveryAnswer(enabledStore);
    await enabledStore.decideMemory(1, { ...apiScope(), expectedRevision: 2, proposalId: proposal.id, decision: "confirmed" });
    const other = await enabledStore.createConversation(1, scope.workspaceId);
    const input = { workspaceId: scope.workspaceId, conversationId: other, expectedRevision: 0, area: "offer" as const, status: "answered" as const, memoryId: proposal.id };
    await expect(enabledStore.reviewInterview(1, input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(enabledStore.readInterview({ ...scope, userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.execute("UPDATE mira_workspace_grants SET status='revoked' WHERE workspaceId=?", [scope.workspaceId]);
    await expect(enabledStore.readInterview(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(enabledStore.reviewInterview(1, { ...apiScope(), expectedRevision: 3, area: "offer", status: "unknown", memoryId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a planned reply after configuration changes through another conversation", async () => {
    const enabledStore = await discoveryFixture();
    const other = await enabledStore.createConversation(1, scope.workspaceId);
    const draftReply = async () => {
      await enabledStore.configureDirection(1, { workspaceId: scope.workspaceId, conversationId: other, expectedRevision: 0,
        configuration: { ...configuration, segment: "personal", accessMethod: "paid_shoot" } });
      return { response: "An outdated brand-specific question", memoryProposals: [] };
    };
    await expect(createCoachWorkflow({ ...enabledStore, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "Continue" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await enabledStore.readBrandContext(scope)).messages.some(message => message.content === "An outdated brand-specific question")).toBe(false);
  });

  async function publishedExpertise() {
    await store.configureDirection(1, { ...apiScope(), expectedRevision: 0, configuration });
    const knowledge = createKnowledgeRepository(db, () => clock), bundle = syntheticKnowledgeBundle();
    const draft = await knowledge.importDraft(2, bundle, 0);
    for (const [kind, entry] of [...bundle.sources.map(s => ["source", s] as const), ...bundle.items.map(i => [i.kind, i] as const)]) {
      await knowledge.review(2, "Synthetic editor", { releaseId: draft.releaseId, expectedRevision: (await knowledge.status()).revision, kind, ref: { id: entry.id, version: entry.version }, approved: true, reason: "Synthetic review", evaluationCaseIds: kind === "source" ? [] : ["synthetic-rag-case"] });
    }
    await knowledge.publish(2, { releaseId: draft.releaseId, expectedHash: draft.hash, expectedRevision: (await knowledge.status()).revision });
    return { knowledge, bundle, retrieveGuidance: createKnowledgeRetriever({ enabled: true, snapshot: () => knowledge.publishedSnapshot() }) };
  }
  it("retrieves published expertise and persists exact version refs without confirming new client facts", async () => {
    const { retrieveGuidance } = await publishedExpertise();
    const draftReply = vi.fn(async (input: Parameters<import("./graph").CoachDependencies["draftReply"]>[0]) => {
      expect(input.guidance?.cards[0].item.id).toBe("audience-before-style");
      expect(input.evidence).toEqual([]);
      return { response: "Which audience do you want to reach?", memoryProposals: [{ text: "Exploring the audience", kind: "interpreted" as const }] };
    });
    const workflow = createCoachWorkflow({ ...store, retrieveGuidance, draftReply });
    const input = { ...apiScope(), requestId: randomUUID(), message: "My audience is unclear" };
    const result = await workflow.run(1, input);
    expect(result.knowledgeTrace).toMatchObject({ status: "matched", selected: [{ kind: "card", id: "audience-before-style", version: 1 }] });
    expect((await store.listMemory(scope)).proposals[0].status).toBe("pending_confirmation");
    expect((await store.readBrandContext(scope)).evidence).toEqual([]);
    expect(await workflow.run(1, input)).toEqual(result); expect(draftReply).toHaveBeenCalledTimes(1);
  });
  it("persists Pinecone provenance through the same SQL approval and replay boundaries", async () => {
    const { knowledge } = await publishedExpertise(), target = { host: "https://synthetic.svc.test.pinecone.io", namespace: "mira-test" };
    const search = vi.fn(async () => preparePineconeSeedPlan(await knowledge.publishedSnapshot(), target).documents
      .filter(document => document.mira_item === "audience-before-style").map(document => ({ ...document, _score: 0.8 })));
    const retrieveGuidance = createPineconeKnowledgeRetriever({ enabled: true, target, snapshot: () => knowledge.publishedSnapshot(), search });
    const draftReply = vi.fn(async () => ({ response: "Which people would you like to reach?", memoryProposals: [{ text: "An unconfirmed client interpretation", kind: "interpreted" as const }] }));
    const workflow = createCoachWorkflow({ ...store, retrieveGuidance, draftReply }), input = { ...apiScope(), requestId: randomUUID(), message: "Finding the people who need my work" };
    const result = await workflow.run(1, input);
    expect(result.knowledgeTrace).toMatchObject({ algorithm: "pinecone-documents-v1", status: "matched", selected: [{ kind: "card", id: "audience-before-style", version: 1 }] });
    expect((await store.listMemory(scope)).proposals[0].status).toBe("pending_confirmation");
    expect((await createCoachStore(db, () => clock).readBrandContext(scope)).evidence).toEqual([]);
    expect(await workflow.run(1, input)).toEqual(result); expect(search).toHaveBeenCalledTimes(1); expect(draftReply).toHaveBeenCalledTimes(1);
  });
  it("rejects Pinecone-backed guidance withdrawn after retrieval but before SQL commit", async () => {
    const { knowledge, bundle } = await publishedExpertise(), target = { host: "https://synthetic.svc.test.pinecone.io", namespace: "mira-test" };
    const search = vi.fn(async () => preparePineconeSeedPlan(await knowledge.publishedSnapshot(), target).documents
      .filter(document => document.mira_item === "audience-before-style").map(document => ({ ...document, _score: 0.8 })));
    const retrieveGuidance = createPineconeKnowledgeRetriever({ enabled: true, target, snapshot: () => knowledge.publishedSnapshot(), search });
    const draftReply = vi.fn(async () => {
      await knowledge.withdraw(2, { expectedRevision: (await knowledge.status()).revision, kind: "source", ref: { id: bundle.sources[0].id, version: 1 }, reason: "Synthetic withdrawal after semantic retrieval" });
      return { response: "This stale guidance must not be saved.", memoryProposals: [] };
    });
    await expect(createCoachWorkflow({ ...store, retrieveGuidance, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "Who do I reach?" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await store.readBrandContext(scope)).messages).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(1); expect(draftReply).toHaveBeenCalledTimes(1);
  });
  it("rejects withdrawn expertise at commit and retries from the current corpus", async () => {
    const { knowledge, bundle, retrieveGuidance } = await publishedExpertise();
    let withdraw = true;
    const draftReply = vi.fn(async () => {
      if (withdraw) {
        withdraw = false;
        await knowledge.withdraw(2, { expectedRevision: (await knowledge.status()).revision, kind: "source", ref: { id: bundle.sources[0].id, version: 1 }, reason: "Synthetic withdrawal during generation" });
      }
      return { response: "Please clarify the audience", memoryProposals: [] };
    });
    const workflow = createCoachWorkflow({ ...store, retrieveGuidance, draftReply });
    const input = { ...apiScope(), requestId: randomUUID(), message: "My audience is unclear" };
    await expect(workflow.run(1, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await store.readBrandContext(scope)).messages).toEqual([{ role: "assistant", content: interviewOpening("personal_brand")!.question }]);
    expect((await workflow.run(1, input)).knowledgeTrace).toMatchObject({ status: "no_match", selected: [] });
    expect(draftReply).toHaveBeenCalledTimes(2);
  });
  it("continues with an honest unavailable state when shared lookup fails", async () => {
    await publishedExpertise();
    const draftReply = vi.fn(async (input: Parameters<import("./graph").CoachDependencies["draftReply"]>[0]) => {
      expect(input.guidance?.status).toBe("unavailable");
      return { response: "What would you like your audience to understand?", memoryProposals: [] };
    });
    const retrieveGuidance = createKnowledgeRetriever({ enabled: true, snapshot: async () => { throw new Error("Synthetic unavailable database"); } });
    const result = await createCoachWorkflow({ ...store, retrieveGuidance, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "My audience is unclear" });
    expect(result.knowledgeTrace?.selected).toEqual([]); expect(draftReply).toHaveBeenCalledTimes(1);
  });

  it("does not discard a valid reply merely because an editor is drafting unrelated knowledge", async () => {
    const { knowledge, bundle, retrieveGuidance } = await publishedExpertise();
    const originalRevision = (await knowledge.status()).revision;
    const draftReply = async () => {
      const newDraft = structuredClone(bundle); newDraft.items.push({ ...newDraft.items[1], id: "unrelated-draft-example" });
      await knowledge.importDraft(2, newDraft, originalRevision);
      return { response: "Which audience do you want to reach?", memoryProposals: [] };
    };
    const result = await createCoachWorkflow({ ...store, retrieveGuidance, draftReply }).run(1, { ...apiScope(), requestId: randomUUID(), message: "My audience is unclear" });
    expect(result.knowledgeTrace?.revision).toBe(originalRevision);
    expect((await knowledge.status()).revision).toBeGreaterThan(originalRevision);
    expect((await store.readBrandContext(scope)).messages).toHaveLength(3);
  });

});
