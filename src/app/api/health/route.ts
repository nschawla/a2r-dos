/**
 * OBS-3 (GA-readiness audit) — liveness probe.
 *
 *   GET /api/health  →  200 { status: 'ok', timestamp }
 *
 * "Is the Node process up and serving?" — no dependencies touched, so a
 * load balancer / orchestrator can use it to decide whether to route
 * traffic to this instance at all. Readiness (can it reach the database?)
 * is the separate /api/health/ready probe.
 *
 * Unauthenticated: excluded from the session matcher in src/middleware.ts.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
