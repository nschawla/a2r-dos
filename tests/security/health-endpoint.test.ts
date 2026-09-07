import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * v1.15.1 — the public readiness probe must not leak infrastructure detail
 * (database dependency, latency, error type) to unauthenticated callers.
 * The full diagnostic is returned only with a valid HEALTH_CHECK_TOKEN.
 */

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { $queryRaw: queryRaw } }));

import { GET as liveness } from '@/app/api/health/route';
import { GET as readiness } from '@/app/api/health/ready/route';

const TOKEN = 'health-probe-token-under-test';

function req(headers: Record<string, string> = {}) {
  return new Request('https://x/api/health/ready', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  queryRaw.mockReset();
});

describe('GET /api/health (liveness)', () => {
  it('returns a constant { status: "ok" } — nothing else', async () => {
    const res = liveness();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /api/health/ready — unauthenticated', () => {
  it('DB reachable → 200 { status: "ready" } with NO database / latency detail', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await readiness(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ready' });
    expect(body).not.toHaveProperty('database');
    expect(body).not.toHaveProperty('latencyMs');
    expect(body).not.toHaveProperty('checkedAt');
  });

  it('DB failing → 503 { status: "unavailable" } — no error-type detail', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused at db.internal.host:5432'));
    const res = await readiness(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(body)).not.toMatch(/db\.internal|5432|error|timeout|refused/);
  });

  it('a wrong / absent token does not unlock detail', async () => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN);
    queryRaw.mockResolvedValue([{}]);
    const res = await readiness(req({ 'x-a2r-internal-token': 'not-the-token' }));
    expect(await res.json()).toEqual({ status: 'ready' });
  });
});

describe('GET /api/health/ready — trusted probe (HEALTH_CHECK_TOKEN)', () => {
  it('DB reachable → full { status, database, latencyMs, checkedAt }', async () => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN);
    queryRaw.mockResolvedValue([{}]);
    const res = await readiness(req({ 'x-a2r-internal-token': TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.database).toBe('ok');
    expect(typeof body.latencyMs).toBe('number');
    expect(typeof body.checkedAt).toBe('string');
  });

  it('DB failing → 503 with database: "error"', async () => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN);
    queryRaw.mockRejectedValue(new Error('boom'));
    const res = await readiness(req({ 'x-a2r-internal-token': TOKEN }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'unavailable', database: 'error' });
  });

  it('no HEALTH_CHECK_TOKEN configured → the header cannot unlock detail', async () => {
    // env unset
    queryRaw.mockResolvedValue([{}]);
    const res = await readiness(req({ 'x-a2r-internal-token': TOKEN }));
    expect(await res.json()).toEqual({ status: 'ready' });
  });
});
