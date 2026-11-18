import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { miraBrandWorkspaces, miraWorkspaceMembers, miraWorkspaceGrants,
  miraBrandConfigurations, miraCoachConversations, miraCoachTurns, miraCoachMemoryProposals, miraCoachSources, miraCoachInterviews, miraCoachCallClocks } from "../../drizzle/schema";
import { completedCoachTurnSchema, type CompletedCoachTurn, type CoachMemoryDecisionInput } from "../../shared/miraCoach";
import { addCoachSourceInputSchema, withdrawCoachSourceInputSchema, type AddCoachSourceInput, type WithdrawCoachSourceInput } from "../../shared/miraSources";
import { retrieveSourceExcerpts } from "./sources";
import { conversationHistory } from "./conversationHistory";
import { interviewCoverage, interviewMemoryHash, interviewProposalId, newInterviewLedger, requiredInterviewAreas } from "./coverage";
import { validateInterviewMappings } from "./interviewProposals";
import { interviewReflection } from "./reflection";
import { interviewLedgerSchema, interviewReviewInputSchema, interviewConfirmInputSchema, interviewProposalReviewInputSchema, interviewReflectionInputSchema, type InterviewReviewInput, type InterviewConfirmInput, type InterviewProposalReviewInput, type InterviewReflectionInput } from "../../shared/miraInterview";
import { canUseWorkspaceCapability } from "../miraWorkspace/access";
import type { getDb } from "../db";
import type { CoachContext, CoachDependencies, CoachScope, TurnClaim } from "./graph";

