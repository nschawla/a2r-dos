/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { resolveIsA2rStaff } from '@/lib/ops/staff';

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
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
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
          const user = await db.user.findUnique({
            where: { email: credentials.email.toLowerCase().trim() },
          });
          if (!user || !user.passwordHash) return null;

          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.name ?? undefined, image: user.image ?? undefined };
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
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      // Refresh membership list + platform-staff flag on every request that
      // has a userId — cheap indexed queries, and keeps role/org/staff
      // changes visible without forcing a re-login.
      //
      // Wrapped in try/catch so a transient DB error (or a Prisma client that
      // is momentarily out of sync with the schema, e.g. right after a
      // `db push` before the dev server restarts) degrades gracefully: we
      // keep whatever the token already carried and let the next request
      // refresh it, rather than throwing out of the callback — an uncaught
      // throw here makes the NextAuth route return an empty-body 500, which
      // surfaces client-side as "Unexpected end of JSON input".
      if (token.userId) {
        try {
          const [account, memberships] = await Promise.all([
            db.user.findUnique({
              where: { id: token.userId as string },
              select: { email: true, isA2rStaff: true },
            }),
            db.membership.findMany({
              where: { userId: token.userId as string },
              include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
              orderBy: { createdAt: 'asc' },
            }),
          ]);
          token.isA2rStaff = resolveIsA2rStaff({ email: account?.email, isA2rStaff: account?.isA2rStaff });
          token.memberships = memberships.map((m) => ({
            organizationId: m.organizationId,
            organizationName: m.organization.name,
            organizationSlug: m.organization.slug,
            organizationStatus: m.organization.status,
            role: m.role,
            deliveryRole: m.deliveryRole,
          }));
        } catch (err) {
          console.error('[auth] jwt callback refresh failed; serving stale token', err);
          token.isA2rStaff ??= false;
          token.memberships ??= [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.isA2rStaff = token.isA2rStaff === true;
        session.memberships = (token.memberships as typeof session.memberships) ?? [];
      }
      return session;
    },
  },
};
