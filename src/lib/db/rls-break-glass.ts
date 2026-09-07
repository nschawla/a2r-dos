/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Phase 2 (v1.12.0) — RLS break-glass control plane.
 *
 * ══ WHAT ════════════════════════════════════════════════════════════════
 * A single DB row (`_rls_control`, migration 20) carries a break-glass
 * window. While `breakGlassUntil` is in the future:
 *
 *   - `withTenantTx` / `withTenantTxFor` / the per-op RLS extension SKIP the
 *     `SET LOCAL ROLE a2r_app` switch and run the transaction as `postgres`.
 *     Tenant isolation falls back to the application tier — exactly the
 *     posture with `RLS_ENFORCE` unset (app-tier scoping via
 *     `src/lib/db/org-scope.ts` is still fully in force).
 *   - every affected request emits an `error`-level observability event
 *     (throttled per process) so the on-call is paged.
 *
 * Expiry is purely time-based — no cron, no redeploy. Set the window with
 * `scripts/rls-break-glass.ts` (CLI, over DIRECT_URL) or the elevated ops
 * actions `engageRlsBreakGlassAction` / `disengageRlsBreakGlassAction`.
 *
 * ══ WHY A DB ROW (not an env var) ═══════════════════════════════════════
 * On Vercel an env var needs a redeploy (~2 min) to change and cannot
 * self-clear. A row read on the `postgres` connection propagates in ≤10s
 * (the cache TTL), auto-expires, and is writable from an incident shell.
 *
 * The check runs on the BASE `db` connection (never inside `withTenantTx` —
 * that would recurse). `_rls_control` has RLS enabled with no `a2r_app`
 * policy, so the restricted role can never read or forge the window.
 *
 * Node-only. Never imported by the Edge middleware.
 */
import { captureMessage } from '@/lib/observability';

/** How long a cached read of `_rls_control` is trusted. Bounds the worst-case
 *  delay between engaging break-glass and every instance honouring it. */
const CACHE_TTL_MS = 10_000;
/** Minimum gap between break-glass alerts from one process (avoid flooding). */
const ALERT_THROTTLE_MS = 60_000;
/** Hard ceiling on a single break-glass window. Re-engage to extend. */
export const MAX_WINDOW_MINUTES = 60;

interface RlsControlRow {
  breakGlassUntil: Date | null;
  reason: string | null;
  actorEmail: string | null;
  engagedAt: Date | null;
}

let cache: { row: RlsControlRow | null; expiresAt: number } | null = null;
let lastAlertAt = 0;

/** The pooled Prisma singleton — imported lazily to keep this module out of
 *  the `@/lib/db` → `rls-transaction` → here import cycle. */
async function client() {
  const mod = await import('@/lib/db');
  return mod.db;
}

async function readControlRow(): Promise<RlsControlRow | null> {
  try {
    const db = await client();
    const rows = await db.$queryRawUnsafe<RlsControlRow[]>(
      `SELECT "breakGlassUntil", "reason", "actorEmail", "engagedAt"
         FROM "_rls_control" WHERE "id" = 'singleton' LIMIT 1`,
    );
    return rows[0] ?? null;
  } catch {
    // Table absent (pre-migration-20) or the DB is unreachable. Fail toward
    // ENFORCEMENT — a break-glass we can't confirm is treated as not set.
    return null;
  }
}

function alert(row: RlsControlRow | null): void {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_THROTTLE_MS) return;
  lastAlertAt = now;
  captureMessage(
    'RLS break-glass ENGAGED — tenant isolation is running app-tier-only',
    {
      scope: 'db/rls-break-glass',
      reason: row?.reason ?? undefined,
      actorEmail: row?.actorEmail ?? undefined,
      until: row?.breakGlassUntil?.toISOString(),
    },
    'error',
  );
}

/**
 * True when a break-glass window is currently open. Cached for
 * `CACHE_TTL_MS`. Emits a throttled `error` alert while active.
 */
export async function isBreakGlassActive(): Promise<boolean> {
  const now = Date.now();
  if (!cache || cache.expiresAt <= now) {
    cache = { row: await readControlRow(), expiresAt: now + CACHE_TTL_MS };
  }
  const until = cache.row?.breakGlassUntil?.getTime() ?? null;
  const active = until != null && until > now;
  if (active) alert(cache.row);
  return active;
}

export interface BreakGlassStatus {
  active: boolean;
  breakGlassUntil: string | null;
  reason: string | null;
  actorEmail: string | null;
  engagedAt: string | null;
}

/** Uncached, authoritative read — for the CLI / ops surface. */
export async function breakGlassStatus(): Promise<BreakGlassStatus> {
  const row = await readControlRow();
  const until = row?.breakGlassUntil?.getTime() ?? null;
  return {
    active: until != null && until > Date.now(),
    breakGlassUntil: row?.breakGlassUntil?.toISOString() ?? null,
    reason: row?.reason ?? null,
    actorEmail: row?.actorEmail ?? null,
    engagedAt: row?.engagedAt?.toISOString() ?? null,
  };
}

/** Open a break-glass window. `minutes` is clamped to `[1, MAX_WINDOW_MINUTES]`. */
export async function engageBreakGlass(input: {
  minutes: number;
  reason: string;
  actorEmail: string;
}): Promise<{ breakGlassUntil: Date; minutes: number }> {
  const minutes = Math.max(1, Math.min(MAX_WINDOW_MINUTES, Math.floor(input.minutes)));
  const breakGlassUntil = new Date(Date.now() + minutes * 60_000);
  const db = await client();
  await db.$executeRawUnsafe(
    `UPDATE "_rls_control"
        SET "breakGlassUntil" = $1, "reason" = $2, "actorEmail" = $3,
            "engagedAt" = now(), "updatedAt" = now()
      WHERE "id" = 'singleton'`,
    breakGlassUntil,
    input.reason,
    input.actorEmail,
  );
  cache = null;
  lastAlertAt = 0;
  captureMessage(
    'RLS break-glass ENGAGED',
    {
      scope: 'db/rls-break-glass',
      reason: input.reason,
      actorEmail: input.actorEmail,
      minutes,
      until: breakGlassUntil.toISOString(),
    },
    'error',
  );
  return { breakGlassUntil, minutes };
}

/** Close the break-glass window immediately (RLS resumes on the next check). */
export async function disengageBreakGlass(input: { actorEmail: string }): Promise<void> {
  const db = await client();
  await db.$executeRawUnsafe(
    `UPDATE "_rls_control"
        SET "breakGlassUntil" = NULL, "reason" = NULL, "engagedAt" = NULL,
            "actorEmail" = $1, "updatedAt" = now()
      WHERE "id" = 'singleton'`,
    input.actorEmail,
  );
  cache = null;
  captureMessage(
    'RLS break-glass DISENGAGED — tenant isolation restored',
    { scope: 'db/rls-break-glass', actorEmail: input.actorEmail },
    'warning',
  );
}

/** Test-only: drop the in-process cache so the next check re-reads the row. */
export function __resetBreakGlassCache(): void {
  cache = null;
  lastAlertAt = 0;
}
