/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

import type { AuthOptions, Session } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { runUnscoped } from '@/lib/db/org-scope';
import { hasActiveStaffGrant } from '@/lib/ops/staff-grants';
import { isSsoEnforcedForEmail } from '@/lib/identity/service';
import {
  deriveSessionState,
  assertTransition,
  InvalidSessionTransitionError,
  type SessionState,
} from '@/lib/auth/session-state';
import { withTimeout } from '@/lib/util/with-timeout';
import type { SessionMembership } from '@/types/next-auth';

/** Fail-closed ceiling for the per-request DB-backed session-state check.
 * A function (not a const) so a test can override the env var. */
function sessionLookupTimeoutMs(): number {
  const v = Number(process.env.SESSION_LOOKUP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 2500;
}

/**
 * NextAuth configuration for the A2R Delivery OS SaaS foundation.
 *
 * Session strategy is JWT (required for the Credentials provider — NextAuth
 * does not support database sessions with Credentials). The Prisma adapter
 * is still wired up so `users`/`accounts` tables are ready the moment an
 * OAuth provider (Google/Microsoft SSO, likely for a PS org) is added —
 * at that point adapter-backed account linking works with no schema change.
 *
 * Multi-tenancy: a user's org memberships are loaded into the JWT/session so
 * server components and actions can resolve "which organization is this
 * request for" without an extra round trip. See src/lib/session.ts.
 */
const useSecureCookies = (process.env.NEXTAUTH_URL ?? '').startsWith('https://');

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  // Pin the hardened cookie flags explicitly rather than relying on
  // NextAuth's derived defaults (so a future NextAuth change can't loosen
  // them). The session token stays `sameSite: 'lax'` deliberately — Strict
  // would drop the cookie on a top-level navigation into the app from an
  // external link (email / Slack) and show the login page until a reload;
  // Lax still blocks the cross-site POST that CSRF needs. The app's OWN
  // cookies (a2r_active_org / a2r_lens / a2r_ops_elevation /
  // a2r_impersonation) ARE `sameSite: 'strict'` — see those actions.
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? '__Host-' : ''}next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.callback-url`,
      options: { sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          // Pre-session: no tenant is resolved yet, so the org-scope Prisma
          // extension has nothing to pin to. User is an UNSCOPED model, but
          // wrap defensively so any future scoped read here can't throw.
          return await runUnscoped('nextauth-authorize', async () => {
            const user = await db.user.findUnique({
              where: { email: credentials.email.toLowerCase().trim() },
            });
            if (!user || !user.passwordHash) return null;

            const valid = await bcrypt.compare(credentials.password, user.passwordHash);
            if (!valid) return null;

            return { id: user.id, email: user.email, name: user.name ?? undefined, image: user.image ?? undefined };
          });
        } catch (err) {
          // Never let a DB/bcrypt error escape as an uncaught throw — NextAuth
          // would turn it into an empty-body 500. Fail closed (null = invalid
          // credentials) and log for diagnosis.
          console.error('[auth] authorize() failed', err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    /**
     * Enterprise Identity — when a tenant has SSO *enforced* for an email
     * domain, password login for that domain is refused here (defence in
     * depth alongside the login form). Federated logins arrive through the
     * dedicated SSO callback route, not this provider, so they're
     * unaffected. Fails open only on a DB error (logged in the service).
     */
    async signIn({ user, account }) {
      if (account?.provider === 'credentials' && user?.email) {
        // Pre-session cross-tenant lookup (IdentityProvider by email domain).
        const ssoEnforced = await runUnscoped('nextauth-sso-enforcement', async () => {
          return await isSsoEnforcedForEmail(user.email!);
        });
        if (ssoEnforced) {
          // Denied — surfaces to the client as `error: "AccessDenied"`,
          // which the login form renders as the "use SSO" message.
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      if (!token.userId) return token;

      // ── P1 — DB-backed session-state check, EVERY request ─────────────
      // Not "trust the JWT's exp claim": the authoritative state comes from
      // the database (users.sessionVersion / .passwordChangedAt /
      // .mustChangePassword). Bounded so a hung DB fails the session
      // closed. Any failure — error, timeout, missing user, version
      // mismatch — resolves to REVOKED. There is no fail-open path.
      let account:
        | { mustChangePassword: boolean; passwordChangedAt: Date | null; sessionVersion: number }
        | null = null;
      let mappedMemberships: SessionMembership[] = [];
      let isStaff = false;
      let lookupFailed = false;

      try {
        const [acct, mems, staff] = await withTimeout(
          runUnscoped('nextauth-jwt', async () =>
            Promise.all([
              db.user.findUnique({
                where: { id: token.userId as string },
                select: { mustChangePassword: true, passwordChangedAt: true, sessionVersion: true },
              }),
              db.membership.findMany({
                where: { userId: token.userId as string },
                include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
                orderBy: { createdAt: 'asc' },
              }),
              hasActiveStaffGrant(token.userId as string),
            ]),
          ),
          sessionLookupTimeoutMs(),
          'session-state lookup',
        );
        account = acct;
        isStaff = staff;
        mappedMemberships = mems.map((m) => ({
          organizationId: m.organizationId,
          organizationName: m.organization.name,
          organizationSlug: m.organization.slug,
          organizationStatus: m.organization.status,
          role: m.role,
          deliveryRole: m.deliveryRole,
        }));
      } catch (err) {
        // FAIL CLOSED — never serve a stale token when the check can't run.
        console.error('[auth] session-state lookup failed → revoking session', err);
        lookupFailed = true;
      }

      const priorState: SessionState = (token.state as SessionState | undefined) ?? 'ACTIVE';
      let nextState = deriveSessionState({
        token: {
          userId: token.userId as string,
          sessionVersion: token.sessionVersion as number | undefined,
          issuedAtSec: token.iat as number | undefined,
          revoked: token.revoked,
        },
        account: account
          ? {
              exists: true,
              sessionVersion: account.sessionVersion,
              mustChangePassword: account.mustChangePassword,
              passwordChangedAt: account.passwordChangedAt,
            }
          : { exists: false },
        lookupFailed,
      });

      // The transition table is the last guard — a corrupted/tampered
      // `state` claim producing an impossible move also fails closed.
      try {
        assertTransition(priorState, nextState);
      } catch (err) {
        if (err instanceof InvalidSessionTransitionError) nextState = 'REVOKED';
        else throw err;
      }

      if (nextState === 'REVOKED') {
        return { revoked: true, state: 'REVOKED' };
      }

      // Pin the token to the account's epoch — ONCE (fresh login, or the
      // first refresh of a legacy pre-P1 token). Never re-pinned afterward,
      // or a stale token would heal itself past a version bump.
      if (token.sessionVersion === undefined && account) {
        token.sessionVersion = account.sessionVersion;
      }
      token.state = nextState;
      token.isA2rStaff = isStaff;
      token.mustChangePassword = nextState === 'PENDING_PASSWORD_CHANGE';
      token.memberships = mappedMemberships;
      return token;
    },
    async session({ session, token }) {
      // A token the jwt callback resolved to REVOKED (version bump / password
      // change on another device / DB check failed closed / malformed) yields
      // a session with NO user, so every server guard treats the request as
      // signed-out.
      if (
        (token as { revoked?: boolean }).revoked ||
        (token as { state?: string }).state === 'REVOKED' ||
        !token.userId
      ) {
        return { ...session, user: undefined as unknown as Session['user'] };
      }
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.isA2rStaff = token.isA2rStaff === true;
        session.user.mustChangePassword = token.mustChangePassword === true;
        session.memberships = (token.memberships as typeof session.memberships) ?? [];
        session.sessionVersion = token.sessionVersion as number | undefined;
      }
      return session;
    },
  },
};