import { assertCurrentKnowledge } from "../miraKnowledge/guard";
import { directionRepository, directionConflict } from "../miraBrandDirection/repository";
import { prepareDirectionBrief } from "../miraBrandDirection/brief";
import { brandConfigurationSchema, configureDirectionInputSchema, saveDirectionInputSchema, reviewDirectionInputSchema, approveDirectionInputSchema, directionPolicy } from "../../shared/miraBrandDirection";
import type { z } from "zod";
import { callClockRecordSchema, callClockCommandSchema, type CallClockCommand, type CallClockRecord } from "../../shared/miraCallClock";
import { newCallClock, settleCallClock, commandCallClock, callClockStatus, CallClockConflict } from "./callClock";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const leaseMs = 120_000;
const missing = () => new TRPCError({ code: "NOT_FOUND", message: "Brand conversation not found." });
const conflict = () => new TRPCError({ code: "CONFLICT", message: "The conversation changed or is processing. Please retry." });
function savedResult(value: unknown): CompletedCoachTurn {
  return completedCoachTurnSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

export function createCoachStore(db: Database, now: () => Date = () => new Date(), options: { interviewEnabled?: boolean; callEnabled?: boolean; callAllowanceMs?: number } = {}) {
  async function loadAccess(tx: Transaction, userId: number, workspaceId: number) {
    const [workspace] = await tx.select().from(miraBrandWorkspaces).where(eq(miraBrandWorkspaces.id, workspaceId)).for("update");
    if (!workspace) return null;
    const memberships = await tx.select().from(miraWorkspaceMembers).where(and(
      eq(miraWorkspaceMembers.workspaceId, workspaceId), eq(miraWorkspaceMembers.userId, userId),
    )).for("update");
    const grants = await tx.select().from(miraWorkspaceGrants).where(eq(miraWorkspaceGrants.workspaceId, workspaceId)).for("update");
    return { context: { userId, workspace, memberships }, grants };
  }
  async function requireAccess(tx: Transaction, userId: number, workspaceId: number) {
    const access = await loadAccess(tx, userId, workspaceId);
    if (!access || !canUseWorkspaceCapability(access.context, "brand_coaching", access.grants, now())) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Brand coaching is not available for this workspace." });
    }
  }
  async function conversation(tx: Transaction, scope: CoachScope) {
    await requireAccess(tx, scope.userId, scope.workspaceId);
    const [row] = await tx.select().from(miraCoachConversations).where(and(
      eq(miraCoachConversations.id, scope.conversationId), eq(miraCoachConversations.workspaceId, scope.workspaceId),
      eq(miraCoachConversations.ownerUserId, scope.userId),
    )).for("update");
    if (!row) throw missing();
    return row;
  }
  async function turn(tx: Transaction, scope: CoachScope, requestId: string) {
    const [row] = await tx.select().from(miraCoachTurns).where(and(
      eq(miraCoachTurns.conversationId, scope.conversationId), eq(miraCoachTurns.requestId, requestId),
    )).for("update");
    return row;
  }

  async function configurationFor(tx: Transaction, workspaceId: number) {
    const [row] = await tx.select().from(miraBrandConfigurations).where(eq(miraBrandConfigurations.workspaceId, workspaceId));
    return row ? brandConfigurationSchema.parse(typeof row.configuration === "string" ? JSON.parse(row.configuration) : row.configuration) : null;
  }
  async function loadCallClock(tx: Transaction, scope: CoachScope) {
    if (!options.callEnabled || !options.interviewEnabled || (await configurationFor(tx, scope.workspaceId))?.segment !== "personal_brand") return null;
    const [row] = await tx.select().from(miraCoachCallClocks).where(and(eq(miraCoachCallClocks.workspaceId, scope.workspaceId), eq(miraCoachCallClocks.userId, scope.userId))).for("update");
    const raw = row ? callClockRecordSchema.parse(typeof row.clock === "string" ? JSON.parse(row.clock) : row.clock) : newCallClock(now().getTime(), options.callAllowanceMs);
    const clock = settleCallClock(raw, now().getTime());
    if (row) await persistCallClock(tx, scope, clock);
    return clock;
  }
  async function persistCallClock(tx: Transaction, scope: CoachScope, clock: CallClockRecord) {
    await tx.insert(miraCoachCallClocks).values({ workspaceId: scope.workspaceId, userId: scope.userId, clock }).onDuplicateKeyUpdate({ set: { clock } });
  }
  async function requireCall(tx: Transaction, scope: CoachScope, finishingEpoch?: number | null) {
    const clock = await loadCallClock(tx, scope);
    if (!clock) throw new TRPCError({ code: "NOT_FOUND", message: "Timed conversations are not available for this service." });
    const finishing = finishingEpoch !== undefined && finishingEpoch !== null;
    if (clock.conversationId !== scope.conversationId || (finishing ? clock.epoch !== finishingEpoch || !["active", "exhausted"].includes(clock.state) : clock.state !== "active")) {
      throw new TRPCError({ code: "CONFLICT", message: "Start or resume your conversation timer before continuing." });
    }
    return clock;
  }
  async function loadInterview(tx: Transaction, scope: CoachScope, configuration: z.infer<typeof brandConfigurationSchema> | null, extraMemoryId?: string | null) {
    if (!options.interviewEnabled || !configuration || configuration.segment !== "personal_brand") return null;
    const [row] = await tx.select().from(miraCoachInterviews).where(eq(miraCoachInterviews.conversationId, scope.conversationId));
    let ledger = row ? interviewLedgerSchema.parse(typeof row.ledger === "string" ? JSON.parse(row.ledger) : row.ledger) : newInterviewLedger(configuration);
    const ids = Array.from(new Set([...ledger.decisions.flatMap(item => item.memoryId ? [item.memoryId] : []), ...(ledger.proposals ?? []).map(item => item.memoryId), ...(extraMemoryId ? [extraMemoryId] : [])]));
    const memories = ids.length ? await tx.select({ id: miraCoachMemoryProposals.id, text: miraCoachMemoryProposals.text, status: miraCoachMemoryProposals.status, kind: miraCoachMemoryProposals.kind })
      .from(miraCoachMemoryProposals).innerJoin(miraCoachTurns, eq(miraCoachMemoryProposals.turnId, miraCoachTurns.id))
      .where(and(eq(miraCoachTurns.conversationId, scope.conversationId), eq(miraCoachTurns.status, "complete"), inArray(miraCoachMemoryProposals.id, ids))) : [];
    const coverage = interviewCoverage(configuration, ledger, memories)!;
    if (ledger.configurationKey !== newInterviewLedger(configuration).configurationKey) ledger = newInterviewLedger(configuration);
    return { ledger, coverage, memories };
  }
  async function persistInterview(tx: Transaction, conversationId: string, ledger: z.infer<typeof interviewLedgerSchema>, revision: number) {
    await tx.insert(miraCoachInterviews).values({ conversationId, ledger }).onDuplicateKeyUpdate({ set: { ledger } });
    await tx.update(miraCoachConversations).set({ revision: revision + 1 }).where(eq(miraCoachConversations.id, conversationId));
    return { revision: revision + 1 };
  }

  const store = {
    now,
    async readSpokenReply(scope: CoachScope, requestId: string | null): Promise<string> {
      if (!requestId) { const context = await store.readBrandContext(scope); if (!context.entryOpening) throw missing(); return context.entryOpening.question; }
      return db.transaction(async tx => { await conversation(tx, scope); const row = await turn(tx, scope, requestId); if (row?.status !== "complete") throw missing(); return savedResult(row.result).response; });
    },
    async readCallClock(scope: CoachScope) {
      return db.transaction(async tx => { await conversation(tx, scope); const clock = await loadCallClock(tx, scope); return clock ? callClockStatus(clock) : null; });
    },
    async controlCallClock(userId: number, raw: CallClockCommand) {
      const input = callClockCommandSchema.parse(raw), scope = { ...input, userId };
      return db.transaction(async tx => {
        await conversation(tx, scope);
        const clock = await loadCallClock(tx, scope);
        if (!clock) throw new TRPCError({ code: "NOT_FOUND", message: "Timed conversations are not available for this service." });
        let updated: CallClockRecord;
        try { updated = commandCallClock(clock, input, now().getTime()); }
        catch (error) { if (error instanceof CallClockConflict) throw new TRPCError({ code: "CONFLICT", message: error.message }); throw error; }
        await persistCallClock(tx, scope, updated);
        return callClockStatus(updated);
      });
    },
    async remainingCallMs(scope: CoachScope) {
      return db.transaction(async tx => { await conversation(tx, scope); return callClockStatus(await requireCall(tx, scope)).remainingMs; });
    },
    async readInterview(scope: CoachScope) {
      return db.transaction(async tx => {
        const row = await conversation(tx, scope);
        const loaded = await loadInterview(tx, scope, await configurationFor(tx, row.workspaceId));
        return { revision: row.revision, coverage: loaded?.coverage ?? null, reflection: loaded ? interviewReflection(loaded.coverage, loaded.memories) : null };
      });
    },
    async confirmInterviewReflection(userId: number, raw: InterviewReflectionInput) {
      const input = interviewReflectionInputSchema.parse(raw);
      return db.transaction(async tx => {
        const scope = { ...input, userId }, row = await conversation(tx, scope);
        if (row.revision !== input.expectedRevision) throw conflict();
        const configuration = await configurationFor(tx, row.workspaceId);
        const loaded = await loadInterview(tx, scope, configuration);
        if (!loaded || !configuration) throw new TRPCError({ code: "NOT_FOUND", message: "Discovery reflection is not available for this service." });
        const reflection = interviewReflection(loaded.coverage, loaded.memories);
        if (reflection.fingerprint !== input.fingerprint || !reflection.answers.length) throw conflict();
        if (reflection.reviewed) return { revision: row.revision };
        // One explicit review of the exact displayed source texts confirms their
        // meaning and placement atomically. Unmapped memory is never approved.
        const ids = Array.from(new Set(reflection.answers.filter(answer => answer.status === "proposed").map(answer => answer.memoryId)));
        const replaced = loaded.ledger.decisions.flatMap(decision => {
          const answer = reflection.answers.find(answer => answer.area === decision.area && answer.status === "proposed");
          return answer && decision.memoryId && decision.memoryId !== answer.memoryId ? [decision.memoryId] : [];
        }).filter(id => !reflection.answers.some(answer => answer.memoryId === id));
        if (replaced.length) await tx.update(miraCoachMemoryProposals).set({ status: "rejected" }).where(inArray(miraCoachMemoryProposals.id, replaced));
        if (ids.length) await tx.update(miraCoachMemoryProposals).set({ status: "confirmed" }).where(inArray(miraCoachMemoryProposals.id, ids));
        for (const answer of reflection.answers) {
          loaded.ledger.stateObservations = loaded.ledger.stateObservations?.filter(item => item.area !== answer.area);
          loaded.ledger.decisions = [...loaded.ledger.decisions.filter(item => item.area !== answer.area), { area: answer.area, status: "answered", memoryId: answer.memoryId, memoryHash: interviewMemoryHash(answer.text) }];
          for (const proposal of loaded.ledger.proposals ?? []) if (proposal.area === answer.area && proposal.status === "pending") proposal.status = proposal.id === answer.proposalId ? "accepted" : "dismissed";
        }
        const memories = loaded.memories.map(memory => ids.includes(memory.id) ? { ...memory, status: "confirmed" } : memory);
        const coverage = interviewCoverage(configuration, loaded.ledger, memories)!;
        // Unexplored areas stay missing; reviewing a partial reflection never
        // invents a declined answer, client uncertainty or complete discovery.
        loaded.ledger.reviewedFingerprint = coverage.fingerprint;
        return persistInterview(tx, row.id, interviewLedgerSchema.parse(loaded.ledger), row.revision);
      });
    },
    async reviewInterview(userId: number, raw: InterviewReviewInput) {
      const input = interviewReviewInputSchema.parse(raw);
      return db.transaction(async tx => {
        const scope = { ...input, userId }, row = await conversation(tx, scope);
        if (row.revision !== input.expectedRevision) throw conflict();
        const configuration = await configurationFor(tx, row.workspaceId);
        const loaded = await loadInterview(tx, scope, configuration, input.memoryId);
        if (!loaded || !configuration) throw new TRPCError({ code: "NOT_FOUND", message: "Discovery review is not available for this service." });
        if (!requiredInterviewAreas(configuration).includes(input.area) || (input.status === "answered" && !loaded.memories.some(item => item.id === input.memoryId && item.status === "confirmed"))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a confirmed answer from this conversation for this discovery area." });
        }
        const memory = loaded.memories.find(item => item.id === input.memoryId);
        loaded.ledger.stateObservations = loaded.ledger.stateObservations?.filter(item => item.area !== input.area);
        loaded.ledger.decisions = [...loaded.ledger.decisions.filter(item => item.area !== input.area), { area: input.area, status: input.status, memoryId: input.memoryId,
          ...(input.status === "answered" && memory ? { memoryHash: interviewMemoryHash(memory.text) } : {}) }];
        // A manual decision supersedes outstanding suggestions for this area.
        for (const proposal of loaded.ledger.proposals ?? []) if (proposal.area === input.area && proposal.status === "pending") proposal.status = "dismissed";
        loaded.ledger.reviewedFingerprint = null;
        return persistInterview(tx, row.id, interviewLedgerSchema.parse(loaded.ledger), row.revision);
      });
    },
    async reviewInterviewProposal(userId: number, raw: InterviewProposalReviewInput) {
      const input = interviewProposalReviewInputSchema.parse(raw);
      return db.transaction(async tx => {
        const scope = { ...input, userId }, row = await conversation(tx, scope);
        if (row.revision !== input.expectedRevision) throw conflict();
        const loaded = await loadInterview(tx, scope, await configurationFor(tx, row.workspaceId));
        const proposal = loaded?.ledger.proposals?.find(item => item.id === input.proposalId && item.status === "pending");
        const visible = loaded?.coverage.proposals?.find(item => item.id === input.proposalId);
        if (!loaded || !proposal || !visible) throw conflict();
        if (input.action === "accept") {
          if (visible.memoryStatus !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Confirm this answer in Brand memory first." });
          loaded.ledger.decisions = [...loaded.ledger.decisions.filter(item => item.area !== proposal.area), {
            area: proposal.area, status: "answered", memoryId: proposal.memoryId, memoryHash: proposal.memoryHash,
          }];
          loaded.ledger.stateObservations = loaded.ledger.stateObservations?.filter(item => item.area !== proposal.area);
          loaded.ledger.reviewedFingerprint = null;
          for (const other of loaded.ledger.proposals ?? []) if (other.area === proposal.area && other.status === "pending") other.status = "dismissed";
        }
        proposal.status = input.action === "accept" ? "accepted" : "dismissed";
        return persistInterview(tx, row.id, interviewLedgerSchema.parse(loaded.ledger), row.revision);
      });
    },
    async confirmInterviewReview(userId: number, raw: InterviewConfirmInput) {
      const input = interviewConfirmInputSchema.parse(raw);
      return db.transaction(async tx => {
        const scope = { ...input, userId }, row = await conversation(tx, scope);
        if (row.revision !== input.expectedRevision) throw conflict();
        const loaded = await loadInterview(tx, scope, await configurationFor(tx, row.workspaceId));
        if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: "Discovery review is not available for this service." });
        if (loaded.coverage.areas.some(item => item.status === "missing" || item.status === "needs_review")) throw conflict();
        if (loaded.coverage.reviewed) return { revision: row.revision };
        loaded.ledger.reviewedFingerprint = loaded.coverage.fingerprint;
        return persistInterview(tx, row.id, loaded.ledger, row.revision);
      });
    },
    async readDirection(scope: CoachScope) {
      return db.transaction(async tx => {
        const row = await conversation(tx, scope);
        const repo = await directionRepository(tx, row.workspaceId, row.id);
        return { revision: row.revision, configuration: repo.configuration, records: repo.records };
      });
    },
    async readDirectionBrief(scope: CoachScope) {
      return db.transaction(async tx => {
        const row = await conversation(tx, scope);
        const configuration = await configurationFor(tx, row.workspaceId);
        const loaded = await loadInterview(tx, scope, configuration);
        return prepareDirectionBrief({ revision: row.revision, configuration,
          reflection: loaded ? interviewReflection(loaded.coverage, loaded.memories) : null });
      });
    },
    async configureDirection(userId: number, raw: z.infer<typeof configureDirectionInputSchema>) {
      const input = configureDirectionInputSchema.parse(raw);
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        if (row.revision !== input.expectedRevision) throw directionConflict();
        // A shoot relation must be verified by a future booking-link service, never self-assigned here.
        if (input.configuration.shootId !== null) throw new TRPCError({ code: "BAD_REQUEST", message: "Link a verified booking through the booking service." });
        const repo = await directionRepository(tx, row.workspaceId, row.id);
        await repo.configure(input.configuration);
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { revision: row.revision + 1 };
      });
    },
    async saveDirection(userId: number, raw: z.infer<typeof saveDirectionInputSchema>) {
      const input = saveDirectionInputSchema.parse(raw);
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        if (row.revision !== input.expectedRevision) throw directionConflict();
        const repo = await directionRepository(tx, row.workspaceId, row.id);
        if ((repo.records.at(-1)?.id ?? null) !== input.parentId) throw directionConflict();
        const record = repo.newRecord(input.draft, input.parentId, row.revision);
        await repo.persist();
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { revision: row.revision + 1, directionId: record.id };
      });
    },
    async reviewDirection(userId: number, raw: z.infer<typeof reviewDirectionInputSchema>) {
      const input = reviewDirectionInputSchema.parse(raw);
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        const repo = await directionRepository(tx, row.workspaceId, row.id);
        const payload = JSON.stringify(input);
        const prior = repo.requests[input.requestId];
        if (prior) { if (prior.payload !== payload) throw directionConflict(); return { revision: prior.revision }; }
        if (row.revision !== input.expectedRevision) throw directionConflict();
        const record = repo.records.at(-1);
        if (!record || record.id !== input.directionId || record.state !== "draft" || record.stale || !record.draft.decisions.some(d => d.id === input.decisionId)) throw directionConflict();
        if (Object.keys(repo.requests).length >= 500) throw directionConflict();
        record.reviews.push({ decisionId: input.decisionId, action: input.action, reason: input.reason, actorUserId: userId, at: now().toISOString() });
        repo.requests[input.requestId] = { payload, revision: row.revision + 1 };
        await repo.persist();
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { revision: row.revision + 1 };
      });
    },
    async approveDirection(userId: number, raw: z.infer<typeof approveDirectionInputSchema>) {
      const input = approveDirectionInputSchema.parse(raw);
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        if (row.revision !== input.expectedRevision) throw directionConflict();
        const repo = await directionRepository(tx, row.workspaceId, row.id);
        const record = repo.records.at(-1);
        if (!record || record.id !== input.directionId || record.stale) throw directionConflict();
        if (record.state === "approved") return { revision: row.revision };
        const required = directionPolicy(record.configuration).voice ? ["brand.meaning", "voice.profile", "visual.direction"] : ["brand.meaning", "visual.direction"];
        if (required.some(d => !record.draft.decisions.some(item => item.dimension === d)) || record.draft.decisions.some(d => record.reviews.filter(r => r.decisionId === d.id).at(-1)?.action !== "accept")) throw directionConflict();
        record.state = "approved";
        await repo.persist();
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { revision: row.revision + 1 };
      });
    },
    async createConversation(userId: number, workspaceId: number) {
      return db.transaction(async tx => {
        await requireAccess(tx, userId, workspaceId);
        const id = randomUUID();
        await tx.insert(miraCoachConversations).values({ id, workspaceId, ownerUserId: userId });
        return id;
      });
    },
    async listConversations(userId: number, workspaceId: number, beforeId?: string) {
      return db.transaction(async tx => {
        await requireAccess(tx, userId, workspaceId);
        const rows = await tx.select({ id: miraCoachConversations.id, revision: miraCoachConversations.revision,
          updatedAt: miraCoachConversations.updatedAt }).from(miraCoachConversations).where(and(
          eq(miraCoachConversations.workspaceId, workspaceId), eq(miraCoachConversations.ownerUserId, userId),
          beforeId ? lt(miraCoachConversations.id, beforeId) : undefined,
        )).orderBy(desc(miraCoachConversations.id)).limit(21);
        const conversations = rows.slice(0, 20);
        return { conversations, nextCursor: rows.length > 20 ? conversations[conversations.length - 1].id : null };
      });
    },
    async loadAccess(userId: number, workspaceId: number) {
      return db.transaction(tx => loadAccess(tx, userId, workspaceId));
    },
    async readBrandContext(scope: CoachScope, query?: string): Promise<CoachContext> {
      return db.transaction(async tx => {
        const row = await conversation(tx, scope);
        const turns = await tx.select().from(miraCoachTurns).where(and(
          eq(miraCoachTurns.conversationId, scope.conversationId), eq(miraCoachTurns.status, "complete"),
        )).orderBy(desc(miraCoachTurns.expectedRevision)).limit(50);
        const confirmed = await tx.select({ id: miraCoachMemoryProposals.id, text: miraCoachMemoryProposals.text,
          kind: miraCoachMemoryProposals.kind }).from(miraCoachMemoryProposals)
          .innerJoin(miraCoachTurns, eq(miraCoachMemoryProposals.turnId, miraCoachTurns.id))
          .where(and(eq(miraCoachTurns.conversationId, scope.conversationId),
            eq(miraCoachTurns.status, "complete"), eq(miraCoachMemoryProposals.status, "confirmed")))
          .orderBy(desc(miraCoachMemoryProposals.createdAt), desc(miraCoachMemoryProposals.id)).limit(100);
        const sources = query ? await tx.select().from(miraCoachSources).where(and(
          eq(miraCoachSources.conversationId, row.id), eq(miraCoachSources.status, "active")))
          .orderBy(desc(miraCoachSources.id)).limit(50) : [];
        const excerpts = query ? retrieveSourceExcerpts(sources, query) : [];
        const [configurationRow] = await tx.select().from(miraBrandConfigurations).where(eq(miraBrandConfigurations.workspaceId, row.workspaceId));
        const configuration = configurationRow ? brandConfigurationSchema.parse(typeof configurationRow.configuration === "string" ? JSON.parse(configurationRow.configuration) : configurationRow.configuration) : null;
        const interview = await loadInterview(tx, scope, configuration);
        return { configuration, workspaceId: row.workspaceId, conversationId: row.id, ownerUserId: row.ownerUserId, revision: row.revision,
          ...(interview ? { interview: interview.coverage } : {}),
          ...(interview ? { interviewWorkingEvidence: interviewReflection(interview.coverage, interview.memories).answers.filter(answer => answer.status === "proposed").map(({ area, memoryId, text, kind }) => ({ area, memoryId, text, kind })) } : {}),
          ...conversationHistory(turns.reverse(), configuration?.segment ?? null),
          evidence: [...confirmed.filter(item => !interview?.ledger.decisions.some(decision => decision.memoryId === item.id
            && (interview.coverage.areas.some(area => area.area === decision.area && area.status === "needs_review") || interview.coverage.proposals?.some(proposal => proposal.area === decision.area && proposal.memoryId !== item.id)))).slice(0, 100 - excerpts.length).map(item => ({ ...item, confirmed: true })), ...excerpts],
        };
      });
    },
    async addSource(userId: number, rawInput: AddCoachSourceInput) {
      const input = addCoachSourceInputSchema.parse(rawInput);
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        if (row.revision !== input.expectedRevision) throw conflict();
        const active = await tx.select({ id: miraCoachSources.id }).from(miraCoachSources).where(and(
          eq(miraCoachSources.conversationId, row.id), eq(miraCoachSources.status, "active"))).limit(50);
        if (active.length >= 50) throw new TRPCError({ code: "CONFLICT", message: "Withdraw an existing source before adding another (50 active sources maximum)." });
        const id = randomUUID();
        await tx.insert(miraCoachSources).values({ id, conversationId: row.id, title: input.source.title,
          text: input.source.text, referenceUrl: input.source.referenceUrl ?? null, rightsBasis: input.source.rightsBasis,
          approvedByUserId: userId, approvedAt: now(), status: "active" });
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { sourceId: id, revision: row.revision + 1 };
      });
    },
    async listSources(scope: CoachScope, beforeId?: string) {
      return db.transaction(async tx => {
        const row = await conversation(tx, scope);
        const sources = await tx.select({ id: miraCoachSources.id, title: miraCoachSources.title, text: miraCoachSources.text,
          referenceUrl: miraCoachSources.referenceUrl, rightsBasis: miraCoachSources.rightsBasis,
          status: miraCoachSources.status, approvedAt: miraCoachSources.approvedAt, withdrawnAt: miraCoachSources.withdrawnAt })
          .from(miraCoachSources).where(and(eq(miraCoachSources.conversationId, row.id),
            beforeId ? lt(miraCoachSources.id, beforeId) : undefined)).orderBy(desc(miraCoachSources.id)).limit(21);
        const page = sources.slice(0, 20);
        return { revision: row.revision, sources: page, nextCursor: sources.length > 20 ? page[page.length - 1].id : null };
      });
    },
    async withdrawSource(userId: number, rawInput: WithdrawCoachSourceInput) {
      const input = withdrawCoachSourceInputSchema.parse(rawInput);
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        if (row.revision !== input.expectedRevision) throw conflict();
        const [source] = await tx.select().from(miraCoachSources).where(and(
          eq(miraCoachSources.id, input.sourceId), eq(miraCoachSources.conversationId, row.id))).for("update");
        if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Brand source not found." });
        if (source.status === "withdrawn") return { revision: row.revision };
        await tx.update(miraCoachSources).set({ status: "withdrawn", withdrawnAt: now() }).where(eq(miraCoachSources.id, source.id));
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { revision: row.revision + 1 };
      });
    },
    async listMemory(scope: CoachScope, beforeId?: string) {
      return db.transaction(async tx => {
        const row = await conversation(tx, scope);
        const proposals = await tx.select({ id: miraCoachMemoryProposals.id, text: miraCoachMemoryProposals.text,
          kind: miraCoachMemoryProposals.kind, status: miraCoachMemoryProposals.status,
          sourceRequestId: miraCoachTurns.requestId }).from(miraCoachMemoryProposals)
          .innerJoin(miraCoachTurns, eq(miraCoachMemoryProposals.turnId, miraCoachTurns.id))
          .where(and(eq(miraCoachTurns.conversationId, row.id), eq(miraCoachTurns.status, "complete"),
            beforeId ? lt(miraCoachMemoryProposals.id, beforeId) : undefined))
          .orderBy(desc(miraCoachMemoryProposals.id)).limit(101);
        const page = proposals.slice(0, 100);
        return { revision: row.revision, proposals: page,
          nextCursor: proposals.length > 100 ? page[page.length - 1].id : null };
      });
    },
    async decideMemory(userId: number, input: CoachMemoryDecisionInput) {
      return db.transaction(async tx => {
        const row = await conversation(tx, { ...input, userId });
        if (row.revision !== input.expectedRevision) throw conflict();
        const [proposal] = await tx.select({ id: miraCoachMemoryProposals.id, status: miraCoachMemoryProposals.status })
          .from(miraCoachMemoryProposals).innerJoin(miraCoachTurns, eq(miraCoachMemoryProposals.turnId, miraCoachTurns.id))
          .where(and(eq(miraCoachMemoryProposals.id, input.proposalId),
            eq(miraCoachTurns.conversationId, row.id), eq(miraCoachTurns.status, "complete"))).for("update");
        if (!proposal) throw missing();
        if (proposal.status === input.decision) return { revision: row.revision, status: proposal.status };
        // Rejected proposals cannot be silently re-approved; the client may withdraw confirmed memory.
        if (proposal.status === "rejected") throw conflict();
        await tx.update(miraCoachMemoryProposals).set({ status: input.decision }).where(eq(miraCoachMemoryProposals.id, proposal.id));
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 }).where(eq(miraCoachConversations.id, row.id));
        return { revision: row.revision + 1, status: input.decision };
      });
    },
    async beginTurn(input: { scope: CoachScope; requestId: string; message: string; call?: boolean }): Promise<TurnClaim> {
      return db.transaction(async tx => {
        const row = await conversation(tx, input.scope);
        const prior = await turn(tx, input.scope, input.requestId);
        if (prior && prior.message !== input.message) throw conflict();
        if (prior?.status === "complete") return { kind: "completed", result: savedResult(prior.result) };
        const time = now();
        if (prior?.status === "processing" && prior.leaseUntil && prior.leaseUntil > time) throw conflict();
        const call = input.call ? await requireCall(tx, input.scope) : null;
        if (call) {
          const active = await tx.select({ id: miraCoachTurns.id }).from(miraCoachTurns).where(and(eq(miraCoachTurns.conversationId, row.id), eq(miraCoachTurns.status, "processing"), gt(miraCoachTurns.leaseUntil, time))).limit(1);
          if (active.length) throw conflict();
        }
        const leaseToken = randomUUID();
        const patch = { expectedRevision: row.revision, status: "processing" as const, leaseToken,
          leaseUntil: new Date(time.getTime() + leaseMs) };
        if (call) { call.claim = { requestId: input.requestId, conversationId: row.id, leaseToken, epoch: call.epoch }; await persistCallClock(tx, input.scope, call); }
        if (prior) await tx.update(miraCoachTurns).set(patch).where(eq(miraCoachTurns.id, prior.id));
        else await tx.insert(miraCoachTurns).values({ id: randomUUID(), conversationId: row.id,
          requestId: input.requestId, message: input.message, ...patch });
        return { kind: "claimed", leaseToken, expectedRevision: row.revision };
      });
    },
    async saveTurn(input: Parameters<CoachDependencies["saveTurn"]>[0]): Promise<CompletedCoachTurn> {
      const result = completedCoachTurnSchema.parse(input.result);
      if (result.memoryProposals.some(item => item.sourceRequestId !== input.requestId)) throw conflict();
      return db.transaction(async tx => {
        const row = await conversation(tx, input.scope); // fresh grants/membership at commit
        const prior = await turn(tx, input.scope, input.requestId);
        if (!prior || prior.message !== input.message) throw conflict();
        if (prior.status === "complete") return savedResult(prior.result);
        let finishingCall: CallClockRecord | null = null;
        if (input.call) {
          const current = await loadCallClock(tx, input.scope);
          if (!current?.claim || current.claim.requestId !== input.requestId || current.claim.leaseToken !== input.leaseToken || current.claim.conversationId !== row.id) throw conflict();
          finishingCall = await requireCall(tx, input.scope, current.claim.epoch);
        }
        let interview: Awaited<ReturnType<typeof loadInterview>> = null;
        if (options.interviewEnabled) {
          const current = await loadInterview(tx, input.scope, await configurationFor(tx, row.workspaceId));
          interview = current;
          if (Boolean(current) !== Boolean(result.interviewPlan)
            || (current && result.interviewPlan?.fingerprint !== current.coverage.fingerprint)) throw conflict();
        }
        if (result.knowledgeTrace?.status === "matched") {
          const [configurationRow] = await tx.select().from(miraBrandConfigurations).where(eq(miraBrandConfigurations.workspaceId, row.workspaceId));
          const configuration = configurationRow ? brandConfigurationSchema.parse(typeof configurationRow.configuration === "string" ? JSON.parse(configurationRow.configuration) : configurationRow.configuration) : null;
          await assertCurrentKnowledge(tx, result.knowledgeTrace, configuration?.segment ?? null);
        }
        const time = now();
        if (row.revision !== input.expectedRevision || prior.expectedRevision !== input.expectedRevision
          || prior.status !== "processing" || prior.leaseToken !== input.leaseToken
          || !prior.leaseUntil || prior.leaseUntil <= time) throw conflict();
        if (finishingCall) { finishingCall.claim = null; await persistCallClock(tx, input.scope, finishingCall); }
        const memoryRows = result.memoryProposals.map(item => ({ id: randomUUID(), turnId: prior.id, text: item.text,
          kind: item.kind, status: "pending_confirmation" as const }));
        if (result.interviewProposals?.length || result.interviewStates?.length) {
          if (!interview || !result.interviewPlan) throw conflict();
          // Validate again at the durable boundary, not only in the graph. Arbitrary
          // source IDs and other conversations can never become proposal evidence.
          const ids = (result.interviewProposals ?? []).flatMap(item => item.memoryId ? [item.memoryId] : []);
          const confirmed = ids.length ? await tx.select({ id: miraCoachMemoryProposals.id, text: miraCoachMemoryProposals.text, kind: miraCoachMemoryProposals.kind })
            .from(miraCoachMemoryProposals).innerJoin(miraCoachTurns, eq(miraCoachMemoryProposals.turnId, miraCoachTurns.id))
            .where(and(eq(miraCoachTurns.conversationId, row.id), eq(miraCoachTurns.status, "complete"), eq(miraCoachMemoryProposals.status, "confirmed"), inArray(miraCoachMemoryProposals.id, ids))) : [];
          validateInterviewMappings(result, { ...result.interviewPlan, coverage: interview.coverage.areas.map(({ area, status }) => ({ area, status })),
            pendingAreas: (interview.coverage.proposals ?? []).map(item => item.area) }, confirmed.map(item => ({ ...item, confirmed: true })), input.message);
          interview.ledger.proposals ??= [];
          for (const observation of result.interviewStates ?? []) {
            interview.ledger.stateObservations = [...(interview.ledger.stateObservations ?? []).filter(item => item.area !== observation.area), { ...observation, sourceRequestId: input.requestId }];
            for (const previous of interview.ledger.proposals) if (previous.area === observation.area && previous.status === "pending") previous.status = "superseded";
            interview.ledger.reviewedFingerprint = null;
          }
          for (const item of result.interviewProposals ?? []) {
            const memory = item.memoryId ? confirmed.find(memory => memory.id === item.memoryId)! : memoryRows[item.memoryProposalIndex!]!;
            const id = interviewProposalId(interview.ledger.configurationKey, item.area, memory.id, memory.text);
            // Keep dismissal durable, bound history, and never replace a review.
            if (interview.ledger.proposals.some(proposal => proposal.area === item.area && proposal.memoryHash === interviewMemoryHash(memory.text) && proposal.status !== "superseded") || interview.ledger.proposals.length >= 90) continue;
            for (const previous of interview.ledger.proposals) if (previous.area === item.area && previous.status === "pending") previous.status = "superseded";
            interview.ledger.stateObservations = interview.ledger.stateObservations?.filter(observation => observation.area !== item.area);
            interview.ledger.proposals.push({ id, area: item.area, memoryId: memory.id, memoryHash: interviewMemoryHash(memory.text), sourceRequestId: input.requestId, status: "pending", ...(item.correctionQuote ? { correctionQuote: item.correctionQuote } : {}) });
            interview.ledger.reviewedFingerprint = null;
          }
          const ledger = interviewLedgerSchema.parse(interview.ledger);
          await tx.insert(miraCoachInterviews).values({ conversationId: row.id, ledger }).onDuplicateKeyUpdate({ set: { ledger } });
        }
        await tx.update(miraCoachTurns).set({ status: "complete", result, completedAt: time,
          leaseToken: null, leaseUntil: null }).where(eq(miraCoachTurns.id, prior.id));
        if (memoryRows.length) await tx.insert(miraCoachMemoryProposals).values(memoryRows);
        await tx.update(miraCoachConversations).set({ revision: row.revision + 1 })
          .where(eq(miraCoachConversations.id, row.id));
        return result;
      });
    },
    async abandonTurn(input: Parameters<CoachDependencies["abandonTurn"]>[0]) {
      // Cleanup removes no data and grants no access; restrict to the original actor and lease.
      await db.transaction(async tx => {
        const [row] = await tx.select().from(miraCoachConversations).where(and(
          eq(miraCoachConversations.id, input.scope.conversationId), eq(miraCoachConversations.workspaceId, input.scope.workspaceId),
          eq(miraCoachConversations.ownerUserId, input.scope.userId),
        )).for("update");
        if (!row) return;
        if (options.callEnabled && options.interviewEnabled) {
          const clock = await loadCallClock(tx, input.scope);
          if (clock?.claim?.leaseToken === input.leaseToken && clock.claim.requestId === input.requestId && clock.claim.conversationId === row.id) {
            clock.claim = null; await persistCallClock(tx, input.scope, clock);
          }
        }
        await tx.update(miraCoachTurns).set({ status: "retryable_error", leaseToken: null, leaseUntil: null }).where(and(
          eq(miraCoachTurns.conversationId, row.id), eq(miraCoachTurns.requestId, input.requestId),
          eq(miraCoachTurns.status, "processing"), eq(miraCoachTurns.leaseToken, input.leaseToken),
        ));
      });
    },
  };
  return store;
}
