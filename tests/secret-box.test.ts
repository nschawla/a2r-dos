import { describe, it, expect, afterEach, vi } from 'vitest';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import {
  seal,
  open,
  isSealed,
  activeKeyVersion,
  sealedKeyVersion,
  needsReseal,
} from '@/lib/crypto/secret-box';

/** Reproduce a pre-v1.15.1 `v1.iv.tag.ct` ciphertext — key derived from
 * `NEXTAUTH_SECRET` (or the dev fallback when it is unset), exactly as the
 * old secret-box did. */
function legacySeal(plain: string): string {
  const material = process.env.NEXTAUTH_SECRET?.trim() || 'a2r-secret-box-dev-fallback';
  const key = scryptSync(material, 'a2r-secret-box-salt-v1', 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

/**
 * AES-256-GCM secret-box — dedicated versioned key (MFA_ENCRYPTION_KEY),
 * round-trip, tamper detection, and rotation support.
 */
describe('secret-box', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a secret and stamps the active key version', () => {
    const plain = 'JBSWY3DPEHPK3PXP';
    const sealed = seal(plain);
    expect(sealed).not.toContain(plain);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed.split('.')[0]).toBe('v2');
    expect(sealedKeyVersion(sealed)).toBe(activeKeyVersion());
    expect(open(sealed)).toBe(plain);
    expect(needsReseal(sealed)).toBe(false);
  });

  it('produces a fresh IV each call', () => {
    expect(seal('same')).not.toBe(seal('same'));
  });

  it('rejects a tampered ciphertext (GCM auth) and a truncated tag', () => {
    const sealed = seal('do-not-touch');
    const p = sealed.split('.'); // v2 . version . iv . tag . ct
    const ctBad = [...p];
    ctBad[4] = Buffer.from('totally-different-ciphertext-bytes').toString('base64url');
    expect(() => open(ctBad.join('.'))).toThrow();

    const tagBad = [...p];
    tagBad[3] = Buffer.from('short').toString('base64url');
    expect(() => open(tagBad.join('.'))).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => open('not-a-sealed-value')).toThrow(/Malformed/);
    expect(() => open('v2.1.only.four')).toThrow(/Malformed/);
    expect(isSealed('nope')).toBe(false);
    expect(isSealed(null)).toBe(false);
  });

  it('a dedicated MFA_ENCRYPTION_KEY is used, keyed by MFA_ENCRYPTION_KEY_VERSION', () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', 'a-dedicated-mfa-key-with-enough-entropy-000');
    vi.stubEnv('MFA_ENCRYPTION_KEY_VERSION', '2');
    const sealed = seal('totp-secret');
    expect(sealedKeyVersion(sealed)).toBe(2);
    expect(open(sealed)).toBe('totp-secret');
  });

  it('supports rotation — a ciphertext on an old key version still decrypts, and flags for re-seal', () => {
    // seal under key v1
    vi.stubEnv('MFA_ENCRYPTION_KEY', 'operator-mfa-key-generation-one-xxxxxxxxxx');
    vi.stubEnv('MFA_ENCRYPTION_KEY_VERSION', '1');
    const oldCipher = seal('rotate-me');
    expect(sealedKeyVersion(oldCipher)).toBe(1);

    // rotate: v1 becomes historical, v2 is active
    vi.stubEnv('MFA_ENCRYPTION_KEY_V1', 'operator-mfa-key-generation-one-xxxxxxxxxx');
    vi.stubEnv('MFA_ENCRYPTION_KEY', 'operator-mfa-key-generation-two-yyyyyyyyyy');
    vi.stubEnv('MFA_ENCRYPTION_KEY_VERSION', '2');

    expect(open(oldCipher)).toBe('rotate-me'); // still decrypts via MFA_ENCRYPTION_KEY_V1
    expect(needsReseal(oldCipher)).toBe(true); // should be re-sealed under v2

    const reSealed = seal('rotate-me');
    expect(sealedKeyVersion(reSealed)).toBe(2);
    expect(needsReseal(reSealed)).toBe(false);
  });

  it('decrypts a legacy v1 ciphertext (pre key-separation, NEXTAUTH_SECRET-derived)', () => {
    // No MFA_ENCRYPTION_KEY / NEXTAUTH_SECRET stubbed → both schemes use
    // their dev fallbacks, as on a fresh local checkout.
    const legacy = legacySeal('pre-v1.15.1-totp-secret');
    expect(isSealed(legacy)).toBe(true);
    expect(sealedKeyVersion(legacy)).toBe('legacy');
    expect(needsReseal(legacy)).toBe(true);
    expect(open(legacy)).toBe('pre-v1.15.1-totp-secret');
  });
});
