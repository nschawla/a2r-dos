import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P0-6 — the distributed (Upstash) rate-limiter wrapper.
 *
 * Two things under test, both without a network:
 *   1. no env vars  → transparently falls back to the in-process limiter.
 *   2. env vars set → `hitDistributed` drives `client.eval(...)` and maps
 *      its `[ok, remaining, resetAt]` tuple onto a RateLimitResult. A tiny
 *      in-JS sorted-set stands in for the server-side Lua so the sliding
 *      window semantics (count-and-add, block at limit) are exercised.
 */

const RULE = { limit: 3, windowMs: 60_000 };

describe('hitDistributed — no Redis configured', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('reports not-configured and enforces via the in-process limiter', async () => {
    const { hitDistributed, isRedisRateLimiterConfigured } = await import('@/lib/rate-limiter-redis');
    const { __resetRateLimiter } = await import('@/lib/rate-limiter');
    __resetRateLimiter();

    expect(isRedisRateLimiterConfigured()).toBe(false);

    const key = `fallback-${Date.now()}`;
    for (let i = 0; i < RULE.limit; i++) {
      expect((await hitDistributed(key, RULE)).ok).toBe(true);
    }
    const blocked = await hitDistributed(key, RULE);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe('hitDistributed — Redis configured (faked eval)', () => {
  const zset = new Map<string, number[]>();

  beforeEach(() => {
    vi.resetModules();
    zset.clear();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    vi.doMock('@upstash/redis', () => ({
      Redis: class {
        // Mirrors SLIDING_WINDOW_LUA closely enough to test the mapping.
        async eval(_script: string, keys: string[], args: string[]) {
          const key = keys[0]!;
          const now = Number(args[0]);
          const windowMs = Number(args[1]);
          const limit = Number(args[2]);
          const hits = (zset.get(key) ?? []).filter((t) => t > now - windowMs);
          if (hits.length >= limit) {
            zset.set(key, hits);
            return [0, 0, hits[0]! + windowMs];
          }
          hits.push(now);
          zset.set(key, hits);
          return [1, limit - hits.length, now + windowMs];
        }
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('@upstash/redis');
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('counts down remaining, then blocks with a retry-after', async () => {
    const { hitDistributed, isRedisRateLimiterConfigured } = await import('@/lib/rate-limiter-redis');
    expect(isRedisRateLimiterConfigured()).toBe(true);

    const key = `redis-${Date.now()}`;
    const remaining: number[] = [];
    for (let i = 0; i < RULE.limit; i++) {
      const r = await hitDistributed(key, RULE);
      expect(r.ok).toBe(true);
      remaining.push(r.remaining);
    }
    expect(remaining).toEqual([2, 1, 0]);

    const blocked = await hitDistributed(key, RULE);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.resetAt).toBeGreaterThan(Date.now());
  });

  it('a thrown eval falls back to the in-process limiter instead of erroring', async () => {
    vi.doUnmock('@upstash/redis');
    vi.doMock('@upstash/redis', () => ({
      Redis: class {
        async eval() {
          throw new Error('network down');
        }
      },
    }));
    const { hitDistributed } = await import('@/lib/rate-limiter-redis');
    const r = await hitDistributed(`err-${Date.now()}`, RULE);
    expect(r.ok).toBe(true); // fell through to hit()
  });
});
