import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { isA2rStaffEmail } from '@/lib/ops/staff';

// Gate everything except the public auth routes, the WP8 public legal pages
// (Terms of Service / Privacy Policy — readable by a prospective customer
// with no account), the NextAuth API, the Bearer-token Data Ingestion API
// Bridge (/api/v1/* — authenticated by API key, not a session cookie), the
// unauthenticated health/readiness probes (/api/health/* — for load
// balancers and uptime monitors), the token-authed internal automation
// endpoints (/api/internal/* — e.g. the data-retention sweep, called by a
// cron scheduler with a shared secret, not a cookie), and static assets.
// next-auth/middleware redirects unauthenticated requests to `pages.signIn`.
//
// The wrapped middleware fn adds a first-pass check on /ops/* (the A2R
// Operator Control Plane): only A2R staff tokens get through. This is
// defence in depth — src/lib/ops-auth.ts#requireOpsContext is the
// authoritative gate in the (admin) layout and every ops Server Action.
export default withAuth(
  function middleware(req) {
    if (req.nextUrl.pathname.startsWith('/ops')) {
      const token = req.nextauth.token;
      const isStaff = token?.isA2rStaff === true || isA2rStaffEmail(token?.email);
      if (!isStaff) {
        return NextResponse.redirect(new URL('/', req.url));
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
    '/((?!api/auth|api/v1|api/health|api/internal|login|register|onboarding|terms|privacy|_next/static|_next/image|favicon.ico).*)',
  ],
};
