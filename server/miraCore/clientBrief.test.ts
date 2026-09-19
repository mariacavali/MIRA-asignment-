import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), readBrandPage: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./brandWebsite", () => ({ readBrandPage: mocks.readBrandPage }));
vi.mock("drizzle-orm", async original => ({ ...(await original<typeof import("drizzle-orm")>()), eq: (column: { name: string }, value: unknown) => ({ field: column.name, value }), and: (...conditions: unknown[]) => conditions, desc: () => "desc" }));
import { miraShoots } from "../../drizzle/schema";
import { saveClientBrief } from "./clientBrief";
import { emptyShootMemory, applyShootMemoryPatch } from "./memory";
import type { ClientBriefInput } from "../../shared/miraClientBrief";

const input: ClientBriefInput = { brandFeel: ["Warm & approachable"], posingSupport: "I prefer seated or still poses", comfortNote: "No floor poses", brandUrls: [] };

function fakeDb(shootId: number, snapshotJson: unknown, roomState = "welcome") {
  const revisions: any[] = [{ shootId, version: 3, snapshotJson }];
  const shoot = { id: shootId, photographerUserId: 9, roomState };
  function match(row: any, condition: any): boolean { return Array.isArray(condition) ? condition.every(item => match(row, item)) : row[condition.field] === condition.value; }
  const db: any = {
    revisions,
    transaction: (fn: (tx: any) => unknown) => fn(db),
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      const result = (table === miraShoots ? [shoot] : revisions).filter(row => match(row, condition)).sort((a, b) => b.version - a.version).slice(0, 1);
      const limit = () => Object.assign(Promise.resolve(result), { for: () => Promise.resolve(result) });
      return { limit, orderBy: () => ({ limit }) };
    } }) }),
    insert: () => ({ values: (row: any) => { revisions.push(row); return Promise.resolve(); } }),
  };
  return db;
}

describe("client preparation persistence", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("adds a revision to an existing JSON snapshot without changing conversation or schedule answers", async () => {
    const memory = emptyShootMemory();
    memory.identity.business = { value: "Existing brand", kind: "explicit", confidence: "high", sourceEventIds: ["existing-event"], clientConfirmed: true, updatedAt: new Date().toISOString() };
    memory.shootContext.scheduleConfirmation = { ...memory.identity.business, value: ["confirmed"] };
    const db = fakeDb(901, JSON.stringify(memory)); mocks.getDb.mockResolvedValue(db);
    const saved = await saveClientBrief(901, 9, input);
    const revision = db.revisions[1];
    expect(revision.version).toBe(4);
    expect(revision.snapshotJson.identity).toEqual(memory.identity);
    expect(revision.snapshotJson.shootContext).toEqual(memory.shootContext);
    expect(revision.snapshotJson.clientBrief).toEqual(saved);
    const afterVoice = applyShootMemoryPatch(revision.snapshotJson, { changes: [{ operation: "set", path: "identity.business", value: memory.identity.business }] });
    expect(afterVoice.clientBrief).toEqual(saved);
    expect(mocks.readBrandPage).not.toHaveBeenCalled();
  });
  it("retains successful website text when only the client choices change", async () => {
    const page = { url: "https://brand.com/", status: "read" as const, title: "Brand", excerpt: "Saved website evidence", checkedAt: new Date().toISOString() };
    const memory = { ...emptyShootMemory(), clientBrief: { ...input, brandUrls: undefined, brandPages: [page], savedAt: new Date().toISOString() } };
    delete memory.clientBrief.brandUrls;
    mocks.getDb.mockResolvedValue(fakeDb(902, memory));
    const saved = await saveClientBrief(902, 9, { ...input, brandUrls: [page.url, page.url] });
    expect(saved.brandPages).toEqual([page]);
    expect(mocks.readBrandPage).not.toHaveBeenCalled();
  });
  it("does not overwrite another owner's shoot or a confirmed direction", async () => {
    const db = fakeDb(903, emptyShootMemory()); mocks.getDb.mockResolvedValue(db);
    await expect(saveClientBrief(903, 11, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.revisions).toHaveLength(1);
    mocks.getDb.mockResolvedValue(fakeDb(904, emptyShootMemory(), "preparation_active"));
    await expect(saveClientBrief(904, 9, input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("saves unreadable links honestly with no invented excerpt", async () => {
    mocks.getDb.mockResolvedValue(fakeDb(905, emptyShootMemory()));
    mocks.readBrandPage.mockResolvedValue({ url: "https://brand.com/", status: "unavailable", title: "", excerpt: "", checkedAt: new Date().toISOString() });
    const saved = await saveClientBrief(905, 9, { ...input, brandUrls: ["https://brand.com/"] });
    expect(saved.brandPages[0]).toMatchObject({ status: "unavailable", excerpt: "" });
  });
});
