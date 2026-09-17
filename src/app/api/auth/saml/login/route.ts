/**
 * Enterprise SAML SSO — SP-initiated login, v1.19.0.
 *
 *   GET /api/auth/saml/login?email=<email>
 *
 * Public, unauthenticated — this is the link the login page sends a user
 * down when their email's domain has SAML federation configured. Resolves
 * the owning tenant's IdP, builds a signed AuthnRequest, and 302s the
 * browser to the IdP's SSO URL.
 *
 * Always redirects (never returns JSON) — a real top-level browser
 * navigation, matching how the login page invokes it
 * (`window.location.href = ...`, not `fetch`). A failure redirects back to
 * `/login?ssoError=...` rather than exposing details about which domains
 * are/aren't federated to an unauthenticated caller.
 *
 * Excluded from src/middleware.ts's session check (the `api/auth` prefix
 * is already excluded — NextAuth's own routes live there).
 */
import { NextResponse } from 'next/server';
import { rateLimitGuard, tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { initiateSamlLogin } from '@/server/services/saml-sso';

export const dynamic = 'force-dynamic';

function loginErrorRedirect(request: Request, code: string): NextResponse {
  const url = new URL('/login', request.url);
  url.searchParams.set('ssoError', code);
  return NextResponse.redirect(url, { status: 303 });
}

export const GET = withRouteHandler('auth/saml/login', async (request) => {
  const ip = clientIpFrom(request);
  const g = await rateLimitGuard(`saml:login:${ip}`, RATE_LIMITS.SSO_LOGIN);
  if (!g.allowed) return tooManyRequestsResponse(g.result, 'Too many sign-in attempts. Please wait a minute and try again.');

  const email = (new URL(request.url).searchParams.get('email') ?? '').trim();
  if (!email || !email.includes('@')) {
    return loginErrorRedirect(request, 'invalid-email');
  }

  const host = request.headers.get('host') ?? undefined;
  const result = await initiateSamlLogin(email, host);
  if (!result.ok) {
    return loginErrorRedirect(request, 'not-configured');
  }

  const res = NextResponse.redirect(result.redirectUrl, { status: 303 });
  for (const [k, v] of Object.entries(g.headers)) res.headers.set(k, v);
  return res;
});
