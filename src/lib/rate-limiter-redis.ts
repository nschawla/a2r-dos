/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P0-6 — shared, atomic, globally-distributed rate limiting.
 *
 * The in-process limiter (`src/lib/rate-limiter.ts`) enforces ~limit/N per
 * instance behind N serverless functions — a determined attacker spread
 * across warm instances sees N× the intended rate. This module moves the
 * sliding-window state into Upstash Redis (HTTP/REST — no TCP, safe from
 * Vercel functions and the Edge runtime) and does the count-and-add in a
 * single server-side Lua script, so the check is atomic and every instance
 * enforces the SAME global window.
 *
 * Configuration & failure policy:
 *   - No `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: the
 *     in-process limiter is the intended, accepted posture (local dev, CI,
 *     tests, and any deployment that deliberately does not run Upstash).
 *     Callers fall back to it cleanly; production records the fact once at
 *     `info` so it is a deliberate state, not a silent one.
 *   - Upstash IS configured but a call throws: this is the case that must
 *     NOT silently downgrade. A deployment that committed to distributed
 *     enforcement and then loses Redis fails CLOSED in production — the
 *     request is DENIED (429) and observability is paged at `error` level,
 *     rather than dropping back to weaker per-instance limiting. Escape
 *     hatch: `RL_ALLOW_INPROCESS_FALLBACK=1` restores the fall-back (for a
 *     sustained Upstash outage where locking users out is worse), reported
 *     once at `warning`. Never a default.
 *   - Non-production always falls back (never fails closed).
 *
 * The call-site API is unchanged: `hitDistributed(key, rule)` returns the
 * same `RateLimitResult` shape as `hit()`.
 */
import { Redis } from '@upstash/redis';
import { captureMessage } from '@/lib/observability';
import { hit, type RateLimitRule, type RateLimitResult } from '@/lib/rate-limiter';

// Lazily constructed so importing this module never touches the network.
// `new Redis()` itself makes no connection (the client is HTTP/REST — each
// command is a fetch), so this only guards the missing-env-var case.
let clientSingleton: Redis | null | undefined;

function redisClient(): Redis | null {
  if (clientSingleton !== undefined) return clientSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  clientSingleton = url && token ? new Redis({ url, token }) : null;
  return clientSingleton;
}

/** True when a shared Redis backend is configured for this process. */
export function isRedisRateLimiterConfigured(): boolean {
  return redisClient() !== null;
}

/**
 * Whether it is acceptable to fall back to the in-process limiter *after a
 * configured Upstash backend fails a call*. Anything but a production build
 * may fall back; production only when the deliberate escape hatch is set.
 * (A completely absent backend always falls back — that path never reaches
 * here.)
 */
function inProcessFallbackAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return /^(1|true|yes|on)$/i.test(process.env.RL_ALLOW_INPROCESS_FALLBACK ?? '');
}

/** Seconds a fail-closed denial asks the client to back off before retrying. */
const FAIL_CLOSED_RETRY_SECONDS = 5;

function failClosed(rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  return {
    ok: false,
    limit: rule.limit,
    remaining: 0,
    retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS,
    resetAt: now + FAIL_CLOSED_RETRY_SECONDS * 1000,
  };
}

/**
 * Atomic sliding-window log. One round trip:
 *   1. drop timestamps older than the window
 *   2. if the remaining count is already at the limit → blocked (no add)
 *   3. otherwise record this hit and set the key TTL to the window length
 * Returns `[ok, remaining, resetAtMs]`.
 */
const SLIDING_WINDOW_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit    = tonumber(ARGV[3])
local member   = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now + windowMs
  if oldest[2] then resetAt = tonumber(oldest[2]) + windowMs end
  return {0, 0, resetAt}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return {1, limit - count - 1, now + windowMs}
`;

let inProcessOnlyNoticeLogged = false;
let scriptFailureReported = false;
let fallbackAllowedReported = false;

/** One-time `warning` note that the production escape hatch is in effect. */
function reportFallbackAllowed(detail: string): void {
  if (fallbackAllowedReported) return;
  fallbackAllowedReported = true;
  captureMessage(
    'Distributed rate-limiter is falling back to the in-process limiter in production after a Redis failure — ' +
      `RL_ALLOW_INPROCESS_FALLBACK is set, so per-instance limiting is being accepted. Unset it once Upstash is healthy. ${detail}`,
    { scope: 'rate-limit/redis' },
    'warning',
  );
}

/**
 * Record a hit against `key` in the shared window and report whether it is
 * within `rule`.
 *
 * With no Upstash backend the in-process limiter is used (the accepted
 * posture). With a backend configured, a call that throws fails CLOSED in
 * production unless `RL_ALLOW_INPROCESS_FALLBACK` is set.
 */
export async function hitDistributed(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const client = redisClient();

  if (!client) {
    // No distributed backend configured at all — the in-process limiter is
    // the intended posture for this deployment. Fall back cleanly; note it
    // once in production so the degraded-enforcement state is on the record.
    if (process.env.NODE_ENV === 'production' && !inProcessOnlyNoticeLogged) {
      inProcessOnlyNoticeLogged = true;
      captureMessage(
        'Distributed rate-limiter has no Upstash backend configured — using the in-process limiter ' +
          '(per-instance enforcement; ~limit/N behind N instances). Set UPSTASH_REDIS_REST_URL / ' +
          'UPSTASH_REDIS_REST_TOKEN for atomic global limits.',
        { scope: 'rate-limit/redis' },
        'info',
      );
    }
    return hit(key, rule);
  }

  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const [ok, remaining, resetAt] = (await client.eval(
      SLIDING_WINDOW_LUA,
      [`rl:${key}`],
      [String(now), String(rule.windowMs), String(rule.limit), member],
    )) as [number, number, number];

    const allowed = ok === 1;
    return {
      ok: allowed,
      limit: rule.limit,
      remaining: Math.max(0, remaining),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);

    if (inProcessFallbackAllowed()) {
      if (process.env.NODE_ENV === 'production') {
        reportFallbackAllowed(detail);
      } else if (!scriptFailureReported) {
        scriptFailureReported = true;
        captureMessage(
          `Distributed rate-limiter Redis call failed — falling back to the in-process limiter. ${detail}`,
          { scope: 'rate-limit/redis' },
          'warning',
        );
      }
      return hit(key, rule);
    }

    // Production, Upstash configured, no escape hatch — fail closed rather
    // than silently degrading to per-instance limiting.
    if (!scriptFailureReported) {
      scriptFailureReported = true;
      captureMessage(
        `Distributed rate-limiter Redis call failed in production — failing closed (requests denied until Upstash recovers). ${detail}`,
        { scope: 'rate-limit/redis' },
        'error',
      );
    }
    return failClosed(rule);
  }
}
