/**
 * SEC-1 — in-memory sliding-window rate limiter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hit,
  peek,
  __resetRateLimiter,
  tooManyRequestsResponse,
  clientIpFrom,
} from '../src/lib/rate-limiter';

const RULE = { limit: 3, windowMs: 1000 };

beforeEach(() => {
  __resetRateLimiter();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hit', () => {
  it('allows up to the limit, then blocks', () => {
    expect(hit('k', RULE)).toMatchObject({ ok: true, remaining: 2 });
    expect(hit('k', RULE)).toMatchObject({ ok: true, remaining: 1 });
    expect(hit('k', RULE)).toMatchObject({ ok: true, remaining: 0 });

    const blocked = hit('k', RULE);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('keys are independent', () => {
    hit('a', RULE);
    hit('a', RULE);
    hit('a', RULE);
    expect(hit('a', RULE).ok).toBe(false);
    expect(hit('b', RULE).ok).toBe(true);
  });

  it('slides: old hits fall out of the window', () => {
    hit('k', RULE);
    hit('k', RULE);
    hit('k', RULE);
    expect(hit('k', RULE).ok).toBe(false);

    vi.advanceTimersByTime(1001); // whole window has passed
    expect(hit('k', RULE)).toMatchObject({ ok: true });
  });

  it('a blocked hit does not push the reset further out', () => {
    hit('k', RULE);
    hit('k', RULE);
    hit('k', RULE);
    const first = hit('k', RULE);
    vi.advanceTimersByTime(200);
    const second = hit('k', RULE);
    expect(second.retryAfterSeconds).toBeLessThanOrEqual(first.retryAfterSeconds);
  });
});

describe('peek', () => {
  it('reports state without recording a hit', () => {
    hit('k', RULE);
    hit('k', RULE);
    expect(peek('k', RULE)).toMatchObject({ ok: true, remaining: 1 });
    expect(peek('k', RULE)).toMatchObject({ ok: true, remaining: 1 }); // unchanged
    expect(hit('k', RULE)).toMatchObject({ ok: true, remaining: 0 });
  });
});

describe('tooManyRequestsResponse', () => {
  it('is a 429 with Retry-After and rate-limit headers', async () => {
    hit('k', RULE);
    hit('k', RULE);
    hit('k', RULE);
    const blocked = hit('k', RULE);
    const res = tooManyRequestsResponse(blocked, 'slow down');

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe(String(blocked.retryAfterSeconds));
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(await res.json()).toMatchObject({ error: 'slow down', retryAfterSeconds: blocked.retryAfterSeconds });
  });
});

describe('clientIpFrom', () => {
  const req = (headers: Record<string, string>) => new Request('https://x.test', { headers });

  it('takes the first x-forwarded-for entry', () => {
    expect(clientIpFrom(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });
  it('falls back to x-real-ip', () => {
    expect(clientIpFrom(req({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
  });
  it('is "unknown" when no proxy headers are present', () => {
    expect(clientIpFrom(req({}))).toBe('unknown');
  });
});
