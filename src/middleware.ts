import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { resolveDeliveryRole } from '@/lib/auth/rbac';
import { personaForDeliveryRole, isRouteBlockedForPersona } from '@/lib/governance/rbacMatrix';

// Must match src/lib/session.ts#ACTIVE_ORG_COOKIE exactly. Duplicated as a
// literal (not imported) because session.ts pulls in the Prisma client,
// which the Edge middleware runtime can't bundle.
const ACTIVE_ORG_COOKIE = 'a2r_active_org';

// Gate everything except the public marketing landing page (`/` exactly —
// the `|$` in the matcher below), the public auth routes, the WP8 public
// legal pages (Terms of Service / Privacy Policy — readable by a
// prospective customer with no account), the NextAuth API, the
// Bearer-token Data Ingestion API
// Bridge (/api/v1/* — authenticated by API key, not a session cookie), the
// unauthenticated health/readiness probes (/api/health/* — for load
// balancers and uptime monitors), the token-authed internal automation
// endpoints (/api/internal/* — e.g. the data-retention sweep, called by a
// cron scheduler with a shared secret, not a cookie), and static assets.
// next-auth/middleware redirects unauthenticated requests to `pages.signIn`.
//
// The wrapped middleware fn adds two first-pass checks — defence in depth,
// not the authoritative gate:
//   /ops/*     — only A2R staff tokens get through
//               (src/lib/ops-auth.ts#requireOpsContext is authoritative).
//   every tenant route — the RBAC Master Matrix (src/lib/governance/
//               rbacMatrix.ts): the active org membership's DeliveryRole,
//               read straight from the JWT (no DB call — Edge-safe, so it
//               can lag a role change by up to one token refresh, same
//               trade-off already accepted for the /ops check), decides
//               whether this URL is even in that persona's allow-list.
//               requireOrgContext() + every scoped query/masked figure
//               remain the authoritative, DB-verified enforcement.
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // P0 #3 — how a restricted request is turned away depends on the caller:
    //   • a Route Handler / API path (`/api/*`) is programmatic → JSON status
    //   • a Server Action POST (carries the `Next-Action` header) → pass
    //     through, so the server-side guards
    //     (src/lib/auth/password-rotation.ts) reject it with
    //     PASSWORD_CHANGE_REQUIRED rather than a 307 the action client would
    //     just follow
    //   • a plain page navigation → 307 to the relevant screen
    const isApi = pathname.startsWith('/api/');
    const isServerAction = req.method === 'POST' && req.headers.has('next-action');

    // A token the jwt callback revoked (its `iat` predates the account's
    // last password change; another device's session after a rotation).
    if ((token as { revoked?: boolean } | null)?.revoked) {
      if (isServerAction) return NextResponse.next();
      return isApi
        ? NextResponse.json({ error: 'SESSION_REVOKED' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', req.url));
    }

    // Forced password change (temp password issued by someone else) takes
    // precedence over everything else. `mustChangePassword` rides on the JWT
    // and is refreshed from the DB every request by the jwt callback.
    if (token?.mustChangePassword === true && pathname !== '/change-password') {
      if (isServerAction) return NextResponse.next();
      return isApi
        ? NextResponse.json({ error: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403 })
        : NextResponse.redirect(new URL('/change-password', req.url));
    }

    if (pathname.startsWith('/ops')) {
      // First-pass only. `token.isA2rStaff` is refreshed from the
      // `staff_grants` table by the jwt callback every request;
      // src/lib/ops-auth.ts re-checks that table directly and is the
      // authoritative gate. There is no email-domain shortcut any more.
      if (token?.isA2rStaff !== true) {
        return NextResponse.redirect(new URL('/portfolio', req.url));
      }
      // Tell the org-scope layer this request is the (legitimately
      // cross-tenant) Ops Console. src/lib/session.ts's lazy scope resolver
      // reads this header — enterWith() set from inside the async
      // requireOpsContext() guard does not reliably propagate back to the
      // page / server-action body in the App Router.
      const headers = new Headers(req.headers);
      headers.set('x-a2r-scope', 'ops');
      return NextResponse.next({ request: { headers } });
    }

    const memberships = token?.memberships ?? [];
    if (memberships.length > 0) {
      const requestedOrgId = req.cookies.get(ACTIVE_ORG_COOKIE)?.value;
      const active = memberships.find((m) => m.organizationId === requestedOrgId) ?? memberships[0];
      if (active) {
        const persona = personaForDeliveryRole(resolveDeliveryRole(active));
        if (isRouteBlockedForPersona(persona, pathname)) {
          return NextResponse.redirect(new URL('/portfolio', req.url));
        }
      }
    }

    return NextResponse.next();
  },
  {
    pages: { signIn: '/login' },
  }
);

export const config = {
  matcher: [
    '/((?!api/auth|api/v1|api/health|api/internal|login|register|onboarding|terms|privacy|_next/static|_next/image|favicon.ico|$).*)',
  ],
};
