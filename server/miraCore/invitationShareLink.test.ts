import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), env: { invitationLinkSecret: 'synthetic-share-link-secret' } }));
vi.mock('../db', () => ({ getDb: mocks.getDb }));
vi.mock('../_core/env', () => ({ ENV: mocks.env }));
vi.mock('../localFileStore', () => ({ isLocalFileStoreEnabled: () => false }));
vi.mock('drizzle-orm', async original => ({ ...(await original<typeof import('drizzle-orm')>()),
  eq: (column: { name: string }, value: unknown) => ({ field: column.name, value }),
  and: (...conditions: unknown[]) => conditions,
  desc: () => undefined,
}));
import { miraShoots, miraClientInvitations } from '../../drizzle/schema';
import { getOwnedShootState } from './db';
import { parseInvitationAccessToken, verifyInvitationAccessSignature } from './invitationAccessLink';

const id = '11111111-1111-4111-8111-111111111111';
const tokenHash = 'b'.repeat(64);
function fixture(status = 'active', expired = false) {
  const shoots = [{ id: 42, photographerUserId: 7, scheduledAt: null, durationMinutes: 60 }];
  const invitations = [{ id, shootId: 42, photographerUserId: 7, tokenHash, status, expiresAt: new Date(expired ? '2026-09-01T00:00:00Z' : '2026-10-01T00:00:00Z') }];
  const queried: unknown[] = [];
  const matches = (row: any, condition: any): boolean => Array.isArray(condition) ? condition.every(item => matches(row, item)) : row[condition.field] === condition.value;
  const db = {
    insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    select: () => ({ from: (table: unknown) => { queried.push(table); return { where: (condition: unknown) => {
      const rows = (table === miraShoots ? shoots : invitations).filter(row => matches(row, condition));
      return { limit: (count: number) => Promise.resolve(rows.slice(0, count)), orderBy: () => Promise.resolve(rows) };
    } }; } }),
  };
  mocks.getDb.mockResolvedValue(db);
  return { db, queried };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-19T12:00:00Z')); mocks.env.invitationLinkSecret = 'synthetic-share-link-secret'; });
afterEach(() => vi.useRealTimers());
describe('owner can restore the existing private invitation link', () => {
  it('restores the same signed link across reads without writes or exposing the hash', async () => {
    const { db } = fixture();
    const first = await getOwnedShootState(7, 42);
    const second = await getOwnedShootState(7, 42);
    const invitation = first!.invitations[0];
    expect(invitation.preparationUrl).toBe(second!.invitations[0].preparationUrl);
    const token = invitation.preparationUrl!.split('/prepare/access/')[1];
    const parsed = parseInvitationAccessToken(token)!;
    expect(parsed.invitationId).toBe(id);
    expect(verifyInvitationAccessSignature(parsed, tokenHash, mocks.env.invitationLinkSecret)).toBe(true);
    expect(invitation).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(first)).not.toContain(tokenHash);
    expect(db.insert).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled(); expect(db.delete).not.toHaveBeenCalled();
  });
  it('does not read invitations or return a link for another photographer', async () => {
    const { queried } = fixture();
    expect(await getOwnedShootState(99, 42)).toBeNull();
    expect(queried).not.toContain(miraClientInvitations);
  });
  it.each(['revoked', 'expired'])('does not restore a %s invitation', async status => {
    fixture(status); expect((await getOwnedShootState(7, 42))!.invitations[0].preparationUrl).toBeNull();
  });
  it('does not share an active invitation after its access deadline', async () => {
    fixture('active', true); expect((await getOwnedShootState(7, 42))!.invitations[0].preparationUrl).toBeNull();
  });
  it('keeps the shoot readable if signing configuration is missing', async () => {
    fixture(); mocks.env.invitationLinkSecret = '';
    expect((await getOwnedShootState(7, 42))!.invitations[0].preparationUrl).toBeNull();
  });
});
