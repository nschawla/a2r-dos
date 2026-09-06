/**
 * CMP-2 (GA-readiness audit) — data retention sweep, HTTP trigger.
 *
 *   GET  /api/internal/retention   → dry-run report (counts only)
 *   POST /api/internal/retention   → apply the sweep (body `{ "dryRun": true }` to preview)
 *
 * Auth (either):
 *   • header `x-a2r-internal-token: <RETENTION_API_TOKEN>` — for a cron
 *     scheduler (Vercel Cron / external). Disabled when the env var is unset.
 *   • an authenticated A2R staff session — for a manual run.
 *
 * Excluded from the session middleware (src/middleware.ts) so the token
 * path works with no cookie. Never touches the immutable compliance ledger.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getOpsContextOrNull } from '@/lib/ops-auth';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { runRetentionSweep } from '@/server/services/data-retention';
import { tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
import { hitDistributed } from '@/lib/rate-limiter-redis';
import { captureException, captureMessage } from '@/lib/observability';

export const dynamic = 'force-dynamic';

function internalTokenMatches(request: Request): boolean {
  const expected = process.env.RETENTION_API_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get('x-a2r-internal-token') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorize(
  request: Request
): Promise<{ ok: true; actor: string } | { ok: false }> {
  if (internalTokenMatches(request)) return { ok: true, actor: 'internal-token' };
  const ops = await getOpsContextOrNull();
  if (ops) return { ok: true, actor: ops.email };
  return { ok: false };
}

export async function GET(request: Request) {
  const rl = await hitDistributed(`internal:retention:${clientIpFrom(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequestsResponse(rl);

  const blocked = await passwordRotationGate();
  if (blocked) return blocked;

  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  const result = await runRetentionSweep({ dryRun: true });
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const rl = await hitDistributed(`internal:retention:${clientIpFrom(request)}`, { limit: 6, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequestsResponse(rl);

  const blocked = await passwordRotationGate();
  if (blocked) return blocked;

  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown };
  const dryRun = body?.dryRun === true;

  try {
    const result = await runRetentionSweep({ dryRun });
    captureMessage('Data retention sweep executed', {
      scope: 'internal/retention',
      actor: auth.actor,
      dryRun,
      totalDeleted: result.totalDeleted,
      totalMatched: result.totalMatched,
    });
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    captureException(err, { scope: 'internal/retention', actor: auth.actor });
    return NextResponse.json({ error: 'Retention sweep failed.' }, { status: 500 });
  }
}
