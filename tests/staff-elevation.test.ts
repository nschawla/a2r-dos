import { describe, it, expect, vi, afterAll } from 'vitest';

// React Server cache() shim (transitively loaded via @/lib/ops-auth → @/lib/auth).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

const { mockGetServerSession, cookieJar } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  cookieJar: { store: new Map<string, string>() },
}));
vi.mock('next-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-auth')>();
  return { ...actual, getServerSession: mockGetServerSession };
});
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      cookieJar.store.has(name) ? { name, value: cookieJar.store.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.store.set(name, value),
    delete: (name: string) => cookieJar.store.delete(name),
  }),
  headers: () => new Headers(),
}));

import { db } from '@/lib/db';
import {
  requestElevation,
  resolveActiveElevation,
  endElevation,
  hasActiveElevation,
  clampTtlMinutes,
  maxTtlMinutes,
  ELEVATION_COOKIE,
} from '@/lib/ops/staff-elevation';
import { grantStaffAccess } from '@/lib/ops/staff-grants';
import { requireElevatedOps } from '@/lib/ops-auth';
import { hashToken } from '@/lib/crypto/bearer-token';

/**
 * P1 — Just-In-Time staff elevation. Live DB, self-cleaning.
 */
describe('JIT staff elevation — service', () => {
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function makeUser(local: string): Promise<{ id: string; email: string }> {
    const email = `${local}-${stamp}@a2rventures.com`;
    const u = await db.user.create({ data: { email, name: local } });
    createdUserIds.push(u.id);
    return { id: u.id, email };
  }
  async function makeOperator(local: string) {
    const u = await makeUser(local);
    await grantStaffAccess({ email: u.email, grantedByUserId: u.id, reason: 'elevation test operator' });
    return u;
  }

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    const ids = createdUserIds.splice(0);
    if (ids.length) {
      await db.staffElevation.deleteMany({ where: { userId: { in: ids } } });
      await db.staffGrant.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('clampTtlMinutes stays inside [5, max]', () => {
    expect(clampTtlMinutes(1)).toBe(5);
    expect(clampTtlMinutes(30)).toBe(30);
    expect(clampTtlMinutes(9999)).toBe(maxTtlMinutes());
    expect(clampTtlMinutes(undefined)).toBe(30);
  });

  it('refuses an operator with no standing StaffGrant', async () => {
    const u = await makeUser('nogrant');
    const res = await requestElevation({ userId: u.id, reason: 'a valid reason here' });
    expect(res.ok).toBe(false);
  });

  it('refuses a thin reason', async () => {
    const op = await makeOperator('thin');
    const res = await requestElevation({ userId: op.id, reason: 'short' });
    expect(res.ok).toBe(false);
  });

  it('happy path — creates a live row, hasActiveElevation flips true', async () => {
    const op = await makeOperator('happy');
    const res = await requestElevation({ userId: op.id, reason: 'provisioning tenant #4821', ttlMinutes: 15 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ttlMinutes).toBe(15);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(res.expiresAt.getTime()).toBeLessThan(Date.now() + 16 * 60_000);
    expect(await hasActiveElevation(op.id)).toBe(true);

    const resolved = await resolveActiveElevation(res.token);
    expect(resolved?.userId).toBe(op.id);

    // P0-5 — the DB row stores only the hash, never the cookie's plaintext.
    const row = await db.staffElevation.findFirst({ where: { userId: op.id, endedAt: null } });
    expect(row?.tokenHash).toBe(hashToken(res.token));
    expect(row?.tokenHash).not.toBe(res.token);
    expect(await resolveActiveElevation(`${res.token}-tampered`)).toBeNull();
  });

  it('a second request supersedes the first (one live elevation per operator)', async () => {
    const op = await makeOperator('supersede');
    const a = await requestElevation({ userId: op.id, reason: 'first elevation request' });
    const b = await requestElevation({ userId: op.id, reason: 'second elevation request' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(await resolveActiveElevation(a.token)).toBeNull(); // superseded
    expect(await resolveActiveElevation(b.token)).not.toBeNull();

    const rows = await db.staffElevation.findMany({ where: { userId: op.id } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.endedAt === null)).toHaveLength(1);
    expect(rows.find((r) => r.tokenHash === hashToken(a.token))?.endedReason).toBe('superseded');
  });

  it('resolveActiveElevation returns null for an expired or ended row', async () => {
    const op = await makeOperator('expiry');
    const pastToken = `past-${stamp}`;
    await db.staffElevation.create({
      data: {
        userId: op.id,
        tokenHash: hashToken(pastToken),
        reason: 'already expired window',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    expect(await resolveActiveElevation(pastToken)).toBeNull();
    expect(await hasActiveElevation(op.id)).toBe(false);

    const ended = await requestElevation({ userId: op.id, reason: 'will be dropped early' });
    if (!ended.ok) throw new Error('setup');
    await endElevation(ended.token, 'operator');
    expect(await resolveActiveElevation(ended.token)).toBeNull();
  });

  it('endElevation is idempotent and tolerates an unknown token', async () => {
    await expect(endElevation('does-not-exist')).resolves.toBeUndefined();
    await expect(endElevation(undefined)).resolves.toBeUndefined();
  });
});

describe('JIT staff elevation — requireElevatedOps gate', () => {
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  afterAll(async () => {
    vi.restoreAllMocks();
    cookieJar.store.clear();
    const ids = createdUserIds.splice(0);
    if (ids.length) {
      await db.staffElevation.deleteMany({ where: { userId: { in: ids } } });
      await db.staffGrant.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  async function operator(local: string) {
    const email = `gate-${local}-${stamp}@a2rventures.com`;
    const u = await db.user.create({ data: { email, name: local } });
    createdUserIds.push(u.id);
    await grantStaffAccess({ email, grantedByUserId: u.id, reason: 'gate test' });
    return u;
  }
  function signIn(u: { id: string; email: string }) {
    mockGetServerSession.mockResolvedValue({
      user: { id: u.id, email: u.email, name: 'Op', isA2rStaff: true, mustChangePassword: false },
    });
  }

  it('a signed-out session → NOT_AUTHORIZED', async () => {
    mockGetServerSession.mockResolvedValue(null);
    cookieJar.store.clear();
    expect(await requireElevatedOps()).toEqual({ ok: false, reason: 'NOT_AUTHORIZED' });
  });

  it('staff, no elevation cookie → ELEVATION_REQUIRED', async () => {
    const u = await operator('bare');
    signIn(u);
    cookieJar.store.clear();
    expect(await requireElevatedOps()).toEqual({ ok: false, reason: 'ELEVATION_REQUIRED' });
  });

  it('staff + live elevation cookie → ok', async () => {
    const u = await operator('elevated');
    signIn(u);
    const res = await requestElevation({ userId: u.id, reason: 'gate happy path elevation' });
    if (!res.ok) throw new Error('setup');
    cookieJar.store.set(ELEVATION_COOKIE, res.token);
    const gate = await requireElevatedOps();
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.ops.elevation?.active).toBe(true);
  });

  it("a cookie whose row belongs to another user → ELEVATION_REQUIRED", async () => {
    const owner = await operator('owner');
    const other = await operator('other');
    const res = await requestElevation({ userId: owner.id, reason: 'owned by someone else' });
    if (!res.ok) throw new Error('setup');
    signIn(other); // different session presenting owner's cookie
    cookieJar.store.set(ELEVATION_COOKIE, res.token);
    expect(await requireElevatedOps()).toEqual({ ok: false, reason: 'ELEVATION_REQUIRED' });
  });
});
