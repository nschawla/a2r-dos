/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Symmetric encryption for identity-federation secrets at rest (the OIDC
 * client secret). AES-256-GCM with a key derived from NEXTAUTH_SECRET, so
 * no new key-management surface is introduced. Zero deps beyond
 * node:crypto — unit-tests trivially.
 *
 * Ciphertext format: `v1.<iv b64url>.<tag b64url>.<ct b64url>`.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function keyMaterial(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Dev / test fallback so a missing env doesn't hard-crash config
    // rendering; a real deployment always has NEXTAUTH_SECRET.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXTAUTH_SECRET is required to encrypt identity-federation secrets');
    }
    return scryptSync('a2r-sso-dev-fallback', 'a2r-sso-salt-v1', 32);
  }
  return scryptSync(secret, 'a2r-sso-salt-v1', 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keyMaterial(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const parts = (payload ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted secret');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, keyMaterial(), Buffer.from(ivB64!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64url')), decipher.final()]).toString('utf8');
}

/** A short, stable, non-reversible identifier for a secret — safe to show
 * in the Admin panel so an operator can confirm which secret is stored
 * without ever revealing it. */
export function secretFingerprint(plaintext: string): string {
  return createHash('sha256').update((plaintext ?? '').trim(), 'utf8').digest('hex').slice(0, 12);
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}
