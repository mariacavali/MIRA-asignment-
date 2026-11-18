import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { TrpcContext } from "../_core/context";

const database = vi.hoisted(() => ({ current: null as ReturnType<typeof drizzle> | null }));
vi.mock("../db", () => ({ getDb: async () => database.current }));
import { createWorkspaceRouter } from "./router";
import { workspaceRepository } from "./repository";

// Socket-only, explicit opt-in: never use DATABASE_URL or an existing database.
const enabled = process.env.RUN_MIRA_DB_TESTS === "1";
describe.skipIf(!enabled)("workspace SQL integration (isolated database)", () => {
  const name = `test_mira_workspace_${randomUUID().replaceAll("-", "")}`;
  let connection: mysql.Connection | undefined;
  let created = false;
  let workspaceId: number;
  const caller = (id: number) => createWorkspaceRouter(workspaceRepository).createCaller({
    user: { id }, req: {}, res: {},
  } as TrpcContext);

  beforeAll(async () => {
    const socketPath = process.env.MIRA_TEST_DB_SOCKET;
    if (!socketPath?.startsWith("/")) throw new Error("Set MIRA_TEST_DB_SOCKET to an isolated local MariaDB socket.");
    connection = await mysql.createConnection({ socketPath, user: "root", multipleStatements: false });
    await connection.query(`CREATE DATABASE \`${name}\``);
    created = true;
    await connection.changeUser({ database: name });
    // Existing auth-user IDs are the only prerequisite of the additive migration.
    await connection.query("CREATE TABLE users (id int NOT NULL PRIMARY KEY)");
    await connection.query("INSERT INTO users (id) VALUES (1), (2), (3), (4), (5), (6)");
    const sql = readFileSync(new URL("../../drizzle/0019_mira_brand_workspaces.sql", import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    const directionSql = readFileSync(new URL("../../drizzle/0022_mira_brand_directions.sql", import.meta.url), "utf8");
    // Direction tables require the conversation migration too.
    for (const file of ["0020_mira_coach_conversations.sql", "0021_mira_coach_sources.sql"]) {
      for (const statement of readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), "utf8").split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await connection.query(statement);
    }
    for (const statement of directionSql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await connection.query(statement);
    database.current = drizzle(connection);
  }, 15_000);

  afterAll(async () => {
    database.current = null;
    try {
      if (connection && created) await connection.query(`DROP DATABASE \`${name}\``);
    } finally { await connection?.end(); }
  });

  it("creates a brand without shoots or grants", async () => {
    const row = await caller(1).create({ name: "Standalone SQL brand" });
    workspaceId = row.id;
    expect(row).toMatchObject({ ownerUserId: 1, status: "active", name: "Standalone SQL brand" });
    const [rows] = await connection!.query<mysql.RowDataPacket[]>("SELECT * FROM mira_workspace_grants");
    expect(rows).toHaveLength(0);
    await expect(caller(6).get({ id: workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("scopes lists to owner and active memberships with pagination", async () => {
    await connection!.execute("INSERT INTO mira_workspace_members (workspaceId, userId, role, status) VALUES (?,2,'editor','active'), (?,3,'viewer','active'), (?,4,'editor','revoked')", [workspaceId, workspaceId, workspaceId]);
    const other = await caller(5).create({ name: "Another client's brand" });
    for (const id of [1, 2, 3]) expect((await caller(id).list()).map(row => row.id)).toEqual([workspaceId]);
    for (const id of [4, 6]) expect(await caller(id).list()).toEqual([]);
    expect((await caller(5).list()).map(row => row.id)).toEqual([other.id]);
    expect(await caller(1).list({ beforeId: workspaceId })).toEqual([]);
  });

  it("enforces role and revocation checks against persisted records", async () => {
    expect(await caller(2).rename({ id: workspaceId, name: "Editor update" })).toMatchObject({ name: "Editor update" });
    await expect(caller(3).rename({ id: workspaceId, name: "Viewer update" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(2).setStatus({ id: workspaceId, status: "archived" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await connection!.execute("UPDATE mira_workspace_members SET status='revoked' WHERE workspaceId=? AND userId=2", [workspaceId]);
    await expect(caller(2).get({ id: workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller(2).list()).toEqual([]);
    expect(await caller(1).get({ id: workspaceId })).toMatchObject({ name: "Editor update" });
  });

  it("archives and restores without affecting another client", async () => {
    await caller(1).setStatus({ id: workspaceId, status: "archived" });
    await expect(caller(1).rename({ id: workspaceId, name: "Blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await caller(3).get({ id: workspaceId })).toMatchObject({ status: "archived" });
    await caller(1).setStatus({ id: workspaceId, status: "active" });
    expect(await caller(1).rename({ id: workspaceId, name: "Restored" })).toMatchObject({ name: "Restored" });
    expect((await caller(5).list())[0]).toMatchObject({ name: "Another client's brand", status: "active" });
  });

  it("enforces foreign keys and unique membership/grant constraints", async () => {
    await expect(connection!.execute("INSERT INTO mira_workspace_members (workspaceId,userId,role) VALUES (?,3,'editor')", [workspaceId])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await expect(connection!.execute("INSERT INTO mira_brand_workspaces (ownerUserId,name) VALUES (999,'Invalid owner')")).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
    const sql = "INSERT INTO mira_workspace_grants (workspaceId,capability,startsAt,sourceReference) VALUES (?,'brand_coaching',NOW(),'synthetic-test')";
    await connection!.execute(sql, [workspaceId]);
    await expect(connection!.execute(sql, [workspaceId])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    const [rows] = await connection!.execute<mysql.RowDataPacket[]>("SELECT status FROM mira_workspace_grants WHERE workspaceId=?", [workspaceId]);
    expect(rows[0].status).toBe("suspended");
  });
});
