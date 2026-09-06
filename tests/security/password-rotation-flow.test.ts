import { describe, it, expect, vi, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

// React Server cache() shim (transitively loaded via @/lib/auth).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

// Stub the session read + the cookie jar the fresh-session mint writes to.
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
    getAll: () => [...cookieJar.store.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (cookieJar.store.has(name) ? { name, value: cookieJar.store.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.store.set(name, value),
  }),
  headers: () => new Headers(),
}));

import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { changePasswordAction } from '@/server/actions/auth';
import { decode } from 'next-auth/jwt';

const OLD_PW = 'OldTempPass123';
const NEW_PW = 'FreshChosen456';

/**
 * P0 #3 requirement 3 — a successful password change atomically clears
 * mustChangePassword, stamps passwordChangedAt (→ revokes every prior
 * token), deletes adapter sessions, and mints one fresh session.
 * Live DB, self-cleaning.
 */
describe('changePasswordAction — atomic rotation + session revocation', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const ids = createdUserIds.splice(0);
    if (ids.length) {
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  async function makeUser(mustChange = true) {
    const u = await db.user.create({
      data: {
        email: `pwrot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@a2rventures.com`,
        name: 'Rotation Test',
        passwordHash: await bcrypt.hash(OLD_PW, 10),
        mustChangePassword: mustChange,
      },
    });
    createdUserIds.push(u.id);
    return u;
  }

  it('rejects a wrong current password / weak new password / re-use', async () => {
    const u = await makeUser();
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, mustChangePassword: true } });

    expect(await changePasswordAction({ currentPassword: 'wrong', newPassword: NEW_PW })).toMatchObject({ ok: false });
    expect(await changePasswordAction({ currentPassword: OLD_PW, newPassword: 'weak' })).toMatchObject({ ok: false });
    expect(await changePasswordAction({ currentPassword: OLD_PW, newPassword: OLD_PW })).toMatchObject({ ok: false });

    const still = await db.user.findUnique({ where: { id: u.id }, select: { mustChangePassword: true, passwordChangedAt: true } });
    expect(still?.mustChangePassword).toBe(true);
    expect(still?.passwordChangedAt).toBeNull();
  });

  it('on success clears the flag, stamps passwordChangedAt, and mints a fresh session cookie', async () => {
    const u = await makeUser();
    cookieJar.store.clear();
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, mustChangePassword: true } });

    const before = Date.now();
    const res = await changePasswordAction({ currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(res).toEqual({ ok: true, sessionRefreshed: true });

    const after = await db.user.findUnique({
      where: { id: u.id },
      select: { mustChangePassword: true, passwordChangedAt: true, passwordHash: true },
    });
    expect(after?.mustChangePassword).toBe(false);
    expect(after?.passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await bcrypt.compare(NEW_PW, after!.passwordHash!)).toBe(true);

    // a fresh, decodable NextAuth session token was written
    const cookieName = [...cookieJar.store.keys()].find((k) => k.endsWith('next-auth.session-token'));
    expect(cookieName).toBeTruthy();
    const decoded = await decode({ token: cookieJar.store.get(cookieName!)!, secret: process.env.NEXTAUTH_SECRET! });
    expect(decoded?.userId).toBe(u.id);
  });

  it('the jwt callback revokes a token issued before the change, keeps one issued after', async () => {
    const u = await makeUser();
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, mustChangePassword: true } });
    await changePasswordAction({ currentPassword: OLD_PW, newPassword: NEW_PW });

    const changedAt = (await db.user.findUnique({ where: { id: u.id }, select: { passwordChangedAt: true } }))!
      .passwordChangedAt!;
    const beforeSec = Math.floor(changedAt.getTime() / 1000) - 60;
    const afterSec = Math.floor(changedAt.getTime() / 1000) + 60;

    const revoked = await authOptions.callbacks!.jwt!({
      token: { userId: u.id, iat: beforeSec } as never,
      user: undefined as never,
      account: null,
    } as never);
    expect(revoked).toEqual({ revoked: true });

    const kept = await authOptions.callbacks!.jwt!({
      token: { userId: u.id, iat: afterSec } as never,
      user: undefined as never,
      account: null,
    } as never);
    expect((kept as { revoked?: boolean }).revoked).toBeUndefined();
    expect((kept as { mustChangePassword?: boolean }).mustChangePassword).toBe(false);
  });

  it('the session callback yields a user-less session for a revoked token', async () => {
    const out = await authOptions.callbacks!.session!({
      session: { user: { name: 'x', email: 'x@x.x' }, expires: '2999-01-01' },
      token: { revoked: true },
    } as never);
    expect((out as { user?: unknown }).user).toBeUndefined();
  });
});
