/**
 * P0 #3 — mint a fresh NextAuth session cookie server-side.
 *
 * After `changePasswordAction` revokes every existing token (by bumping
 * `users.passwordChangedAt`), the current device would also be logged out.
 * This issues one new session token for it so the user stays signed in with
 * a clean, fully-authenticated session — no manual re-login.
 *
 * NextAuth v4 JWT strategy: `encode` from `next-auth/jwt` produces exactly
 * the encrypted JWE the `[...nextauth]` route's `decode` expects (same
 * secret, empty salt, `setIssuedAt()` → a fresh `iat` that is >= the
 * `passwordChangedAt` second, so the jwt callback keeps it). The token
 * carries only `userId` (+ identity claims for the default session fields);
 * the jwt callback re-hydrates memberships / staff / mustChangePassword on
 * the next request.
 */
import { cookies } from 'next/headers';
import { encode } from 'next-auth/jwt';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // NextAuth's default

interface FreshSessionClaims {
  userId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * Returns true when a fresh cookie was set, false when it could not be
 * (no `NEXTAUTH_SECRET` — dev without a configured secret); the caller then
 * falls back to a client sign-out + re-login.
 */
export async function establishFreshSession(claims: FreshSessionClaims): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false;

  const token = await encode({
    token: {
      userId: claims.userId,
      sub: claims.userId,
      ...(claims.email ? { email: claims.email } : {}),
      ...(claims.name ? { name: claims.name } : {}),
    },
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  const jar = cookies();
  const useSecure = (process.env.NEXTAUTH_URL ?? '').startsWith('https://');
  // Reuse the exact name of the cookie already on the request when present
  // (covers the __Secure-/__Host- prefixes and any host-specific naming),
  // otherwise derive it the way NextAuth does.
  const existing = jar.getAll().find((c) => c.name.endsWith('next-auth.session-token'));
  const cookieName = existing?.name ?? (useSecure ? '__Secure-next-auth.session-token' : 'next-auth.session-token');

  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: useSecure,
    maxAge: SESSION_MAX_AGE,
  });
  return true;
}
