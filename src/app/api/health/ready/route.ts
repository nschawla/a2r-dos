/**
 * OBS-3 (GA-readiness audit) — readiness probe.
 *
 *   GET /api/health/ready
 *     public:        200 { status: 'ready' }  |  503 { status: 'unavailable' }
 *     authenticated: + { database: 'ok'|'error'|'timeout', latencyMs, checkedAt }
 *
 * "Can this instance actually serve requests?" — runs one trivial
 * `SELECT 1` against Postgres with a 2 s ceiling. A 503 tells an
 * orchestrator to hold traffic off this instance without killing it.
 *
 * Unauthenticated callers get ONLY up/down — no database dependency,
 * latency, or error-type detail (v1.15.1: don't leak infra topology to the
 * internet). The full diagnostic body is returned only to a caller
 * presenting `x-a2r-internal-token: <HEALTH_CHECK_TOKEN>`. The failure is
 * always captured server-side regardless.
 *
 * Unauthenticated: excluded from the session matcher in src/middleware.ts.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { captureException } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DB_TIMEOUT_MS = 2000;
const NO_STORE = { 'Cache-Control': 'no-store' };

class TimeoutError extends Error {
  constructor() {
    super('database check timed out');
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** True when the caller presented the configured health-check token. */
function isTrustedProbe(request: Request): boolean {
  const expected = process.env.HEALTH_CHECK_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get('x-a2r-internal-token') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const trusted = isTrustedProbe(request);
  const startedAt = Date.now();

  try {
    await withTimeout(db.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    const body = trusted
      ? { status: 'ready', database: 'ok', latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() }
      : { status: 'ready' };
    return NextResponse.json(body, { status: 200, headers: NO_STORE });
  } catch (err) {
    const timedOut = err instanceof TimeoutError;
    captureException(err, { scope: 'api/health/ready', timedOut });
    const body = trusted
      ? {
          status: 'unavailable',
          database: timedOut ? 'timeout' : 'error',
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
        }
      : { status: 'unavailable' };
    return NextResponse.json(body, { status: 503, headers: NO_STORE });
  }
}
