/**
 * API Key Service — pure crypto primitives.
 *
 * Zero dependencies beyond node:crypto (no Prisma), so it unit-tests
 * trivially. The DB-backed issue/validate/revoke logic lives in
 * src/lib/ops/api-keys.ts and builds on these.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Plaintext keys are `a2r_live_<base64url secret>`. */
export const API_KEY_PREFIX = 'a2r_live_';
const SECRET_BYTES = 32;
/** How much of the plaintext is stored/displayed for identification. */
export const DISPLAY_PREFIX_LEN = API_KEY_PREFIX.length + 6;

/** SHA-256 of the (trimmed) plaintext — this is what gets persisted. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update((plaintext ?? '').trim(), 'utf8').digest('hex');
}

/** Cheap shape check to avoid a DB round-trip on obviously-bad tokens. */
export function looksLikeApiKey(token: string): boolean {
  return new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{20,}$`).test((token ?? '').trim());
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Mints a fresh plaintext key + its safe display prefix. */
export function generateApiKeyPlaintext(): { plaintext: string; keyPrefix: string; hashedKey: string } {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
  return { plaintext, keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LEN), hashedKey: hashApiKey(plaintext) };
}
