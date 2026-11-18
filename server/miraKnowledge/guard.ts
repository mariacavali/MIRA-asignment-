import { eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { miraKnowledgeCatalogue, miraKnowledgeReleases, miraKnowledgeWithdrawals } from "../../drizzle/schema";
import type { CoachKnowledgeTrace } from "../../shared/miraKnowledgeRetrieval";
import { contentHash, entryKey, normaliseBundle } from "./schema";
import type { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const conflict = () => new TRPCError({ code: "CONFLICT", message: "The guidance changed while MIRA was replying. Please retry." });
// The caller holds the workspace/conversation lock. Hold the catalogue lock through commit.
export async function assertCurrentKnowledge(tx: Tx, trace: CoachKnowledgeTrace, segment: CoachKnowledgeTrace["segment"]) {
  if (trace.status !== "matched") return;
  const [state] = await tx.select().from(miraKnowledgeCatalogue).where(eq(miraKnowledgeCatalogue.id, 1)).for("update");
  if (!state || state.activeReleaseId !== trace.releaseId || (trace.revision === null || state.revision < trace.revision) || segment !== trace.segment) throw conflict();
  const [release] = await tx.select().from(miraKnowledgeReleases).where(eq(miraKnowledgeReleases.id, state.activeReleaseId!));
  if (!release || release.status !== "published" || release.hash !== trace.hash) throw conflict();
  const bundle = normaliseBundle(typeof release.bundle === "string" ? JSON.parse(release.bundle) : release.bundle);
  if (contentHash(bundle) !== trace.hash) throw conflict();
  const keys: string[] = [];
  for (const ref of trace.selected) {
    const item = bundle.items.find(i => i.id === ref.id && i.kind === ref.kind && i.version === ref.version);
    if (!item || !segment || !item.segments.includes(segment)
      || !(item.language === trace.language || item.language === trace.language.split("-")[0])) throw conflict();
    keys.push(entryKey(item.kind, item), ...item.sourceRefs.map(source => entryKey("source", source)));
  }
  if (!keys.length || (await tx.select({ key: miraKnowledgeWithdrawals.key }).from(miraKnowledgeWithdrawals).where(inArray(miraKnowledgeWithdrawals.key, keys))).length) throw conflict();
}
