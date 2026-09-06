import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P2 — advanced rate limiting on the resource-intensive boundaries, at the
 * handler / action level (headers on the allowed path, 429 at limit + 1).
 * Pure — the DB layer + session are stubbed; this proves the limiter wiring,
 * not the business logic (which its own suites cover).
 */

// RSC cache() shim (transitively via @/lib/auth) + session / headers stubs.
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
  cookies: () => ({ get: () => undefined }),
  headers: () => new Headers(),
}));

// portfolio-csv route deps — stub the auth + data layers so only the limiter runs.
vi.mock('@/lib/auth/password-rotation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/password-rotation')>();
  return { ...actual, passwordRotationGate: vi.fn().mockResolvedValue(null) };
});
vi.mock('@/lib/session', () => ({
  getOrgContextOrNull: vi.fn().mockResolvedValue({
    userId: 'rl-user',
    organizationId: 'rl-org',
    organizationName: 'RL Org',
    session: { user: { id: 'rl-user', email: 'rl@x.test', name: 'RL' } },
  }),
}));
vi.mock('@/lib/db/scoped-portfolio', () => ({ getScopedProjectsForUser: vi.fn().mockResolvedValue([]) }));
vi.mock('@/server/queries/reports-exports', () => ({ loadPortfolioCsvRoles: vi.fn().mockResolvedValue([]) }));

import { __resetRateLimiter } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';
import { GET as portfolioCsvGET } from '@/app/api/reports/portfolio-csv/route';
import { withRouteHandler } from '@/lib/observability/route-wrapper';

beforeEach(() => {
  __resetRateLimiter();
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { id: 'rl-user', email: 'rl@x.test' } });
});

const req = () => new Request('http://localhost/api/reports/portfolio-csv');

describe('GET /api/reports/portfolio-csv — BULK_EXPORT rate limit', () => {
  it('serves up to the limit with a decreasing X-RateLimit-Remaining, then 429', async () => {
    const limit = RATE_LIMITS.BULK_EXPORT.limit;
    const remainings: number[] = [];

    for (let i = 0; i < limit; i++) {
      const res = await portfolioCsvGET(req(), undefined);
      expect(res.status, `hit ${i + 1}`).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe(String(limit));
      remainings.push(Number(res.headers.get('X-RateLimit-Remaining')));
    }
    // strictly decreasing, ending at 0
    expect(remainings[0]).toBe(limit - 1);
    expect(remainings[remainings.length - 1]).toBe(0);
    expect(remainings.every((v, i) => i === 0 || v < remainings[i - 1]!)).toBe(true);

    const blocked = await portfolioCsvGET(req(), undefined);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(await blocked.json()).toMatchObject({ retryAfterSeconds: expect.any(Number) });
  });

  it('the limit is per user — a different session is unaffected', async () => {
    for (let i = 0; i < RATE_LIMITS.BULK_EXPORT.limit; i++) await portfolioCsvGET(req(), undefined);
    expect((await portfolioCsvGET(req(), undefined)).status).toBe(429);

    const { getOrgContextOrNull } = await import('@/lib/session');
    (getOrgContextOrNull as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: 'other-user',
      organizationId: 'rl-org',
      organizationName: 'RL Org',
      session: { user: { id: 'other-user' } },
    });
    expect((await portfolioCsvGET(req(), undefined)).status).toBe(200);
  });
});

describe('changePasswordAction — PASSWORD_CHANGE rate limit', () => {
  it('returns a RATE_LIMITED result on attempt limit + 1 (weak password = cheap domain failure otherwise)', async () => {
    const { changePasswordAction } = await import('@/server/actions/auth');
    mockGetServerSession.mockResolvedValue({ user: { id: 'pw-rl-user' } });
    const limit = RATE_LIMITS.PASSWORD_CHANGE.limit;

    const input = { currentPassword: 'whatever', newPassword: 'short' }; // fails strength → no DB touch

    for (let i = 0; i < limit; i++) {
      const res = await changePasswordAction(input);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).not.toContain('RATE_LIMITED');
    }
    const blocked = await changePasswordAction(input);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain('RATE_LIMITED');
  });
});

describe('withRouteHandler ↔ observability', () => {
  it('a throwing handler → 500 { error: "Internal server error." }', async () => {
    const route = withRouteHandler('probe', async () => {
      throw new Error('simulated pool timeout');
    });
    const res = await route(req(), undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error.' });
  });
});
