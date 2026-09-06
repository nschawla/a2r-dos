/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P2 — Server Action rate-limit helpers. A Server Action has no `Response`
 * object, so the over-limit path returns the same `{ ok:false, error }`
 * tuple the action already uses for domain failures (the client's
 * `useSafeAction` / inline handlers surface it as-is). `RATE_LIMITED` is
 * kept as a stable machine code prefix inside a human message.
 *
 * Server-only (`next/headers`).
 */
import { headers } from 'next/headers';
import { hit } from '@/lib/rate-limiter';
import type { RateLimitRule } from '@/lib/rate-limiter';

export const RATE_LIMITED = 'RATE_LIMITED';

function clientIp(): string {
  const h = headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
}

function message(retryAfterSeconds: number): string {
  const mins = Math.ceil(retryAfterSeconds / 60);
  return `${RATE_LIMITED} — too many requests. Try again in ${
    mins > 1 ? `${mins} minutes` : `${Math.max(1, retryAfterSeconds)} second(s)`
  }.`;
}

/** Per-client-IP limit (unauthenticated boundaries: registration). */
export function rateLimitByIp(
  scope: string,
  rule: RateLimitRule,
): { ok: false; error: string } | null {
  const rl = hit(`${scope}:${clientIp()}`, rule);
  return rl.ok ? null : { ok: false, error: message(rl.retryAfterSeconds) };
}

/** Per-authenticated-user limit (password change, batch import, snapshots). */
export function rateLimitByUser(
  scope: string,
  userId: string,
  rule: RateLimitRule,
): { ok: false; error: string } | null {
  const rl = hit(`${scope}:${userId}`, rule);
  return rl.ok ? null : { ok: false, error: message(rl.retryAfterSeconds) };
}
