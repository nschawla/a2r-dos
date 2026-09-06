import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on the structured-logging seam.
const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability')>();
  return { ...actual, captureException };
});
// actorContext() lazily imports these; keep them cheap + non-throwing.
vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

import {
  withAction,
  redactContext,
  isNextControlFlow,
  GENERIC_ACTION_ERROR,
} from '@/lib/observability/action-wrapper';
import { withRouteHandler } from '@/lib/observability/route-wrapper';

beforeEach(() => captureException.mockClear());

describe('withAction', () => {
  it('passes a successful result straight through', async () => {
    const wrapped = withAction('ok', async (n: number) => ({ ok: true as const, n }));
    expect(await wrapped(3)).toEqual({ ok: true, n: 3 });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('passes a domain {ok:false} failure straight through (no capture)', async () => {
    const wrapped = withAction('domain', async () => ({ ok: false as const, error: 'already exists' }));
    expect(await wrapped()).toEqual({ ok: false, error: 'already exists' });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('converts an unhandled throw to the generic result + one structured capture', async () => {
    const boom = new Error('connection reset by peer');
    const wrapped = withAction('updateWidget', async () => {
      throw boom;
    });
    expect(await wrapped()).toEqual({ ok: false, error: GENERIC_ACTION_ERROR });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0]!;
    expect(err).toBe(boom);
    expect(ctx).toMatchObject({ scope: 'server-action', action: 'updateWidget' });
  });

  it('re-throws Next.js control-flow signals (redirect / notFound / dynamic bailout)', async () => {
    for (const digest of ['NEXT_REDIRECT;replace;/x;', 'NEXT_NOT_FOUND', 'DYNAMIC_SERVER_USAGE']) {
      const signal = Object.assign(new Error('control flow'), { digest });
      const wrapped = withAction('x', async () => {
        throw signal;
      });
      await expect(wrapped()).rejects.toBe(signal);
    }
    expect(captureException).not.toHaveBeenCalled();
  });

  it('maps a guard error (PASSWORD_CHANGE_REQUIRED / ELEVATION_REQUIRED) to its code, no noise log', async () => {
    const pw = Object.assign(new Error('rotate first'), { code: 'PASSWORD_CHANGE_REQUIRED' });
    const elev = Object.assign(new Error('elevate first'), { code: 'ELEVATION_REQUIRED' });
    expect(await withAction('a', async () => { throw pw; })()).toEqual({ ok: false, error: 'PASSWORD_CHANGE_REQUIRED' });
    expect(await withAction('b', async () => { throw elev; })()).toEqual({ ok: false, error: 'ELEVATION_REQUIRED' });
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('redactContext', () => {
  it('scrubs secret-shaped keys, recursively, and leaves the rest', () => {
    const out = redactContext({
      action: 'x',
      userId: 'u1',
      password: 'hunter2',
      apiToken: 'a2r_live_xxx',
      nested: { secretKey: 'k', ok: 1 },
      list: ['a', 'b'],
    });
    expect(out).toEqual({
      action: 'x',
      userId: 'u1',
      password: '[redacted]',
      apiToken: '[redacted]',
      nested: { secretKey: '[redacted]', ok: 1 },
      list: ['a', 'b'],
    });
  });
});

describe('isNextControlFlow', () => {
  it('true only for the framework digests', () => {
    expect(isNextControlFlow({ digest: 'NEXT_NOT_FOUND' })).toBe(true);
    expect(isNextControlFlow({ digest: 'NEXT_REDIRECT;replace;/y' })).toBe(true);
    expect(isNextControlFlow({ digest: 'DYNAMIC_SERVER_USAGE' })).toBe(true);
    expect(isNextControlFlow(new Error('real'))).toBe(false);
    expect(isNextControlFlow({ digest: 'P2025' })).toBe(false);
    expect(isNextControlFlow(null)).toBe(false);
  });
});

describe('withRouteHandler', () => {
  it('returns the handler response verbatim, including a 4xx it chose', async () => {
    const wrapped = withRouteHandler('x', async () =>
      new Response(JSON.stringify({ error: 'nope' }), { status: 404 }),
    );
    const res = await wrapped(new Request('http://t/'), undefined);
    expect(res.status).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('turns an unhandled throw into a 500 + one structured capture', async () => {
    const boom = new Error('db pool exhausted');
    const wrapped = withRouteHandler('reports/x', async () => {
      throw boom;
    });
    const res = await wrapped(new Request('http://t/'), undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error.' });
    expect(captureException).toHaveBeenCalledWith(boom, { scope: 'api', route: 'reports/x' });
  });

  it('re-throws a Next control-flow signal', async () => {
    const signal = Object.assign(new Error('cf'), { digest: 'NEXT_REDIRECT;replace;/z' });
    const wrapped = withRouteHandler('x', async () => {
      throw signal;
    });
    await expect(wrapped(new Request('http://t/'), undefined)).rejects.toBe(signal);
  });
});
