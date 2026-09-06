/**
 * P0 #3 — pure session-token revocation predicate.
 *
 * Its own (dependency-free) module so the NextAuth config
 * (src/lib/auth.ts) can import it without a cycle back through
 * ./password-rotation.ts, which imports `authOptions`.
 */

/**
 * A token whose `iat` predates the account's last password change belongs
 * to a session that must be killed (e.g. a temporary-password session on
 * another device, still live after the user set their own password).
 *
 * Compared on whole seconds so the one fresh token minted alongside the
 * change (issued in the same second) survives. A token with no `iat` (the
 * very first jwt-callback pass right after a login, before `encode` stamps
 * one) and an account that has never changed its password are both "not
 * revoked".
 */
export function tokenIsRevokedByPasswordChange(
  tokenIat: unknown,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt || typeof tokenIat !== 'number') return false;
  return tokenIat < Math.floor(passwordChangedAt.getTime() / 1000);
}
