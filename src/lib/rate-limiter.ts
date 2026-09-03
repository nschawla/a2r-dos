/**
 * SEC-1 (GA-readiness audit) — lightweight in-memory sliding-window
 * rate-limiter.
 *
 * Baseline brute-force / abuse protection with no external Redis
 * dependency. Each key keeps a list of hit timestamps; on every check we
 * drop timestamps outside the window and compare the remaining count to
 * the limit (a true sliding window, not a fixed bucket that resets on a
 * boundary). Idle keys are swept out opportunistically — no timers, so
 * this is safe in every runtime.
 *
 * Trade-off: state is per-process. On a single instance that's the whole
 * picture; behind N load-balanced instances each enforces ~limit/N of the
 * true rate, which is still a hard cap on a single attacker hitting one
 * instance. Swap `hit()` for a Redis/Upstash-backed check when precise
 * global limits are needed — the call sites don't change.
 *
 *   import { hit, tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
 *   const rl = hit(`auth:login:${ip}`, { limit: 10, windowMs: 60_000 });
 *   if (!rl.ok) return tooManyRequestsResponse(rl);
 */

export interface RateLimitRule {
  /** Max requests allowed within `windowMs`. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  /** Requests still allowed in the current window (0 once blocked). */
  remaining: number;
  /** Seconds until at least one slot frees up. `0` when `ok`. */
  retryAfterSeconds: number;
  /** Epoch ms at which the window will have room again. */
  resetAt: number;
}

// key -> ascending list of hit timestamps (ms). Module-level so it lives
// for the life of the process; a dev-server hot reload re-creates it,
// which is fine (limits just reset).
const buckets = new Map<string, number[]>();

const SWEEP_EVERY_MS = 60_000;
/** A key untouched for this long is definitely idle — drop it. */
const IDLE_TTL_MS = 10 * 60_000;
let lastSweep = 0;

function sweep(now: number): void {
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || now - hits[hits.length - 1]! > IDLE_TTL_MS) {
      buckets.delete(key);
    }
  }
  lastSweep = now;
}

/**
 * Record a hit against `key` and report whether it's within `rule`.
 * A blocked hit is NOT counted (so a caller hammering a blocked key
 * doesn't push its own reset further out).
 */
export function hit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > SWEEP_EVERY_MS) sweep(now);

  const windowStart = now - rule.windowMs;
  const recent = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= rule.limit) {
    buckets.set(key, recent); // persist the trimmed list
    const resetAt = recent[0]! + rule.windowMs;
    return {
      ok: false,
      limit: rule.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return {
    ok: true,
    limit: rule.limit,
    remaining: rule.limit - recent.length,
    retryAfterSeconds: 0,
    resetAt: now + rule.windowMs,
  };
}

/** Peek without recording a hit — handy for tests / diagnostics. */
export function peek(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => t > now - rule.windowMs);
  const blocked = recent.length >= rule.limit;
  const resetAt = recent.length > 0 ? recent[0]! + rule.windowMs : now;
  return {
    ok: !blocked,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - recent.length),
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil((resetAt - now) / 1000)) : 0,
    resetAt,
  };
}

/** Clear all state. Test-only. */
export function __resetRateLimiter(): void {
  buckets.clear();
  lastSweep = 0;
}

/** Standard `429 Too Many Requests` with `Retry-After` + `X-RateLimit-*`. */
export function tooManyRequestsResponse(result: RateLimitResult, message?: string): Response {
  return new Response(
    JSON.stringify({
      error: message ?? `Too many requests. Retry in ${result.retryAfterSeconds}s.`,
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

/** Best-effort client IP from proxy headers; `'unknown'` when absent. */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
