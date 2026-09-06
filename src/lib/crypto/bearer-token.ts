/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P0-5 — bearer-token crypto primitives for the short-lived opaque tokens
 * carried in httpOnly cookies (JIT staff elevation `a2r_ops_elevation`,
 * the Impersonation Gateway `a2r_impersonation`).
 *
 * The database stores ONLY `sha256(secret)` — a row read, a leaked backup,
 * or a `SELECT` through a mis-scoped query never yields a usable token.
 * The plaintext exists only in the Set-Cookie response and the browser's
 * cookie jar. Lookup is by hash; any in-code comparison is constant-time.
 *
 * Zero deps beyond `node:crypto` (no Prisma) so it unit-tests trivially.
 * Mirrors `src/lib/ops/api-key-crypto.ts`, which already does this for the
 * long-lived `ApiKey.hashedKey`.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Entropy of a minted secret, in bytes (256 bits, base64url ≈ 43 chars). */
const SECRET_BYTES = 32;

/** SHA-256 (hex) of the trimmed plaintext — the value persisted as `tokenHash`. */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update((plaintext ?? '').trim(), 'utf8').digest('hex');
}

/**
 * Mint a fresh bearer token: a high-entropy URL-safe secret for the cookie,
 * plus its hash for the DB row.
 */
export function mintToken(): { token: string; tokenHash: string } {
  const token = randomBytes(SECRET_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** Constant-time comparison of two hex digests. */
export function tokenHashesEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
