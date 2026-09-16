/**
 * Read-Only External Integration Adapters — scheduled background sync
 * trigger, same shape as /api/internal/retention.
 *
 *   POST /api/internal/integrations-sync   → sync every due connection
 *
 * Auth (either):
 *   • header `x-a2r-internal-token: <INTEGRATIONS_SYNC_API_TOKEN>` — for a
 *     cron scheduler (Vercel Cron / external). Disabled when the env var
 *     is unset.
 *   • an authenticated A2R staff session — for a manual all-tenants run.
 *
 * "Due" = `status = CONNECTED` and either never synced or
 * `lastSyncAt` older than the connection's own `syncIntervalMinutes`.
 * Each connection syncs independently — one failure never blocks the rest.
 *
 * NOT yet registered in vercel.json's cron config — this route is built
 * and tested, but wiring an automatically-firing schedule in production is
 * a deliberate follow-up step, not something to flip on unreviewed.
 *
 * Excluded from the session middleware (src/middleware.ts, same
 * /api/internal/* prefix as retention) so the token path works with no
 * cookie.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getOpsContextOrNull } from '@/lib/ops-auth';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { findDueConnections, runSync } from '@/lib/integrations/sync-runner';
import { tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
import { hitDistributed } from '@/lib/rate-limiter-redis';
import { captureException, captureMessage } from '@/lib/observability';
import { withRouteHandler } from '@/lib/observability/route-wrapper';

export const dynamic = 'force-dynamic';

function internalTokenMatches(request: Request): boolean {
  const expected = process.env.INTEGRATIONS_SYNC_API_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get('x-a2r-internal-token') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorize(request: Request): Promise<{ ok: true; actor: string } | { ok: false }> {
  if (internalTokenMatches(request)) return { ok: true, actor: 'internal-token' };
  const ops = await getOpsContextOrNull();
  if (ops) return { ok: true, actor: ops.email };
  return { ok: false };
}

export const POST = withRouteHandler('internal/integrations-sync', async (request) => {
  const rl = await hitDistributed(`internal:integrations-sync:${clientIpFrom(request)}`, { limit: 6, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequestsResponse(rl);

  const blocked = await passwordRotationGate();
  if (blocked) return blocked;

  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  const due = await findDueConnections();
  const results: { connectionId: string; status: string; recordsIngested: number }[] = [];

  for (const conn of due) {
    try {
      const outcome = await runSync(conn.organizationId, conn.id, 'scheduled');
      results.push({ connectionId: conn.id, status: outcome.status, recordsIngested: outcome.recordsIngested });
    } catch (err) {
      // One connection's unhandled failure never blocks the rest of the run.
      captureException(err, { scope: 'internal/integrations-sync', connectionId: conn.id });
      results.push({ connectionId: conn.id, status: 'FAILED', recordsIngested: 0 });
    }
  }

  captureMessage('Integration sync sweep executed', {
    scope: 'internal/integrations-sync',
    actor: auth.actor,
    connectionsDue: due.length,
    succeeded: results.filter((r) => r.status === 'SUCCESS').length,
  });
  return NextResponse.json({ due: due.length, results }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
});
