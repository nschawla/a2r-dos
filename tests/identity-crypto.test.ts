import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, secretFingerprint, isEncryptedSecret } from '../src/lib/identity/crypto';

// keyMaterial() reads NEXTAUTH_SECRET lazily; tests/setup.ts loads it from
// .env, this is a belt-and-braces default for a bare environment.
process.env.NEXTAUTH_SECRET ||= 'test-nextauth-secret-for-identity-crypto';

describe('identity secret crypto', () => {
  it('round-trips a client secret', () => {
    const secret = 'super-secret-oidc-client-value-123';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV) but decrypts the same', () => {
    const a = encryptSecret('x');
    const b = encryptSecret('x');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('x');
    expect(decryptSecret(b)).toBe('x');
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptSecret('tamper-me');
    const parts = enc.split('.');
    parts[3] = parts[3]!.slice(0, -1) + (parts[3]!.slice(-1) === 'A' ? 'B' : 'A');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-real-payload')).toThrow();
    expect(isEncryptedSecret('nope')).toBe(false);
    expect(isEncryptedSecret(null)).toBe(false);
  });

  it('fingerprint is stable, short, and not the secret', () => {
    const fp = secretFingerprint('  my-secret  ');
    expect(fp).toBe(secretFingerprint('my-secret'));
    expect(fp).toHaveLength(12);
    expect('my-secret').not.toContain(fp);
  });
});
