import { z } from "zod";

export const WORKSPACE_STATUSES = ["active", "archived"] as const;
// Ownership comes from the workspace row, never a self-assigned membership.
export const WORKSPACE_MEMBER_ROLES = ["editor", "viewer"] as const;
export const WORKSPACE_MEMBER_STATUSES = ["active", "revoked"] as const;
export const WORKSPACE_CAPABILITIES = [
  "brand_coaching", "brand_book", "launch_support", "shoot_preparation",
] as const;
export const WORKSPACE_GRANT_STATUSES = ["active", "suspended", "revoked"] as const;
export const workspaceStatusSchema = z.enum(WORKSPACE_STATUSES);
export const workspaceMemberRoleSchema = z.enum(WORKSPACE_MEMBER_ROLES);
export const workspaceMemberStatusSchema = z.enum(WORKSPACE_MEMBER_STATUSES);
export const workspaceCapabilitySchema = z.enum(WORKSPACE_CAPABILITIES);
export const workspaceGrantStatusSchema = z.enum(WORKSPACE_GRANT_STATUSES);

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
}).strict();

export const workspaceIdInputSchema = z.object({ id: z.number().int().positive() }).strict();
export const updateWorkspaceInputSchema = workspaceIdInputSchema.extend({
  name: z.string().trim().min(1).max(200),
}).strict();
export const workspaceStatusInputSchema = workspaceIdInputSchema.extend({
  status: workspaceStatusSchema,
}).strict();

export type WorkspaceCapability = z.infer<typeof workspaceCapabilitySchema>;
export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;
export type WorkspaceMemberRole = z.infer<typeof workspaceMemberRoleSchema>;
export type WorkspaceMemberStatus = z.infer<typeof workspaceMemberStatusSchema>;
export type WorkspaceGrantStatus = z.infer<typeof workspaceGrantStatusSchema>;
