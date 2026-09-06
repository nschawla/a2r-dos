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
 * Opt-in and fail-open:
 *   - No `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` → callers
 *     transparently use the in-process limiter (local dev, CI, tests).
 *   - Redis configured but unreachable on a given call → that call falls
 *     back to the in-process limiter (a Redis blip must not lock users out
 *     of sign-in) and the failure is reported once via observability.
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

let scriptFailureReported = false;

/**
 * Record a hit against `key` in the shared window and report whether it is
 * within `rule`. Falls back to the in-process limiter when Redis is not
 * configured or a call fails.
 */
export async function hitDistributed(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const client = redisClient();
  if (!client) return hit(key, rule);

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
    if (!scriptFailureReported) {
      scriptFailureReported = true;
      captureMessage(
        `Distributed rate-limiter Redis call failed — falling back to the in-process limiter. ${
          err instanceof Error ? err.message : String(err)
        }`,
        { scope: 'rate-limit/redis' },
        'warning',
      );
    }
    return hit(key, rule);
  }
}
