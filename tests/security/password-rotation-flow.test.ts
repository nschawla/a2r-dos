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

// The jwt callback (default export path) — invoked directly with a fake token.
const jwt = authOptions.callbacks!.jwt!;
const sessionCb = authOptions.callbacks!.session!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callJwt = (token: Record<string, unknown>) => jwt({ token, user: undefined, account: null } as any);

/**
 * P1 — restricted-session state machine, live-DB integration.
 *
 * Covers changePasswordAction's atomic transaction (hash + sessionVersion
 * bump + adapter-session delete), the fresh-session mint, and the jwt
 * callback's DB-backed state derivation including the FAIL-CLOSED path.
 * The pure state machine is exhaustively covered in tests/session-state.test.ts.
 * Self-cleaning.
 */
describe('changePasswordAction + jwt callback — the session state machine', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it('rejects a wrong current password / weak new password / re-use — no state change', async () => {
    const u = await makeUser();
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, mustChangePassword: true } });

    expect(await changePasswordAction({ currentPassword: 'wrong', newPassword: NEW_PW })).toMatchObject({ ok: false });
    expect(await changePasswordAction({ currentPassword: OLD_PW, newPassword: 'weak' })).toMatchObject({ ok: false });
    expect(await changePasswordAction({ currentPassword: OLD_PW, newPassword: OLD_PW })).toMatchObject({ ok: false });

    const still = await db.user.findUnique({
      where: { id: u.id },
      select: { mustChangePassword: true, passwordChangedAt: true, sessionVersion: true },
    });
    expect(still).toMatchObject({ mustChangePassword: true, passwordChangedAt: null, sessionVersion: 0 });
  });

  it('a successful change atomically bumps sessionVersion, clears the flag, and mints a fresh ACTIVE token', async () => {
    const u = await makeUser();
    cookieJar.store.clear();
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, mustChangePassword: true } });

    const before = Date.now();
    const res = await changePasswordAction({ currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(res).toEqual({ ok: true, sessionRefreshed: true });

    const after = await db.user.findUnique({
      where: { id: u.id },
      select: { mustChangePassword: true, passwordChangedAt: true, passwordHash: true, sessionVersion: true },
    });
    expect(after?.mustChangePassword).toBe(false);
    expect(after?.sessionVersion).toBe(1);
    expect(after?.passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await bcrypt.compare(NEW_PW, after!.passwordHash!)).toBe(true);

    const cookieName = [...cookieJar.store.keys()].find((k) => k.endsWith('next-auth.session-token'));
    const decoded = await decode({ token: cookieJar.store.get(cookieName!)!, secret: process.env.NEXTAUTH_SECRET! });
    expect(decoded).toMatchObject({ userId: u.id, state: 'ACTIVE', sessionVersion: 1 });
  });

  it('the jwt callback REVOKES every token minted before the change, and keeps the fresh one', async () => {
    const u = await makeUser();
    mockGetServerSession.mockResolvedValue({ user: { id: u.id, mustChangePassword: true } });
    await changePasswordAction({ currentPassword: OLD_PW, newPassword: NEW_PW });
    // account is now sessionVersion 1.

    // an old token (version 0 — or a legacy token with no claim) on any device
    for (const stale of [{ userId: u.id, sessionVersion: 0, iat: 1 }, { userId: u.id, iat: 1 }]) {
      expect(await callJwt(stale)).toEqual({ revoked: true, state: 'REVOKED' });
    }

    // the fresh token (version 1) stays ACTIVE
    const fresh = await callJwt({ userId: u.id, sessionVersion: 1, iat: Math.floor(Date.now() / 1000), state: 'ACTIVE' });
    expect((fresh as { revoked?: boolean }).revoked).toBeUndefined();
    expect(fresh).toMatchObject({ state: 'ACTIVE', mustChangePassword: false, sessionVersion: 1 });
  });

  it('a PENDING_PASSWORD_CHANGE token is derived for a mustChangePassword account', async () => {
    const u = await makeUser(true); // sessionVersion 0, mustChangePassword true
    const t = await callJwt({ userId: u.id, sessionVersion: 0, iat: Math.floor(Date.now() / 1000) });
    expect(t).toMatchObject({ state: 'PENDING_PASSWORD_CHANGE', mustChangePassword: true });
  });

  it('FAIL-CLOSED — a DB error during the state lookup revokes the session', async () => {
    const u = await makeUser(false);
    const spy = vi.spyOn(db.user, 'findUnique').mockRejectedValueOnce(new Error('connection reset'));
    try {
      const t = await callJwt({ userId: u.id, sessionVersion: 0, iat: Math.floor(Date.now() / 1000), state: 'ACTIVE' });
      expect(t).toEqual({ revoked: true, state: 'REVOKED' });
    } finally {
      spy.mockRestore();
    }
  });

  it('FAIL-CLOSED — a hung DB (timeout) revokes the session', async () => {
    const u = await makeUser(false);
    vi.stubEnv('SESSION_LOOKUP_TIMEOUT_MS', '40');
    const spy = vi.spyOn(db.user, 'findUnique').mockReturnValueOnce(new Promise(() => {}) as never);
    try {
      const t = await callJwt({ userId: u.id, sessionVersion: 0, iat: Math.floor(Date.now() / 1000), state: 'ACTIVE' });
      expect(t).toEqual({ revoked: true, state: 'REVOKED' });
    } finally {
      spy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('FAIL-CLOSED — a deleted account revokes the session', async () => {
    const u = await db.user.create({
      data: { email: `pwrot-del-${Date.now()}@a2rventures.com`, passwordHash: await bcrypt.hash(OLD_PW, 10) },
    });
    await db.user.delete({ where: { id: u.id } });
    const t = await callJwt({ userId: u.id, sessionVersion: 0, iat: Math.floor(Date.now() / 1000), state: 'ACTIVE' });
    expect(t).toEqual({ revoked: true, state: 'REVOKED' });
  });

  it('the session callback yields a user-less session for a REVOKED token (either signal)', async () => {
    for (const token of [{ revoked: true }, { state: 'REVOKED', userId: 'x' }, {}]) {
      const out = await sessionCb({
        session: { user: { name: 'x', email: 'x@x.x' }, expires: '2999-01-01' },
        token,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect((out as { user?: unknown }).user).toBeUndefined();
    }
  });
});
