/**
 * OBS-3 (GA-readiness audit) — readiness probe.
 *
 *   GET /api/health/ready
 *     → 200 { status: 'ready', database: 'ok', latencyMs }
 *     → 503 { status: 'unavailable', database: 'error' | 'timeout' }
 *
 * "Can this instance actually serve requests?" — runs one trivial
 * `SELECT 1` against Postgres with a 2s ceiling. Deploys should gate on a
 * 200 here; a 503 tells the orchestrator to hold traffic off this
 * instance without killing it.
 *
 * Unauthenticated: excluded from the session matcher in src/middleware.ts.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { captureException } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DB_TIMEOUT_MS = 2000;

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
      }
    );
  });
}

export async function GET() {
  const startedAt = Date.now();
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    return NextResponse.json(
      { status: 'ready', database: 'ok', latencyMs: Date.now() - startedAt, timestamp: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const timedOut = err instanceof TimeoutError;
    captureException(err, { scope: 'api/health/ready', timedOut });
    return NextResponse.json(
      {
        status: 'unavailable',
        database: timedOut ? 'timeout' : 'error',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
