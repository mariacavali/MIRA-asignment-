import { and, desc, eq, lt, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { miraBrandWorkspaces, miraWorkspaceMembers } from "../../drizzle/schema";
import { getDb } from "../db";
import type { WorkspaceAccessContext } from "./access";
import type { WorkspaceStatus } from "../../shared/miraWorkspace";

export type BrandWorkspace = typeof miraBrandWorkspaces.$inferSelect;
export type WorkspaceSession = {
  workspace: BrandWorkspace;
  memberships: WorkspaceAccessContext["memberships"];
  update(patch: { name?: string; status?: WorkspaceStatus }): Promise<BrandWorkspace>;
};
export interface WorkspaceRepository {
  create(ownerUserId: number, name: string): Promise<BrandWorkspace>;
  list(userId: number, beforeId?: number): Promise<BrandWorkspace[]>;
  withWorkspace<T>(id: number, userId: number, run: (session: WorkspaceSession | null) => Promise<T>): Promise<T>;
}

async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Brand workspaces require a database connection." });
  return db;
}

export const workspaceRepository: WorkspaceRepository = {
  async create(ownerUserId, name) {
    const db = await requireDatabase();
    return db.transaction(async tx => {
      const [created] = await tx.insert(miraBrandWorkspaces).values({ ownerUserId, name }).$returningId();
      const [row] = await tx.select().from(miraBrandWorkspaces).where(eq(miraBrandWorkspaces.id, created.id));
      return row;
    });
  },
  async list(userId, beforeId) {
    const db = await requireDatabase();
    // Membership is joined for this identity only; revoked members cannot discover brands.
    const rows = await db.select({ workspace: miraBrandWorkspaces }).from(miraBrandWorkspaces)
      .leftJoin(miraWorkspaceMembers, and(
        eq(miraWorkspaceMembers.workspaceId, miraBrandWorkspaces.id),
        eq(miraWorkspaceMembers.userId, userId), eq(miraWorkspaceMembers.status, "active"),
      ))
      .where(and(
        or(eq(miraBrandWorkspaces.ownerUserId, userId), eq(miraWorkspaceMembers.userId, userId)),
        beforeId === undefined ? undefined : lt(miraBrandWorkspaces.id, beforeId),
      )).orderBy(desc(miraBrandWorkspaces.id)).limit(50);
    return rows.map(row => row.workspace);
  },
  async withWorkspace(id, userId, run) {
    const db = await requireDatabase();
    return db.transaction(async tx => {
      const [workspace] = await tx.select().from(miraBrandWorkspaces)
        .where(eq(miraBrandWorkspaces.id, id)).for("update");
      if (!workspace) return run(null);
      const memberships = await tx.select().from(miraWorkspaceMembers).where(and(
        eq(miraWorkspaceMembers.workspaceId, id), eq(miraWorkspaceMembers.userId, userId),
      )).for("update");
      return run({ workspace, memberships, async update(patch) {
        await tx.update(miraBrandWorkspaces).set(patch).where(eq(miraBrandWorkspaces.id, id));
        const [updated] = await tx.select().from(miraBrandWorkspaces).where(eq(miraBrandWorkspaces.id, id));
        return updated;
      } });
    });
  },
};
