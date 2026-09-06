import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimitGuard, tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';
import { captureMessage } from '@/lib/observability';

const handler = NextAuth(authOptions);

// Next 15 — dynamic route params are async.
type RouteContext = { params: Promise<{ nextauth: string[] }> };

// SEC-1 / P2 — brute-force / credential-stuffing guard on the credentials
// sign-in (RATE_LIMITS.LOGIN, per client IP). Only the credentials-callback
// POST is limited; CSRF/session/providers GETs and any future OAuth
// callbacks pass straight through. The `X-RateLimit-*` headers are echoed
// on the allowed pass-through too.

export function GET(request: Request, ctx: RouteContext) {
  return handler(request, ctx);
}

export async function POST(request: Request, ctx: RouteContext) {
  const { nextauth } = await ctx.params;
  const isCredentialsCallback = nextauth?.join('/') === 'callback/credentials';
  if (!isCredentialsCallback) return handler(request, ctx);

  const ip = clientIpFrom(request);
  const g = rateLimitGuard(`auth:login:${ip}`, RATE_LIMITS.LOGIN);
  if (!g.allowed) {
    captureMessage('Login rate limit exceeded', {
      scope: 'auth/login',
      ip,
      retryAfterSeconds: g.result.retryAfterSeconds,
    });
    return tooManyRequestsResponse(
      g.result,
      'Too many sign-in attempts. Please wait a minute and try again.'
    );
  }

  const res = await handler(request, ctx);
  try {
    for (const [k, v] of Object.entries(g.headers)) res.headers.set(k, v);
  } catch {
    /* some NextAuth responses have immutable headers — the limit still applied */
  }
  return res;
}
