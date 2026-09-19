import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), available: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./emailOutboxWorker", () => ({ clientReminderInfrastructureAvailable: mocks.available }));
vi.mock("./db", () => ({ calculateShootAccessDeadline: (_at: Date, _duration: number, expiry: Date) => expiry }));
vi.mock("drizzle-orm", async original => ({ ...(await original<typeof import("drizzle-orm")>()),
  eq: (column: { name: string }, value: unknown) => ({ field: column.name, value, op: "eq" }),
  ne: (column: { name: string }, value: unknown) => ({ field: column.name, value, op: "ne" }),
  inArray: (column: { name: string }, value: unknown) => ({ field: column.name, value, op: "in" }),
  and: (...conditions: unknown[]) => conditions.filter(Boolean), desc: () => "desc",
}));
import { miraClientInvitations, miraEmailOutbox, miraShootMemoryRevisions, miraShoots } from "../../drizzle/schema";
import { getClientPreparationPreferences, saveClientPreparationPreferences } from "./clientPreferences";
import { applyShootMemoryPatch, emptyShootMemory } from "./memory";
import { CLIENT_REMINDER_MILESTONES, EMPTY_CLIENT_PREFERENCES } from "../../shared/miraClientPreferences";

const scope = { shootId: 7, photographerUserId: 9, invitationId: "invitation-7" };
function fakeDb(raw: unknown = emptyShootMemory()) {
  const data = {
    shoots: [{ id: 7, photographerUserId: 9, scheduledAt: new Date("2026-10-15T10:00:00Z"), durationMinutes: 60, timezone: "Europe/Amsterdam", status: "draft", clientEmail: "client@example.test" }],
    invitations: [{ id: scope.invitationId, shootId: 7, photographerUserId: 9, status: "active", completedAt: null as Date | null, expiresAt: new Date("2026-10-16T10:00:00Z") }],
    revisions: [{ shootId: 7, version: 3, snapshotJson: raw }],
    jobs: [] as any[],
  };
  const rows = (table: unknown): any[] => table === miraShoots ? data.shoots : table === miraClientInvitations ? data.invitations : table === miraShootMemoryRevisions ? data.revisions : data.jobs;
  function match(row: any, condition: any): boolean {
    if (!condition) return true;
    if (Array.isArray(condition)) return condition.every(item => match(row, item));
    return condition.op === "in" ? condition.value.includes(row[condition.field]) : condition.op === "ne" ? row[condition.field] !== condition.value : row[condition.field] === condition.value;
  }
  let failure: "revision" | "duplicate" | null = null;
  const db: any = {
    data,
    failNext: (kind: "revision" | "duplicate") => { failure = kind; },
    transaction: async (fn: (tx: any) => unknown) => {
      const backup = structuredClone(data);
      try { return await fn(db); }
      catch (error: any) {
        Object.assign(data, backup);
        if (error.code === "ER_DUP_ENTRY") data.revisions.push({ shootId: 7, version: 4, snapshotJson: { ...emptyShootMemory(), concurrentEvidence: "retained" } });
        throw error;
      }
    },
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      const result = rows(table).filter(row => match(row, condition)).map(row => ({ ...row }));
      const query: any = {
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
        for: () => Promise.resolve(result),
        limit: (count: number) => Object.assign(Promise.resolve(result.slice(0, count)), { for: () => Promise.resolve(result.slice(0, count)) }),
        orderBy: () => { result.sort((a, b) => b.version - a.version); return query; },
      };
      return query;
    } }) }),
    insert: (table: unknown) => ({ values: async (row: any) => {
      if (table === miraShootMemoryRevisions && failure) {
        const kind = failure; failure = null;
        throw Object.assign(new Error("injected write failure"), { code: kind === "duplicate" ? "ER_DUP_ENTRY" : "DB_ERROR" });
      }
      rows(table).push(table === miraEmailOutbox ? { id: data.jobs.length + 1, status: "pending", sentAt: null, ...row } : row);
    } }),
    update: (table: unknown) => ({ set: (patch: any) => ({ where: async (condition: any) => {
      let affectedRows = 0;
      for (const row of rows(table)) if (match(row, condition)) { Object.assign(row, patch); affectedRows++; }
      return [{ affectedRows }];
    } }) }),
  };
  return db;
}
const pendingCustom = (db: any) => db.data.jobs.filter((job: any) => CLIENT_REMINDER_MILESTONES.includes(job.milestoneId) && job.status === "pending");

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
  vi.clearAllMocks(); mocks.available.mockReturnValue(true);
});

