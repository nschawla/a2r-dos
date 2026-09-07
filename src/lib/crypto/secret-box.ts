/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * General-purpose symmetric encryption for small secrets that must be
 * recoverable at rest (i.e. cannot be hashed): today the operator TOTP
 * secret (`src/lib/ops/operator-mfa.ts`). AES-256-GCM with a key derived
 * from `NEXTAUTH_SECRET`, so no new key-management surface. Zero deps
 * beyond `node:crypto`.
 *
 * Mirrors `src/lib/identity/crypto.ts` (which does the same for the SSO
 * client secret) but with an independent key-derivation salt so the two
 * domains never share ciphertext semantics.
 *
 * Ciphertext format: `v1.<iv b64url>.<tag b64url>.<ct b64url>`.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const SALT = 'a2r-secret-box-salt-v1';

function keyMaterial(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXTAUTH_SECRET is required to encrypt operator secrets at rest');
    }
    // Dev / test fallback so a missing env doesn't hard-crash local runs.
    return scryptSync('a2r-secret-box-dev-fallback', SALT, 32);
  }
  return scryptSync(secret, SALT, 32);
}

/** Encrypt `plaintext` → the versioned, self-describing ciphertext string. */
export function seal(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keyMaterial(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/** Decrypt a string produced by {@link seal}. Throws on tamper / wrong key. */
export function open(payload: string): string {
  const parts = (payload ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed sealed secret');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, keyMaterial(), Buffer.from(ivB64!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64url')), decipher.final()]).toString('utf8');
}

/** True when `value` looks like a {@link seal} output (not a raw secret). */
export function isSealed(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}
