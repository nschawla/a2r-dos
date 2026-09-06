import { describe, it, expect, vi, afterAll } from 'vitest';

// React Server cache() shim (transitively loaded via @/lib/auth).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

const { mockGetServerSession } = vi.hoisted(() => ({ mockGetServerSession: vi.fn() }));
vi.mock('next-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-auth')>();
  return { ...actual, getServerSession: mockGetServerSession };
});
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
  headers: () => new Headers(),
}));

import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { signOutEverywhereAction } from '@/server/actions/auth';

const jwt = authOptions.callbacks!.jwt!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callJwt = (token: Record<string, unknown>) => jwt({ token, user: undefined, account: null } as any);

/**
 * P1 (Phase D) — the explicit "Sign out of all sessions" action. Bumps
 * `users.sessionVersion`, which the jwt callback re-checks against the DB on
 * every request (fail-closed, cross-instance). Live DB, self-cleaning.
 */
describe('signOutEverywhereAction', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    vi.restoreAllMocks();
    const ids = createdUserIds.splice(0);
    if (ids.length) {
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  async function makeUser(local: string) {
    const u = await db.user.create({
      data: { email: `${local}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@a2rventures.com`, name: local },
    });
    createdUserIds.push(u.id);
    return u;
  }

  it('refuses a signed-out caller', async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect(await signOutEverywhereAction()).toMatchObject({ ok: false });
  });

  it('bumps sessionVersion and clears adapter Session rows', async () => {
    const u = await makeUser('soe');
    await db.session.create({
      data: { sessionToken: `soe-tok-${u.id}`, userId: u.id, expires: new Date(Date.now() + 86_400_000) },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, email: u.email } });

    expect(await signOutEverywhereAction()).toEqual({ ok: true });
    expect((await db.user.findUnique({ where: { id: u.id }, select: { sessionVersion: true } }))?.sessionVersion).toBe(1);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);

    expect(await signOutEverywhereAction()).toEqual({ ok: true });
    expect((await db.user.findUnique({ where: { id: u.id }, select: { sessionVersion: true } }))?.sessionVersion).toBe(2);
  });

  it('the jwt callback REVOKES a token minted before the bump and keeps a fresh one', async () => {
    const u = await makeUser('soe-jwt');
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, email: u.email } });
    await signOutEverywhereAction(); // → sessionVersion 1

    const stale = await callJwt({ userId: u.id, sessionVersion: 0, iat: Math.floor(Date.now() / 1000), state: 'ACTIVE' });
    expect(stale).toMatchObject({ state: 'REVOKED' });

    const fresh = await callJwt({ userId: u.id, sessionVersion: 1, iat: Math.floor(Date.now() / 1000), state: 'ACTIVE' });
    expect(fresh).toMatchObject({ state: 'ACTIVE' });
  });
});
