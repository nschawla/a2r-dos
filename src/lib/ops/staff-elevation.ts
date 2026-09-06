/**
 * A2R Operator Control Plane — Just-In-Time (JIT) privilege elevation.
 *
 * P1 (2026-09). A live `staff_grants` row (P0 #2) is only *eligibility* to
 * reach the /ops read views. Every state-changing /ops operation now
 * requires a live `staff_elevations` row:
 *
 *   - requested with a reason (≥ 10 chars),
 *   - bound to the operator's authenticated session — the httpOnly
 *     `a2r_ops_elevation` cookie carries an opaque token, and the guard in
 *     src/lib/ops-auth.ts additionally requires `row.userId === session
 *     .user.id`,
 *   - auto-expiring after a strict TTL (default 30 min, hard cap
 *     `OPS_ELEVATION_MAX_MINUTES` — clamped ≤ 240, defaults to 60),
 *   - at most one live elevation per operator at a time (requesting a new
 *     one supersedes the old).
 *
 * The rows ARE the audit trail — like `staff_grants`, there is no separate
 * ledger: elevation is a platform event, and `recordLedgerEvent` needs a
 * tenant `organizationId`.
 *
 * Server-only (reads the Prisma client). Mirrors the shape of the
 * Impersonation Gateway in src/lib/ops/tenant-management.ts.
 */
import { db } from '@/lib/db';
import { hasActiveStaffGrant } from '@/lib/ops/staff-grants';
import { mintToken, hashToken } from '@/lib/crypto/bearer-token';

export const ELEVATION_COOKIE = 'a2r_ops_elevation';
export const DEFAULT_TTL_MINUTES = 30;
export const MIN_TTL_MINUTES = 5;
export const MIN_REASON_LENGTH = 10;

/** The hard ceiling on an elevation window. `OPS_ELEVATION_MAX_MINUTES`
 * env override, itself clamped to [MIN_TTL_MINUTES, 240]; default 60. */
export function maxTtlMinutes(): number {
  const raw = Number(process.env.OPS_ELEVATION_MAX_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return 60;
  return Math.min(240, Math.max(MIN_TTL_MINUTES, Math.floor(raw)));
}

/** Clamp a requested TTL into the allowed window. */
export function clampTtlMinutes(requested: number | undefined): number {
  const n = Number.isFinite(requested) ? Math.floor(requested as number) : DEFAULT_TTL_MINUTES;
  return Math.min(maxTtlMinutes(), Math.max(MIN_TTL_MINUTES, n));
}

export interface ElevationView {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  /** live right now — not ended, not past expiresAt */
  active: boolean;
}

export type RequestElevationResult =
  | { ok: true; token: string; expiresAt: Date; ttlMinutes: number }
  | { ok: false; error: string };

/**
 * Mint a JIT elevation for `userId`. Requires a live standing `staff_grants`
 * entitlement. Supersedes any existing live elevation for that operator.
 */
export async function requestElevation(input: {
  userId: string;
  reason: string;
  ttlMinutes?: number;
  ip?: string | null;
}): Promise<RequestElevationResult> {
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, error: `A reason of at least ${MIN_REASON_LENGTH} characters is required for the audit trail.` };
  }
  if (!(await hasActiveStaffGrant(input.userId))) {
    return { ok: false, error: 'You do not hold a standing operator entitlement.' };
  }

  const ttlMinutes = clampTtlMinutes(input.ttlMinutes);
  const now = Date.now();
  const expiresAt = new Date(now + ttlMinutes * 60_000);
  // P0-5 — the plaintext `token` is returned for the cookie and never
  // stored; only its SHA-256 (`tokenHash`) is persisted.
  const { token, tokenHash } = mintToken();

  // One live elevation per operator — supersede any prior one.
  await db.staffElevation.updateMany({
    where: { userId: input.userId, endedAt: null },
    data: { endedAt: new Date(now), endedReason: 'superseded' },
  });

  await db.staffElevation.create({
    data: {
      userId: input.userId,
      tokenHash,
      reason: reason.slice(0, 500),
      expiresAt,
      requestedFromIp: input.ip ?? null,
    },
  });

  return { ok: true, token, expiresAt, ttlMinutes };
}

/** Resolve the cookie token to a still-live elevation row, or null. */
export async function resolveActiveElevation(token: string | undefined | null) {
  if (!token) return null;
  const row = await db.staffElevation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.endedAt || row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/** True iff `userId` currently holds a live elevation. */
export async function hasActiveElevation(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await db.staffElevation.findFirst({
    where: { userId, endedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return row !== null;
}

/** End an elevation by its cookie token (idempotent). */
export async function endElevation(
  token: string | undefined | null,
  reason: 'operator' | 'expired-sweep' = 'operator',
): Promise<void> {
  if (!token) return;
  await db.staffElevation.updateMany({
    where: { tokenHash: hashToken(token), endedAt: null },
    data: { endedAt: new Date(), endedReason: reason },
  });
}

export interface ElevationHistoryRow {
  id: string;
  userEmail: string;
  userName: string | null;
  reason: string;
  createdAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedReason: string | null;
  active: boolean;
}

/** Recent elevations across all operators — the in-console audit view. */
export async function listElevationHistory(limit = 25): Promise<ElevationHistoryRow[]> {
  const rows = await db.staffElevation.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    userEmail: r.user.email,
    userName: r.user.name,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    endedReason: r.endedReason,
    active: !r.endedAt && r.expiresAt.getTime() > now,
  }));
}

/** Shape the row for the guard / UI. */
export function toElevationView(row: {
  id: string;
  reason: string;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
}): ElevationView {
  return {
    id: row.id,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    active: !row.endedAt && row.expiresAt.getTime() > Date.now(),
  };
}
