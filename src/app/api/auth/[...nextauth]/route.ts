import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hit, tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
import { captureMessage } from '@/lib/observability';

const handler = NextAuth(authOptions);

type RouteContext = { params: { nextauth: string[] } };

// SEC-1 (GA-readiness audit) — brute-force / credential-stuffing guard on
// the credentials sign-in. 10 attempts per minute per client IP. Only the
// credentials-callback POST is limited; CSRF/session/providers GETs and
// any future OAuth callbacks pass straight through.
const LOGIN_RULE = { limit: 10, windowMs: 60_000 };

export function GET(request: Request, ctx: RouteContext) {
  return handler(request, ctx);
}

export function POST(request: Request, ctx: RouteContext) {
  const isCredentialsCallback = ctx.params.nextauth?.join('/') === 'callback/credentials';
  if (isCredentialsCallback) {
    const ip = clientIpFrom(request);
    const result = hit(`auth:login:${ip}`, LOGIN_RULE);
    if (!result.ok) {
      captureMessage('Login rate limit exceeded', {
        scope: 'auth/login',
        ip,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      return tooManyRequestsResponse(
        result,
        'Too many sign-in attempts. Please wait a minute and try again.'
      );
    }
  }
  return handler(request, ctx);
}
