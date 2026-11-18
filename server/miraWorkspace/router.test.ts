import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { createWorkspaceRouter } from "./router";
import type { BrandWorkspace, WorkspaceRepository } from "./repository";

function fixture(userId: number | null = 1) {
  let row: BrandWorkspace = { id: 10, ownerUserId: 1, name: "Original", status: "active", createdAt: new Date(), updatedAt: new Date() };
  const update = vi.fn(async (patch: Partial<BrandWorkspace>) => { row = { ...row, ...patch }; return row; });
  const create = vi.fn(async (ownerUserId: number, name: string) => ({ ...row, ownerUserId, name }));
  const list = vi.fn(async () => [row]);
  const repository: WorkspaceRepository = {
    create, list,
    async withWorkspace(id, _userId, run) {
      return run(id !== row.id ? null : {
        workspace: row,
        memberships: [
          { workspaceId: 10, userId: 2, role: "editor", status: "active" },
          { workspaceId: 10, userId: 3, role: "viewer", status: "active" },
          { workspaceId: 10, userId: 4, role: "editor", status: "revoked" },
          { workspaceId: 99, userId: 5, role: "editor", status: "active" },
        ], update,
      });
    },
  };
  const caller = createWorkspaceRouter(repository).createCaller({
    user: userId === null ? null : { id: userId }, req: {}, res: {},
  } as TrpcContext);
  return { caller, create, list, update };
}

describe("authenticated brand workspace API", () => {
  it("requires authentication for every operation", async () => {
    const { caller, create, list, update } = fixture(null);
    for (const call of [
      () => caller.create({ name: "Brand" }), () => caller.list(), () => caller.get({ id: 10 }),
      () => caller.rename({ id: 10, name: "Changed" }), () => caller.setStatus({ id: 10, status: "archived" }),
    ]) await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(create).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it("sets ownership from the authenticated identity and accepts no shoot or entitlement fields", async () => {
    const { caller, create } = fixture(7);
    expect(await caller.create({ name: "  New brand " })).toMatchObject({ ownerUserId: 7, name: "New brand" });
    expect(create).toHaveBeenCalledWith(7, "New brand");
    await expect(caller.create({ name: "Bad", ownerUserId: 8 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.create({ name: "Bad", capability: "shoot_preparation" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("passes the authenticated identity and pagination cursor to the scoped repository", async () => {
    const { caller, list } = fixture(2);
    await caller.list(); expect(list).toHaveBeenLastCalledWith(2, undefined);
    await caller.list({ beforeId: 8 }); expect(list).toHaveBeenLastCalledWith(2, 8);
    await expect(caller.list({ beforeId: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each([1, 2, 3])("allows authorised reader %s without exposing membership records", async userId => {
    expect(await fixture(userId).caller.get({ id: 10 })).toMatchObject({ id: 10, name: "Original" });
    expect(await fixture(userId).caller.get({ id: 10 })).not.toHaveProperty("memberships");
  });

  it.each([4, 5, 6])("hides brands and prevents writes for unauthorised user %s", async userId => {
    const { caller, update } = fixture(userId);
    await expect(caller.get({ id: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.get({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.rename({ id: 10, name: "Stolen" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.setStatus({ id: 10, status: "archived" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(update).not.toHaveBeenCalled();
  });

  it("allows editor renaming but reserves lifecycle management to the owner", async () => {
    const { caller, update } = fixture(2);
    expect(await caller.rename({ id: 10, name: "Updated" })).toMatchObject({ name: "Updated" });
    await expect(caller.setStatus({ id: 10, status: "archived" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("prevents viewer changes and rejects ownership injection", async () => {
    const { caller, update } = fixture(3);
    await expect(caller.rename({ id: 10, name: "Changed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fixture().caller.rename({ id: 10, name: "Changed", ownerUserId: 9 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).not.toHaveBeenCalled();
  });

  it("lets the owner archive and restore, with editing blocked while archived", async () => {
    const { caller } = fixture();
    await caller.setStatus({ id: 10, status: "archived" });
    expect(await caller.get({ id: 10 })).toMatchObject({ status: "archived" });
    await expect(caller.rename({ id: 10, name: "Changed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller.setStatus({ id: 10, status: "active" });
    expect(await caller.rename({ id: 10, name: "Restored" })).toMatchObject({ name: "Restored" });
  });
});
