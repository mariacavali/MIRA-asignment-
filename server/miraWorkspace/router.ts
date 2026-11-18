import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createWorkspaceInputSchema, updateWorkspaceInputSchema, workspaceIdInputSchema, workspaceStatusInputSchema } from "../../shared/miraWorkspace";
import { canAccessWorkspace } from "./access";
import { workspaceRepository, type WorkspaceRepository, type WorkspaceSession } from "./repository";

function requireAccess(session: WorkspaceSession | null, userId: number, action: "read" | "edit" | "manage") {
  // Unknown and inaccessible IDs return the same response.
  if (!session || !canAccessWorkspace({ userId, workspace: session.workspace, memberships: session.memberships }, "read")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand workspace not found." });
  }
  if (!canAccessWorkspace({ userId, workspace: session.workspace, memberships: session.memberships }, action)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This action is not available for your workspace access." });
  }
  return session;
}

export function createWorkspaceRouter(repository: WorkspaceRepository) {
  return router({
    create: protectedProcedure.input(createWorkspaceInputSchema).mutation(({ ctx, input }) => repository.create(ctx.user.id, input.name)),
    list: protectedProcedure.input(z.object({ beforeId: z.number().int().positive().optional() }).strict().default({}))
      .query(({ ctx, input }) => repository.list(ctx.user.id, input.beforeId)),
    get: protectedProcedure.input(workspaceIdInputSchema).query(({ ctx, input }) =>
      repository.withWorkspace(input.id, ctx.user.id, async session => requireAccess(session, ctx.user.id, "read").workspace)),
    rename: protectedProcedure.input(updateWorkspaceInputSchema).mutation(({ ctx, input }) =>
      repository.withWorkspace(input.id, ctx.user.id, async session => requireAccess(session, ctx.user.id, "edit").update({ name: input.name }))),
    setStatus: protectedProcedure.input(workspaceStatusInputSchema).mutation(({ ctx, input }) =>
      repository.withWorkspace(input.id, ctx.user.id, async session => requireAccess(session, ctx.user.id, "manage").update({ status: input.status }))),
  });
}

export const miraWorkspaceRouter = createWorkspaceRouter(workspaceRepository);
