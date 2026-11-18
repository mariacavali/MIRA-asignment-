import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { miraBrandConfigurations, miraBrandDirections, miraCoachConversations, miraCoachMemoryProposals, miraCoachSources, miraCoachTurns } from "../../drizzle/schema";
import { brandConfigurationSchema, directionPolicy, type DirectionRecord } from "../../shared/miraBrandDirection";
import type { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type DirectionTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
function decodeJson<T>(value: T): T { return typeof value === "string" ? JSON.parse(value) : value; }
export const directionConflict = () => new TRPCError({ code: "CONFLICT", message: "Direction or evidence changed. Refresh and review again." });
export async function directionRepository(tx: DirectionTransaction, workspaceId: number, conversationId: string) {
  const [configurationRow] = await tx.select().from(miraBrandConfigurations).where(eq(miraBrandConfigurations.workspaceId, workspaceId));
  const [row] = await tx.select().from(miraBrandDirections).where(eq(miraBrandDirections.conversationId, conversationId));
  const records = decodeJson(row?.records ?? []);
  const requests = decodeJson(row?.requests ?? {});
  const configuration = configurationRow ? brandConfigurationSchema.parse(decodeJson(configurationRow.configuration)) : null;
  const sources = await tx.select({ id: miraCoachSources.id }).from(miraCoachSources).where(and(eq(miraCoachSources.conversationId, conversationId), eq(miraCoachSources.status, "active")));
  const memories = await tx.select({ id: miraCoachMemoryProposals.id }).from(miraCoachMemoryProposals)
    .innerJoin(miraCoachTurns, eq(miraCoachMemoryProposals.turnId, miraCoachTurns.id))
    .where(and(eq(miraCoachTurns.conversationId, conversationId), eq(miraCoachTurns.status, "complete"), eq(miraCoachMemoryProposals.status, "confirmed")));
  const questions = await tx.select({ id: miraCoachTurns.requestId }).from(miraCoachTurns).where(and(eq(miraCoachTurns.conversationId, conversationId), eq(miraCoachTurns.status, "complete")));
  const questionIds = new Set(questions.map(q => q.id));
  const available = new Set([...sources.map(s => `source:${s.id}`), ...memories.map(m => `memory:${m.id}`)]);
  function supported(record: DirectionRecord) {
    return record.draft.decisions.every(d => d.evidence.every(e => available.has(`${e.kind}:${e.id}`)));
  }
  // Staleness is computed from authoritative evidence on every read, including historical approvals.
  for (const record of records) record.stale ||= !supported(record) || JSON.stringify(brandConfigurationSchema.parse(record.configuration)) !== JSON.stringify(configuration);
  return {
    configuration, records, requests, supported,
    async configure(value: NonNullable<typeof configuration>) {
      // Existing workspace lock serialises configuration changes with every coach operation.
      if (JSON.stringify(configuration) !== JSON.stringify(value)) {
        const aggregates = await tx.select({ conversationId: miraBrandDirections.conversationId, records: miraBrandDirections.records })
          .from(miraBrandDirections).innerJoin(miraCoachConversations, eq(miraBrandDirections.conversationId, miraCoachConversations.id))
          .where(eq(miraCoachConversations.workspaceId, workspaceId));
        for (const aggregate of aggregates) {
          const history = decodeJson(aggregate.records);
          for (const record of history) record.stale = true;
          await tx.update(miraBrandDirections).set({ records: history }).where(eq(miraBrandDirections.conversationId, aggregate.conversationId));
        }
      }
      await tx.insert(miraBrandConfigurations).values({ workspaceId, configuration: value }).onDuplicateKeyUpdate({ set: { configuration: value } });
    },
    async persist() {
      await tx.insert(miraBrandDirections).values({ conversationId, records, requests }).onDuplicateKeyUpdate({ set: { records, requests } });
    },
    newRecord(draft: DirectionRecord["draft"], parentId: string | null, evidenceRevision: number): DirectionRecord {
      if (!configuration) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the discovery configuration first." });
      if (draft.decisions.some(d => d.knowledge.length || d.questionIds.some(id => !questionIds.has(id)))) throw new TRPCError({ code: "BAD_REQUEST", message: "Use existing conversation turns; published knowledge links are not available yet." });
      const policy = directionPolicy(configuration);
      if (!policy.voice && draft.decisions.some(d => d.dimension === "voice.profile")) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal preparation does not include a voice profile." });
      const record: DirectionRecord = { id: randomUUID(), parentId, evidenceRevision, configuration, draft, reviews: [], state: "draft", stale: false };
      if (!supported(record)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use active sources or confirmed memory from this conversation." });
      if (records.length >= 100) throw new TRPCError({ code: "CONFLICT", message: "Direction history limit reached." });
      records.push(record);
      return record;
    },
  };
}
