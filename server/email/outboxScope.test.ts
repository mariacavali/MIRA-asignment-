import { describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
import { DrizzleEmailOutboxRepository } from "./outbox";
import { CLIENT_REMINDER_MILESTONES } from "../../shared/miraClientPreferences";

it("restricts both the production claim SELECT and atomic UPDATE to explicit reminder IDs", async () => {
  const conditions: SQL[] = [];
  const now = new Date("2026-10-01T12:00:00Z");
  const row = { id: 7, shootId: 4, invitationId: "invite", milestoneId: "client_shoot_reminder", scheduledAt: now, status: "pending", attemptCount: 0 };
  mocks.getDb.mockResolvedValue({
    select: () => ({ from: () => ({ where: (condition: SQL) => { conditions.push(condition); return { limit: async () => [row] }; } }) }),
    update: () => ({ set: () => ({ where: async (condition: SQL) => { conditions.push(condition); return [{ affectedRows: 1 }]; } }) }),
  });
  const repository = new DrizzleEmailOutboxRepository(CLIENT_REMINDER_MILESTONES);
  expect((await repository.claimDue(now, 60_000))?.milestoneId).toBe("client_shoot_reminder");
  expect(conditions).toHaveLength(2);
  for (const condition of conditions) {
    const query = new MySqlDialect().sqlToQuery(condition);
    expect(query.sql).toContain("`milestoneId` in (?, ?)");
    expect(query.params).toContain("client_preparation_reminder");
    expect(query.params).toContain("client_shoot_reminder");
    expect(query.params).not.toContain("shoot_room_invitation");
  }
});
