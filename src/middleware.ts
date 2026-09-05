import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { isA2rStaffEmail } from '@/lib/ops/staff';
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

    if (pathname.startsWith('/ops')) {
      const isStaff = token?.isA2rStaff === true || isA2rStaffEmail(token?.email);
      if (!isStaff) {
        return NextResponse.redirect(new URL('/portfolio', req.url));
      }
      return NextResponse.next();
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
