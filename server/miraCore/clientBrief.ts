import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { miraShoots, miraShootMemoryRevisions } from "../../drizzle/schema";
import { clientBriefInputSchema, clientBriefSchema, type ClientBrief, type ClientBriefInput } from "../../shared/miraClientBrief";
import { MIRA_SHOOT_MEMORY_SCHEMA_VERSION, shootMemorySchema } from "../../shared/miraCore";
import { getDb } from "../db";
import { emptyShootMemory } from "./memory";
import { readBrandPage } from "./brandWebsite";

function memorySnapshot(raw: unknown) {
  return shootMemorySchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw ?? emptyShootMemory());
}

export async function getClientBrief(shootId: number): Promise<ClientBrief | null> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your preparation could not be loaded." });
  const rows = await db.select().from(miraShootMemoryRevisions).where(eq(miraShootMemoryRevisions.shootId, shootId)).orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
  return memorySnapshot(rows[0]?.snapshotJson).clientBrief ?? null;
}

const reading = new Set<number>();
const nextReadAt = new Map<number, number>();
export async function saveClientBrief(shootId: number, photographerUserId: number, raw: ClientBriefInput): Promise<ClientBrief> {
  const input = clientBriefInputSchema.parse(raw);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your preparation could not be saved." });
  if (reading.has(shootId)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Your links are already being read. Please wait." });
  reading.add(shootId);
  try {
    const previous = await getClientBrief(shootId);
    const urls = Array.from(new Set(input.brandUrls));
    const requiresRead = urls.some(url => {
      const page = previous?.brandPages.find(item => item.url === url);
      return !page || (page.status === "unavailable" && Date.now() - Date.parse(page.checkedAt) >= 60_000);
    });
    if (requiresRead) {
      const now = Date.now();
      nextReadAt.forEach((until, id) => { if (until <= now) nextReadAt.delete(id); });
      if ((nextReadAt.get(shootId) ?? 0) > now) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait a minute before reading more links." });
      nextReadAt.set(shootId, now + 60_000);
    }
    // Cache successful reads; failed reads can be explicitly retried after a
    // minute. No site visit on ordinary room/status requests or poll cycles.
    const brandPages = await Promise.all(urls.map(url => {
      const cached = previous?.brandPages.find(page => page.url === url);
      return cached && (cached.status === "read" || Date.now() - Date.parse(cached.checkedAt) < 60_000) ? cached : readBrandPage(url);
    }));
    const brief = clientBriefSchema.parse({ brandFeel: Array.from(new Set(input.brandFeel)), posingSupport: input.posingSupport, comfortNote: input.comfortNote, brandPages, savedAt: new Date().toISOString() });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await db.transaction(async tx => {
          const owned = await tx.select().from(miraShoots).where(and(eq(miraShoots.id, shootId), eq(miraShoots.photographerUserId, photographerUserId))).limit(1).for("update");
          if (!owned[0]) throw new TRPCError({ code: "NOT_FOUND" });
          if (["discovery_confirmed", "preparation_active"].includes(owned[0].roomState)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your direction is already confirmed. Discuss changes with your photographer." });
          const rows = await tx.select().from(miraShootMemoryRevisions).where(eq(miraShootMemoryRevisions.shootId, shootId)).orderBy(desc(miraShootMemoryRevisions.version)).limit(1);
          const next = shootMemorySchema.parse({ ...memorySnapshot(rows[0]?.snapshotJson), clientBrief: brief });
          await tx.insert(miraShootMemoryRevisions).values({ shootId, photographerUserId, version: (rows[0]?.version ?? 0) + 1, schemaVersion: MIRA_SHOOT_MEMORY_SCHEMA_VERSION, source: "system", snapshotJson: next });
          return brief;
        });
      } catch (error) {
        const dbError = error as { code?: string; cause?: { code?: string } };
        if (attempt < 2 && (dbError.code === "ER_DUP_ENTRY" || dbError.cause?.code === "ER_DUP_ENTRY")) continue;
        throw error;
      }
    }
    throw new Error("Unable to save preparation");
  } finally { reading.delete(shootId); }
}
