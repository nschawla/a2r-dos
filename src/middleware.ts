import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { resolveDeliveryRole } from '@/lib/auth/rbac';
import { personaForDeliveryRole, isRouteBlockedForPersona } from '@/lib/governance/rbacMatrix';
import { parseSiteMode, resolveRootRoute } from '@/lib/config/site-mode.mjs';

// Must match src/lib/session.ts#ACTIVE_ORG_COOKIE exactly. Duplicated as a
// literal (not imported) because session.ts pulls in the Prisma client,
// which the Edge middleware runtime can't bundle.
const ACTIVE_ORG_COOKIE = 'a2r_active_org';

// P1 — cache posture. Everything this middleware handles is either an
// authenticated route, /change-password, or an API path — none may be
// stored by a browser or a shared proxy. The one exception is the
// anonymous marketing `/`, handled separately below.
const NO_STORE = 'no-store, must-revalidate';
const MARKETING_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', NO_STORE);
  return res;
}

// Gate everything except the public auth routes, the WP8 public legal pages
// (Terms / Privacy — readable by a prospective customer), the NextAuth API,
// the Bearer-token Data Ingestion API Bridge (/api/v1/* — API key, not a
// cookie), the unauthenticated health probes (/api/health/*), and the
// token-authed internal automation endpoints (/api/internal/*).
//
// The site root `/` IS matched (P1) — the routing decision for it now lives
// here (server-only `A2R_SITE_MODE`), never in the browser bundle. The
// `authorized` callback lets an anonymous visitor reach `/` so
// next-auth/middleware doesn't bounce them to /login before this fn runs.
//
// The wrapped fn also adds first-pass checks — defence in depth, not the
// authoritative gate:
//   /ops/*     — only staff tokens (src/lib/ops-auth.ts is authoritative).
//   every tenant route — the RBAC Master Matrix persona allow-list.
//   P0 #3 — forced-password-rotation / revoked-token turn-aways.
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    const isApi = pathname.startsWith('/api/');
    const isServerAction = req.method === 'POST' && req.headers.has('next-action');

    // ── P0 #3 / P1 — restricted-session turn-aways (take precedence) ─────
    // The jwt callback re-derives the session state from the database every
    // request (src/lib/auth/session-state.ts). REVOKED = a version bump /
    // password change on any device, a deleted account, or the DB check
    // failing closed.
    const sessionState = (token as { state?: string } | null)?.state;
    if ((token as { revoked?: boolean } | null)?.revoked || sessionState === 'REVOKED') {
      if (isServerAction) return noStore(NextResponse.next());
      return isApi
        ? noStore(NextResponse.json({ error: 'SESSION_REVOKED' }, { status: 401 }))
        : noStore(NextResponse.redirect(new URL('/login', req.url)));
    }

    if (token?.mustChangePassword === true && pathname !== '/change-password') {
      if (isServerAction) return noStore(NextResponse.next());
      return isApi
        ? noStore(NextResponse.json({ error: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403 }))
        : noStore(NextResponse.redirect(new URL('/change-password', req.url)));
    }

    // ── P1 — site root routing (server-only A2R_SITE_MODE) ──────────────
    if (pathname === '/') {
      const { mode } = parseSiteMode(process.env.A2R_SITE_MODE);
      const route = resolveRootRoute(mode, !!token);
      if (route.kind === 'redirect') {
        return noStore(NextResponse.redirect(new URL(route.to, req.url)));
      }
      // marketing — serve the public page, and let it be cached.
      const res = NextResponse.next();
      res.headers.set('Cache-Control', MARKETING_CACHE);
      return res;
    }

    // ── /ops — staff first-pass + the org-scope hint header ─────────────
    if (pathname.startsWith('/ops')) {
      if (token?.isA2rStaff !== true) {
        return noStore(NextResponse.redirect(new URL('/portfolio', req.url)));
      }
      const headers = new Headers(req.headers);
      headers.set('x-a2r-scope', 'ops');
      return noStore(NextResponse.next({ request: { headers } }));
    }

    // ── tenant routes — RBAC Master Matrix persona allow-list ───────────
    const memberships = token?.memberships ?? [];
    if (memberships.length > 0) {
      const requestedOrgId = req.cookies.get(ACTIVE_ORG_COOKIE)?.value;
      const active = memberships.find((m) => m.organizationId === requestedOrgId) ?? memberships[0];
      if (active) {
        const persona = personaForDeliveryRole(resolveDeliveryRole(active));
        if (isRouteBlockedForPersona(persona, pathname)) {
          return noStore(NextResponse.redirect(new URL('/portfolio', req.url)));
        }
      }
    }

    return noStore(NextResponse.next());
  },
  {
    pages: { signIn: '/login' },
    callbacks: {
      // The site root is reachable by anyone — the wrapped fn decides what
      // to do with it. Every other matched route still requires a token.
      authorized: ({ token, req }) => req.nextUrl.pathname === '/' || !!token,
    },
  },
);

export const config = {
  matcher: [
    '/((?!api/auth|api/v1|api/health|api/internal|login|register|onboarding|terms|privacy|_next/static|_next/image|favicon.ico).*)',
  ],
};
