import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { miraBrandWorkspaces, miraWorkspaceMembers, miraWorkspaceGrants } from "../../drizzle/schema";
import { createWorkspaceInputSchema } from "../../shared/miraWorkspace";
import { canAccessWorkspace, canUseWorkspaceCapability, type WorkspaceAccessContext, type WorkspaceGrant } from "./access";

const now = new Date("2026-10-15T12:00:00Z");
function context(userId: number | null = 1): WorkspaceAccessContext {
  return {
    userId,
    workspace: { id: 10, ownerUserId: 1, status: "active" },
    memberships: [
      { workspaceId: 10, userId: 2, role: "editor", status: "active" },
      { workspaceId: 10, userId: 3, role: "viewer", status: "active" },
      { workspaceId: 10, userId: 4, role: "editor", status: "revoked" },
      { workspaceId: 99, userId: 5, role: "editor", status: "active" },
    ],
  };
}
function grant(overrides: Partial<WorkspaceGrant> = {}): WorkspaceGrant {
  return { workspaceId: 10, capability: "brand_coaching", status: "active",
    startsAt: new Date("2026-10-01T00:00:00Z"), expiresAt: null, ...overrides };
}

describe("standalone workspace access", () => {
  it.each([
    [1, true, true, true], [2, true, true, false], [3, true, false, false],
    [4, false, false, false], [5, false, false, false], [6, false, false, false],
    [null, false, false, false], [0, false, false, false],
  ])("scopes user %s to read=%s edit=%s manage=%s", (userId, read, edit, manage) => {
    expect(canAccessWorkspace(context(userId), "read")).toBe(read);
    expect(canAccessWorkspace(context(userId), "edit")).toBe(edit);
    expect(canAccessWorkspace(context(userId), "manage")).toBe(manage);
  });

  it("keeps archived brands readable but blocks generation and editing", () => {
    const ctx = context(); ctx.workspace.status = "archived";
    expect(canAccessWorkspace(ctx, "read")).toBe(true);
    expect(canAccessWorkspace(ctx, "edit")).toBe(false);
    expect(canAccessWorkspace(ctx, "manage")).toBe(true); // owner may restore
    expect(canUseWorkspaceCapability(ctx, "brand_coaching", [grant()], now)).toBe(false);
  });

  it("requires an explicit grant even for the owner", () => {
    expect(canUseWorkspaceCapability(context(), "brand_coaching", [], now)).toBe(false);
    expect(canUseWorkspaceCapability(context(), "brand_coaching", [grant()], now)).toBe(true);
    expect(canUseWorkspaceCapability(context(2), "brand_coaching", [grant()], now)).toBe(true);
    expect(canUseWorkspaceCapability(context(3), "brand_coaching", [grant()], now)).toBe(false);
    expect(canUseWorkspaceCapability(context(6), "brand_coaching", [grant()], now)).toBe(false);
  });

  it.each<Partial<WorkspaceGrant>>([
    { workspaceId: 99 }, { capability: "shoot_preparation" }, { status: "suspended" },
    { status: "revoked" }, { startsAt: new Date("2026-10-16T00:00:00Z") },
    { expiresAt: now }, { expiresAt: new Date("2026-10-14T00:00:00Z") },
    { startsAt: new Date("invalid") }, { expiresAt: new Date("invalid") },
  ])("rejects mismatched, inactive or out-of-window grants: %j", overrides => {
    expect(canUseWorkspaceCapability(context(), "brand_coaching", [grant(overrides)], now)).toBe(false);
  });

  it("accepts the start boundary and rejects an invalid clock", () => {
    expect(canUseWorkspaceCapability(context(), "brand_coaching", [grant({ startsAt: now })], now)).toBe(true);
    expect(canUseWorkspaceCapability(context(), "brand_coaching", [grant()], new Date("invalid"))).toBe(false);
  });

  it("does not give a branding customer shoot or launch capabilities", () => {
    expect(canUseWorkspaceCapability(context(), "shoot_preparation", [grant()], now)).toBe(false);
    expect(canUseWorkspaceCapability(context(), "launch_support", [grant()], now)).toBe(false);
  });
});

describe("workspace creation and storage contracts", () => {
  it("requires only a name and rejects client-provided ownership or paid access", () => {
    expect(createWorkspaceInputSchema.parse({ name: "  My brand  " })).toEqual({ name: "My brand" });
    for (const extra of [{ ownerUserId: 9 }, { role: "owner" }, { capability: "brand_coaching" }, { shootId: 1 }]) {
      expect(createWorkspaceInputSchema.safeParse({ name: "My brand", ...extra }).success).toBe(false);
    }
    expect(createWorkspaceInputSchema.safeParse({ name: " " }).success).toBe(false);
  });

  it("stores a brand without requiring a shoot or invitation", () => {
    const config = getTableConfig(miraBrandWorkspaces);
    const requiredInputs = config.columns.filter(column => column.notNull && !column.hasDefault).map(column => column.name);
    expect(requiredInputs.sort()).toEqual(["name", "ownerUserId"]);
    expect(config.foreignKeys.map(key => key.reference().foreignTable)).toHaveLength(1);
  });

  it("prevents duplicate memberships and duplicate current capability grants", () => {
    for (const [table, names] of [
      [miraWorkspaceMembers, ["workspaceId", "userId"]],
      [miraWorkspaceGrants, ["workspaceId", "capability"]],
    ] as const) {
      const config = getTableConfig(table);
      expect(config.indexes.some(index => index.config.unique
        && JSON.stringify(index.config.columns.map(column => "name" in column ? column.name : null)) === JSON.stringify(names))).toBe(true);
    }
    expect(miraWorkspaceGrants.status.default).toBe("suspended");
  });
});