describe("client scheduling preferences", () => {
  it("returns empty choices honestly before anything is saved", async () => {
    mocks.getDb.mockResolvedValue(fakeDb());
    const result = await getClientPreparationPreferences(scope);
    expect(result.preferences).toEqual(EMPTY_CLIENT_PREFERENCES);
    expect(result.reminderStatus).toBeNull();
    expect(result.contactEmail).toBe("client@example.test");
    expect(result.reminderOptions[0].at).toBe("2026-10-02T08:00:00.000Z");
  });

  it("preserves the complete JSON snapshot and choices across ordinary and voice updates", async () => {
    const memory = emptyShootMemory();
    memory.identity.business = { value: "Existing brand", kind: "explicit", confidence: "high", sourceEventIds: ["event"], clientConfirmed: true, updatedAt: new Date().toISOString() };
    memory.shootContext.scheduleConfirmation = { ...memory.identity.business, value: ["confirmed"] };
    const db = fakeDb(JSON.stringify({ ...memory, additionalEvidence: { retained: true } })); mocks.getDb.mockResolvedValue(db);
    await saveClientPreparationPreferences(scope, { calendarChoice: "opened" });
    const saved = await saveClientPreparationPreferences(scope, { emailReminders: false });
    const latest = db.data.revisions.at(-1);
    expect(latest.version).toBe(5);
    expect(latest.snapshotJson).toMatchObject({ identity: memory.identity, shootContext: memory.shootContext, additionalEvidence: { retained: true } });
    expect(saved.preferences).toMatchObject({ calendarChoice: "opened", emailReminders: false });
    const voiceMemory = { ...latest.snapshotJson }; delete voiceMemory.additionalEvidence;
    expect(applyShootMemoryPatch(voiceMemory, { changes: [{ operation: "set", path: "identity.business", value: memory.identity.business }] }).clientPreferences).toEqual(saved.preferences);
    expect(db.data.invitations[0]).not.toHaveProperty("consentAcknowledgedAt");
  });

  it("edits only the authorized shoot email without opting into notifications", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db);
    const saved = await saveClientPreparationPreferences(scope, { contactEmail: "  new@example.test  " });
    expect(saved.contactEmail).toBe("new@example.test");
    expect(saved.preferences.emailReminders).toBeNull();
    expect(db.data.shoots[0].clientEmail).toBe("new@example.test");
    expect(db.data.jobs).toHaveLength(0);
    await expect(saveClientPreparationPreferences(scope, { contactEmail: "bad" })).rejects.toThrow();
    await expect(saveClientPreparationPreferences({ ...scope, photographerUserId: 11 }, { contactEmail: "wrong@example.test" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.data.shoots[0].clientEmail).toBe("new@example.test");
  });

  it("keeps one persisted pending reminder across opt-in, repeats, and explicit rescheduling", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db);
    const optedIn = await saveClientPreparationPreferences(scope, { emailReminders: true });
    expect(optedIn.reminderKind).toBe("shoot");
    expect(optedIn.preferences.reminderAt).toBe("2026-10-14T08:00:00.000Z");
    await saveClientPreparationPreferences(scope, { emailReminders: true });
    expect(db.data.jobs).toHaveLength(1);
    const later = await saveClientPreparationPreferences(scope, { prepareChoice: "later", reminderChoice: "tomorrow" });
    expect(later.reminderKind).toBe("preparation");
    expect(pendingCustom(db)).toHaveLength(1);
    const id = pendingCustom(db)[0].id;
    const sooner = await saveClientPreparationPreferences(scope, { prepareChoice: "later", reminderChoice: "one_hour" });
    expect(pendingCustom(db)[0].id).toBe(id);
    expect(sooner.preferences.reminderAt).toBe("2026-10-01T09:00:00.000Z");
    expect(pendingCustom(db)).toHaveLength(1);
    expect(db.data.revisions.at(-1).snapshotJson.clientPreferences.reminderAt).toBe(sooner.preferences.reminderAt);
  });

  it("lets clients return themselves without requesting preparation email", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db);
    await saveClientPreparationPreferences(scope, { prepareChoice: "later" });
    expect(db.data.jobs).toHaveLength(0);
    await saveClientPreparationPreferences(scope, { emailReminders: true, prepareChoice: "later", reminderChoice: "tomorrow" });
    const returned = await saveClientPreparationPreferences(scope, { prepareChoice: "later" });
    expect(returned.reminderKind).toBe("shoot");
    expect(pendingCustom(db)).toHaveLength(1);
    expect(pendingCustom(db)[0].milestoneId).toBe("client_shoot_reminder");
  });

  it("saves calendar and opt-out without infrastructure but rejects false scheduling promises", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db); mocks.available.mockReturnValue(false);
    expect((await saveClientPreparationPreferences(scope, { calendarChoice: "skip" })).deliveryAvailable).toBe(false);
    await saveClientPreparationPreferences(scope, { emailReminders: false });
    const version = db.data.revisions.length;
    await expect(saveClientPreparationPreferences(scope, { emailReminders: true, prepareChoice: "later", reminderChoice: "tomorrow" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.data.revisions).toHaveLength(version);
    expect(db.data.jobs).toHaveLength(0);
  });

  it("rolls back contact, memory and outbox together if any write fails", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db); db.failNext("revision");
    await expect(saveClientPreparationPreferences(scope, { contactEmail: "new@example.test", emailReminders: true })).rejects.toThrow("injected write failure");
    expect(db.data.jobs).toHaveLength(0);
    expect(db.data.revisions).toHaveLength(1);
    expect(db.data.shoots[0].clientEmail).toBe("client@example.test");
  });

  it("retries from the newest concurrent revision without losing its evidence", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db); db.failNext("duplicate");
    const saved = await saveClientPreparationPreferences(scope, { emailReminders: true });
    expect(saved.reminderStatus).toBe("pending");
    expect(pendingCustom(db)).toHaveLength(1);
    expect(db.data.revisions.at(-1)).toMatchObject({ version: 5, snapshotJson: { concurrentEvidence: "retained" } });
  });

  it("preserves sent evidence and offers no second reminder", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db);
    await saveClientPreparationPreferences(scope, { emailReminders: true });
    Object.assign(db.data.jobs[0], { status: "delivered", sentAt: new Date() });
    const saved = await saveClientPreparationPreferences(scope, { prepareChoice: "now" });
    expect(saved.reminderStatus).toBe("delivered");
    expect(saved.reminderOptions).toEqual([]);
    await expect(saveClientPreparationPreferences(scope, { prepareChoice: "later", reminderChoice: "tomorrow" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.data.jobs).toHaveLength(1);
    expect(db.data.jobs[0].status).toBe("delivered");
  });

  it("explicit opt-in replaces legacy schedules and preserves invitation/ready ledgers", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db);
    db.data.jobs.push(
      { id: 1, invitationId: scope.invitationId, milestoneId: "call_mira_reminder", status: "pending" },
      { id: 2, invitationId: scope.invitationId, milestoneId: "shoot_day_reminder", status: "pending" },
      { id: 3, invitationId: scope.invitationId, milestoneId: "ready_to_shoot", status: "sent", sentAt: new Date() },
      { id: 4, invitationId: scope.invitationId, milestoneId: "shoot_room_invitation", status: "sent", sentAt: new Date() },
    );
    await saveClientPreparationPreferences(scope, { emailReminders: true });
    expect(db.data.jobs.slice(0, 4).map((job: any) => job.status)).toEqual(["cancelled", "cancelled", "sent", "sent"]);
    expect(pendingCustom(db)).toHaveLength(1);
  });

  it("opt-out cancels reminders, including legacy jobs, and preserves invitations", async () => {
    const db = fakeDb(); mocks.getDb.mockResolvedValue(db);
    await saveClientPreparationPreferences(scope, { emailReminders: true });
    db.data.jobs.push({ id: 2, invitationId: scope.invitationId, milestoneId: "call_mira_reminder", status: "pending" }, { id: 3, invitationId: scope.invitationId, milestoneId: "shoot_room_invitation", status: "pending" });
    const saved = await saveClientPreparationPreferences(scope, { emailReminders: false });
    expect(saved.preferences.reminderAt).toBeNull();
    expect(db.data.jobs.map((job: any) => job.status)).toEqual(["cancelled", "cancelled", "pending"]);
    await expect(saveClientPreparationPreferences(scope, { prepareChoice: "later", reminderChoice: "tomorrow" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
