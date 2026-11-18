import { randomUUID } from "node:crypto";
import { desc, eq, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { miraKnowledgeCatalogue as catalogue, miraKnowledgeReleases as releases, miraKnowledgeVersions as versions, miraKnowledgeWithdrawals as withdrawals } from "../../drizzle/schema";
import { reviewKnowledgeInputSchema, publishKnowledgeInputSchema, withdrawKnowledgeInputSchema, fullBookPassageReady, type KnowledgeBundle, type KnowledgeReviews } from "../../shared/miraKnowledge";
import { normaliseBundle, contentHash, bundleEntries, entryKey } from "./schema";
import { publicationProblems, knowledgeDiff } from "./publish";
import type { getDb } from "../db";
import type { z } from "zod";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const conflict = (message = "The knowledge library changed. Refresh the review before continuing.") => new TRPCError({ code: "CONFLICT", message });
const decode = <T>(value: T): T => typeof value === "string" ? JSON.parse(value) : value;

// Internal trusted-editor service. Only the admin router exposes mutations.
// All operations take the single catalogue lock; imports/reviews/publication/withdrawal serialize.
export function createKnowledgeRepository(db: Database, now: () => Date = () => new Date()) {
  async function lock(tx: Tx) {
    await tx.insert(catalogue).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
    const [state] = await tx.select().from(catalogue).where(eq(catalogue.id, 1)).for("update");
    return state;
  }
  async function release(tx: Tx, id: string) {
    const [row] = await tx.select().from(releases).where(eq(releases.id, id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge release not found." });
    return { ...row, bundle: normaliseBundle(decode(row.bundle)), reviews: decode(row.reviews) };
  }
  async function withdrawnKeys(tx: Tx, bundle: KnowledgeBundle) {
    return new Set((await tx.select({ key: withdrawals.key }).from(withdrawals).where(inArray(withdrawals.key, bundleEntries(bundle).map(e => e.key)))).map(row => row.key));
  }
  async function bump(tx: Tx, revision: number) {
    await tx.update(catalogue).set({ revision: revision + 1 }).where(eq(catalogue.id, 1));
    return revision + 1;
  }
  return {
    async listReleases(beforeId?: string) {
      const rows = await db.select({ id: releases.id, hash: releases.hash, status: releases.status, createdAt: releases.createdAt })
        .from(releases).where(beforeId ? lt(releases.id, beforeId) : undefined).orderBy(desc(releases.id)).limit(21);
      const page = rows.slice(0, 20);
      return { releases: page, nextCursor: rows.length > 20 ? page[page.length - 1].id : null };
    },
    async status() {
      return db.transaction(async tx => {
        const state = await lock(tx);
        return { revision: state.revision, activeReleaseId: state.activeReleaseId };
      });
    },
    async importDraft(actorUserId: number, raw: unknown, expectedRevision: number) {
      const bundle = normaliseBundle(raw), hash = contentHash(bundle);
      return db.transaction(async tx => {
        const state = await lock(tx);
        const [prior] = await tx.select({ id: releases.id }).from(releases).where(eq(releases.hash, hash));
        if (prior) return { releaseId: prior.id, hash, revision: state.revision, repeated: true };
        if (state.revision !== expectedRevision) throw conflict();
        for (const entry of bundleEntries(bundle)) {
          const [old] = await tx.select().from(versions).where(eq(versions.key, entry.key));
          if (old && old.hash !== entry.hash) throw conflict(`Content changed for ${entry.key}; increase its version.`);
          if (!old) await tx.insert(versions).values(entry);
        }
        const id = randomUUID();
        await tx.insert(releases).values({ id, hash, bundle, reviews: {}, importedByUserId: actorUserId });
        return { releaseId: id, hash, revision: await bump(tx, state.revision), repeated: false };
      });
    },
    async inspect(releaseId: string) {
      return db.transaction(async tx => {
        const state = await lock(tx), row = await release(tx, releaseId);
        const previous = state.activeReleaseId ? await release(tx, state.activeReleaseId) : null;
        const withdrawn = await withdrawnKeys(tx, row.bundle);
        return { revision: state.revision, release: row, diff: knowledgeDiff(previous?.bundle ?? null, row.bundle),
          publicationProblems: publicationProblems(row.bundle, row.reviews, withdrawn), withdrawnKeys: Array.from(withdrawn) };
      });
    },
    async review(actorUserId: number, reviewer: string, raw: z.infer<typeof reviewKnowledgeInputSchema>) {
      const input = reviewKnowledgeInputSchema.parse(raw);
      return db.transaction(async tx => {
        const state = await lock(tx), row = await release(tx, input.releaseId);
        if (state.revision !== input.expectedRevision || row.status !== "draft") throw conflict();
        const key = entryKey(input.kind, input.ref);
        if (!bundleEntries(row.bundle).some(e => e.key === key)) throw new TRPCError({ code: "BAD_REQUEST", message: "The reviewed entry is not part of this release." });
        if (input.approved && input.kind !== "source" && !input.evaluationCaseIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Record the evaluation cases before approving knowledge." });
        if (!reviewer.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A named reviewer is required." });
        const reviews: KnowledgeReviews = { ...row.reviews, [key]: { actorUserId, reviewer, at: now().toISOString(), approved: input.approved, reason: input.reason, evaluationCaseIds: input.evaluationCaseIds } };
        await tx.update(releases).set({ reviews }).where(eq(releases.id, row.id));
        return { revision: await bump(tx, state.revision) };
      });
    },
    async publish(actorUserId: number, raw: z.infer<typeof publishKnowledgeInputSchema>) {
      const input = publishKnowledgeInputSchema.parse(raw);
      return db.transaction(async tx => {
        const state = await lock(tx), row = await release(tx, input.releaseId);
        if (input.expectedHash !== row.hash || contentHash(row.bundle) !== row.hash) throw conflict();
        if (row.status === "published" && state.activeReleaseId === row.id) return { revision: state.revision, releaseId: row.id };
        if (state.revision !== input.expectedRevision || row.status !== "draft") throw conflict();
        const problems = publicationProblems(row.bundle, row.reviews, await withdrawnKeys(tx, row.bundle));
        if (problems.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Resolve source permissions, reviews and evaluations before publishing." });
        await tx.update(releases).set({ status: "published", publishedByUserId: actorUserId, publishedAt: now(), parentReleaseId: state.activeReleaseId }).where(eq(releases.id, row.id));
        await tx.update(catalogue).set({ activeReleaseId: row.id, revision: state.revision + 1 }).where(eq(catalogue.id, 1));
        return { revision: state.revision + 1, releaseId: row.id };
      });
    },
    async withdraw(actorUserId: number, raw: z.infer<typeof withdrawKnowledgeInputSchema>) {
      const input = withdrawKnowledgeInputSchema.parse(raw), key = entryKey(input.kind, input.ref);
      return db.transaction(async tx => {
        const state = await lock(tx);
        const [existing] = await tx.select().from(withdrawals).where(eq(withdrawals.key, key));
        if (existing) return { revision: state.revision };
        if (state.revision !== input.expectedRevision) throw conflict();
        const [entry] = await tx.select().from(versions).where(eq(versions.key, key));
        if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge entry not found." });
        await tx.insert(withdrawals).values({ key, actorUserId, reason: input.reason });
        return { revision: await bump(tx, state.revision) };
      });
    },
    // Internal runtime boundary: returns only the active published, reviewed, non-withdrawn material.
    // Corpus identity includes the withdrawal revision; do not cache by release ID alone.
    async publishedSnapshot() {
      return db.transaction(async tx => {
        const state = await lock(tx);
        if (!state.activeReleaseId) return { releaseId: null, hash: null, revision: state.revision, items: [] as KnowledgeBundle["items"], sources: [] as KnowledgeBundle["sources"] };
        const row = await release(tx, state.activeReleaseId), withdrawn = await withdrawnKeys(tx, row.bundle);
        if (row.status !== "published" || contentHash(row.bundle) !== row.hash) throw new Error("Invalid active knowledge release.");
        const sources = row.bundle.sources.filter(s => !withdrawn.has(entryKey("source", s)) && s.rightsBasis !== "pending" && row.reviews[entryKey("source", s)]?.approved);
        const items = row.bundle.items.filter(item => !withdrawn.has(entryKey(item.kind, item)) && row.reviews[entryKey(item.kind, item)]?.approved
          && row.reviews[entryKey(item.kind, item)]?.evaluationCaseIds.length
          && item.sourceRefs.every(ref => sources.some(s => s.id === ref.id && s.version === ref.version)) && fullBookPassageReady(item, sources));
        return { releaseId: row.id, hash: row.hash, revision: state.revision, items, sources };
      });
    },
  };
}
