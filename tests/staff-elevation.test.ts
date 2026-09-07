import { describe, it, expect, vi, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

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
 * P1 / WP2 — Just-In-Time staff elevation. Live DB, self-cleaning.
 *
 * WP2: obtaining an elevation requires a fresh password verification, and
 * the row is bound to the session's `sessionVersion` epoch.
 */
const PASSWORD = 'elevate-me-please-12345';

describe('JIT staff elevation — service', () => {
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function makeUser(local: string, opts: { withPassword?: boolean } = {}): Promise<{ id: string; email: string }> {
    const email = `${local}-${stamp}@a2rventures.com`;
    const u = await db.user.create({
      data: {
        email,
        name: local,
        passwordHash: opts.withPassword === false ? null : await bcrypt.hash(PASSWORD, 10),
      },
    });
    createdUserIds.push(u.id);
    return { id: u.id, email };
  }
  async function makeOperator(local: string, opts: { withPassword?: boolean } = {}) {
    const u = await makeUser(local, opts);
    await grantStaffAccess({ email: u.email, grantedByUserId: u.id, reason: 'elevation test operator' });
    return u;
  }
  /** requestElevation with the WP2 step-up args filled in. */
  function elevate(userId: string, reason: string, over: Partial<Parameters<typeof requestElevation>[0]> = {}) {
    return requestElevation({ userId, reason, password: PASSWORD, sessionVersion: 0, ...over });
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
    const res = await elevate(u.id, 'a valid reason here');
    expect(res.ok).toBe(false);
  });

  it('refuses a thin reason', async () => {
    const op = await makeOperator('thin');
    const res = await elevate(op.id, 'short');
    expect(res.ok).toBe(false);
  });

  it('WP2 — refuses a wrong password (step-up)', async () => {
    const op = await makeOperator('badpw');
    const res = await elevate(op.id, 'valid reason, wrong password', { password: 'not-my-password' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_PASSWORD');
    expect(await hasActiveElevation(op.id)).toBe(false);
  });

  it('WP2 — an SSO-only operator (no passwordHash) is told to set one', async () => {
    const op = await makeOperator('ssoonly', { withPassword: false });
    const res = await elevate(op.id, 'valid reason, no password set', { password: 'anything' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NO_PASSWORD');
  });

  it('happy path — creates a live row bound to the session epoch', async () => {
    const op = await makeOperator('happy');
    const res = await elevate(op.id, 'provisioning tenant #4821', { ttlMinutes: 15, sessionVersion: 7 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ttlMinutes).toBe(15);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(res.expiresAt.getTime()).toBeLessThan(Date.now() + 16 * 60_000);
    expect(await hasActiveElevation(op.id)).toBe(true);

    const resolved = await resolveActiveElevation(res.token, 7);
    expect(resolved?.userId).toBe(op.id);
    expect(resolved?.sessionVersion).toBe(7);
    expect(resolved?.reauthAt).not.toBeNull();

    // P0-5 — the DB row stores only the hash, never the cookie's plaintext.
    const row = await db.staffElevation.findFirst({ where: { userId: op.id, endedAt: null } });
    expect(row?.tokenHash).toBe(hashToken(res.token));
    expect(row?.tokenHash).not.toBe(res.token);
    expect(await resolveActiveElevation(`${res.token}-tampered`, 7)).toBeNull();
  });

  it('WP2 — an elevation minted under a superseded sessionVersion resolves to null', async () => {
    const op = await makeOperator('rotated');
    const res = await elevate(op.id, 'will be invalidated by a version bump', { sessionVersion: 3 });
    if (!res.ok) throw new Error('setup');
    expect(await resolveActiveElevation(res.token, 3)).not.toBeNull();
    // a password change / sign-out-everywhere bumps users.sessionVersion → 4
    expect(await resolveActiveElevation(res.token, 4)).toBeNull();
  });

  it('a second request supersedes the first (one live elevation per operator)', async () => {
    const op = await makeOperator('supersede');
    const a = await elevate(op.id, 'first elevation request');
    const b = await elevate(op.id, 'second elevation request');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(await resolveActiveElevation(a.token, 0)).toBeNull(); // superseded
    expect(await resolveActiveElevation(b.token, 0)).not.toBeNull();

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
    expect(await resolveActiveElevation(pastToken, 0)).toBeNull();
    expect(await hasActiveElevation(op.id)).toBe(false);

    const ended = await elevate(op.id, 'will be dropped early');
    if (!ended.ok) throw new Error('setup');
    await endElevation(ended.token, 'operator');
    expect(await resolveActiveElevation(ended.token, 0)).toBeNull();
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
    const u = await db.user.create({
      data: { email, name: local, passwordHash: await bcrypt.hash(PASSWORD, 10) },
    });
    createdUserIds.push(u.id);
    await grantStaffAccess({ email, grantedByUserId: u.id, reason: 'gate test' });
    return u;
  }
  function signIn(u: { id: string; email: string }, sessionVersion = 0) {
    mockGetServerSession.mockResolvedValue({
      user: { id: u.id, email: u.email, name: 'Op', isA2rStaff: true, mustChangePassword: false },
      sessionVersion,
    });
  }
  const elevate = (userId: string, reason: string, sessionVersion = 0) =>
    requestElevation({ userId, reason, password: PASSWORD, sessionVersion });

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

  it('staff + live elevation cookie (matching epoch) → ok', async () => {
    const u = await operator('elevated');
    signIn(u, 2);
    const res = await elevate(u.id, 'gate happy path elevation', 2);
    if (!res.ok) throw new Error('setup');
    cookieJar.store.set(ELEVATION_COOKIE, res.token);
    const gate = await requireElevatedOps();
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.ops.elevation?.active).toBe(true);
  });

  it('WP2 — a session-version bump kills the elevation → ELEVATION_REQUIRED', async () => {
    const u = await operator('bumped');
    const res = await elevate(u.id, 'valid at epoch 5', 5);
    if (!res.ok) throw new Error('setup');
    cookieJar.store.set(ELEVATION_COOKIE, res.token);
    signIn(u, 6); // password change / sign-out-everywhere advanced the epoch
    expect(await requireElevatedOps()).toEqual({ ok: false, reason: 'ELEVATION_REQUIRED' });
  });

  it("a cookie whose row belongs to another user → ELEVATION_REQUIRED", async () => {
    const owner = await operator('owner');
    const other = await operator('other');
    const res = await elevate(owner.id, 'owned by someone else', 0);
    if (!res.ok) throw new Error('setup');
    signIn(other, 0); // different session presenting owner's cookie
    cookieJar.store.set(ELEVATION_COOKIE, res.token);
    expect(await requireElevatedOps()).toEqual({ ok: false, reason: 'ELEVATION_REQUIRED' });
  });
});
