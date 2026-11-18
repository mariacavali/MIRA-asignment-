import type {
  WorkspaceCapability, WorkspaceGrantStatus, WorkspaceMemberRole,
  WorkspaceMemberStatus, WorkspaceStatus,
} from "../../shared/miraWorkspace";

export type WorkspaceAccessContext = {
  userId: number | null;
  workspace: { id: number; ownerUserId: number; status: WorkspaceStatus };
  memberships: Array<{
    workspaceId: number; userId: number;
    role: WorkspaceMemberRole; status: WorkspaceMemberStatus;
  }>;
};

export type WorkspaceGrant = {
  workspaceId: number;
  capability: WorkspaceCapability;
  status: WorkspaceGrantStatus;
  startsAt: Date;
  expiresAt: Date | null;
};

// Input must be assembled from authenticated identity and server-loaded records.
// A shoot invitation, photographer subscription or global admin role is not membership.
export function workspaceRole(context: WorkspaceAccessContext): "owner" | WorkspaceMemberRole | null {
  const { userId, workspace } = context;
  if (userId === null || !Number.isSafeInteger(userId) || userId <= 0) return null;
  if (workspace.ownerUserId === userId) return "owner";
  return context.memberships.find(member => member.workspaceId === workspace.id
    && member.userId === userId && member.status === "active")?.role ?? null;
}

export function canAccessWorkspace(context: WorkspaceAccessContext, action: "read" | "edit" | "manage"): boolean {
  const role = workspaceRole(context);
  if (!role) return false;
  if (action === "read") return true;
  if (action === "manage") return role === "owner";
  return context.workspace.status === "active" && (role === "owner" || role === "editor");
}

export function canUseWorkspaceCapability(
  context: WorkspaceAccessContext,
  capability: WorkspaceCapability,
  grants: WorkspaceGrant[],
  now: Date,
): boolean {
  if (!canAccessWorkspace(context, "edit") || !Number.isFinite(now.getTime())) return false;
  return grants.some(grant => grant.workspaceId === context.workspace.id
    && grant.capability === capability && grant.status === "active"
    && grant.startsAt.getTime() <= now.getTime()
    && (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime()));
}
