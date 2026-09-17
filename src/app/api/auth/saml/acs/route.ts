/**
 * Enterprise SAML SSO — Assertion Consumer Service (ACS), v1.19.0.
 *
 *   POST /api/auth/saml/acs
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: SAMLResponse=<base64 XML>&RelayState=<organizationId>
 *
 * The IdP's HTTP-POST binding target — public, unauthenticated, a
 * cross-site POST from the IdP's own domain (no CSRF token: SAML's own
 * signature + InResponseTo checks are the protection here, not the app's
 * same-site session cookie). All of the actual validation, JIT handoff,
 * and error classification lives in src/server/services/saml-sso.ts; this
 * route is the thin request/response shell — parse the form body, call the
 * service, mint a session cookie on success, always end in a redirect.
 *
 * Excluded from src/middleware.ts's session check (the `api/auth` prefix
 * is already excluded).
 */
import { NextResponse } from 'next/server';
import { rateLimitGuard, tooManyRequestsResponse, clientIpFrom } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { handleSamlAcsPost } from '@/server/services/saml-sso';
import { establishFreshSession } from '@/lib/auth/session-mint';

export const dynamic = 'force-dynamic';

function loginErrorRedirect(request: Request, code: string): NextResponse {
  const url = new URL('/login', request.url);
  url.searchParams.set('ssoError', code);
  return NextResponse.redirect(url, { status: 303 });
}

/** SsoErrorCategory → the short code the login page's ?ssoError= reads. */
const CATEGORY_CODE: Record<string, string> = {
  INVALID_SIGNATURE: 'invalid-signature',
  EXPIRED_ASSERTION: 'expired',
  REPLAY_DETECTED: 'replay',
  ISSUER_MISMATCH: 'issuer-mismatch',
  NO_IDP_CONFIGURED: 'not-configured',
  IDP_DISABLED: 'disabled',
  MAPPING_DENIED: 'access-denied',
  MALFORMED_RESPONSE: 'malformed',
  UNKNOWN: 'failed',
};

export const POST = withRouteHandler('auth/saml/acs', async (request) => {
  const ip = clientIpFrom(request);
  const g = await rateLimitGuard(`saml:acs:${ip}`, RATE_LIMITS.SSO_ACS);
  if (!g.allowed) return tooManyRequestsResponse(g.result, 'Too many sign-in attempts. Please wait a minute and try again.');

  let samlResponse: string;
  let relayState: string;
  try {
    const form = await request.formData();
    samlResponse = String(form.get('SAMLResponse') ?? '');
    relayState = String(form.get('RelayState') ?? '');
  } catch {
    return loginErrorRedirect(request, 'malformed');
  }
  if (!samlResponse) return loginErrorRedirect(request, 'malformed');

  const result = await handleSamlAcsPost(samlResponse, relayState);
  if (!result.ok) {
    return loginErrorRedirect(request, CATEGORY_CODE[result.classified.category] ?? 'failed');
  }

  const established = await establishFreshSession({
    userId: result.userId,
    email: result.email,
    name: result.name,
    sessionVersion: result.sessionVersion,
  });
  if (!established) {
    // No NEXTAUTH_SECRET configured (dev-only gap) — the identity was
    // still verified and provisioned correctly; only the cookie mint
    // failed. Send the user to sign in with a password instead of
    // pretending SSO succeeded.
    return loginErrorRedirect(request, 'session');
  }

  const res = NextResponse.redirect(new URL('/launch', request.url), { status: 303 });
  for (const [k, v] of Object.entries(g.headers)) res.headers.set(k, v);
  return res;
});
