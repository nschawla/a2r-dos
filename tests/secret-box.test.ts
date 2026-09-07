import { describe, it, expect } from 'vitest';
import { seal, open, isSealed } from '@/lib/crypto/secret-box';

/** AES-256-GCM secret-box — round-trip, tamper detection, format guard. */
describe('secret-box', () => {
  it('round-trips a secret', () => {
    const plain = 'JBSWY3DPEHPK3PXP';
    const sealed = seal(plain);
    expect(sealed).not.toContain(plain);
    expect(isSealed(sealed)).toBe(true);
    expect(open(sealed)).toBe(plain);
  });

  it('produces a fresh IV each call (distinct ciphertexts for the same input)', () => {
    expect(seal('same')).not.toBe(seal('same'));
  });

  it('rejects a tampered ciphertext', () => {
    const sealed = seal('do-not-touch');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('evil-payload').toString('base64url');
    expect(() => open(parts.join('.'))).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => open('not-a-sealed-value')).toThrow(/Malformed/);
    expect(isSealed('nope')).toBe(false);
    expect(isSealed(null)).toBe(false);
  });
});
