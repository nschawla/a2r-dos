/**
 * Unit tests for the API Key Service crypto primitives
 * (src/lib/ops/api-key-crypto.ts). Pure — no DB. The DB-backed
 * issue/validate/revoke logic is exercised by the manual smoke checks and
 * the e2e suite.
 */
import { describe, it, expect } from 'vitest';
import {
  API_KEY_PREFIX,
  hashApiKey,
  looksLikeApiKey,
  hashesEqual,
  generateApiKeyPlaintext,
} from '../src/lib/ops/api-key-crypto';

describe('generateApiKeyPlaintext', () => {
  it('mints a prefixed, high-entropy key with a matching hash + display prefix', () => {
    const a = generateApiKeyPlaintext();
    expect(a.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    // 32 random bytes → 43-char base64url secret, so plaintext is comfortably long
    expect(a.plaintext.length).toBeGreaterThan(API_KEY_PREFIX.length + 40);
    expect(a.keyPrefix).toBe(a.plaintext.slice(0, a.keyPrefix.length));
    expect(a.keyPrefix.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.hashedKey).toBe(hashApiKey(a.plaintext));
    expect(a.hashedKey).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('never repeats a key', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateApiKeyPlaintext().plaintext);
    expect(seen.size).toBe(200);
  });
});

describe('hashApiKey', () => {
  it('is deterministic and whitespace-insensitive', () => {
    const key = 'a2r_live_abc123DEF456ghi789JKL012';
    expect(hashApiKey(key)).toBe(hashApiKey(`  ${key}\n`));
  });
  it('differs for different inputs', () => {
    expect(hashApiKey('a2r_live_one')).not.toBe(hashApiKey('a2r_live_two'));
  });
});

describe('looksLikeApiKey', () => {
  it('accepts well-formed keys', () => {
    expect(looksLikeApiKey(generateApiKeyPlaintext().plaintext)).toBe(true);
    expect(looksLikeApiKey('  a2r_live_abcdefghijklmnopqrstuvwx  ')).toBe(true);
  });
  it('rejects malformed / foreign tokens', () => {
    expect(looksLikeApiKey('')).toBe(false);
    expect(looksLikeApiKey('Bearer a2r_live_abcdefghijklmnop')).toBe(false);
    expect(looksLikeApiKey('sk_live_1234567890abcdef')).toBe(false);
    expect(looksLikeApiKey('a2r_live_short')).toBe(false);
    expect(looksLikeApiKey('a2r_live_has spaces in it here')).toBe(false);
  });
});

describe('hashesEqual', () => {
  it('is true for identical digests and false otherwise', () => {
    const h = hashApiKey('a2r_live_sample');
    expect(hashesEqual(h, h)).toBe(true);
    expect(hashesEqual(h, hashApiKey('a2r_live_other'))).toBe(false);
    expect(hashesEqual(h, h.slice(0, 10))).toBe(false); // length mismatch
  });
});

describe('issue → hash → validate round trip (crypto only)', () => {
  it('a stored hash re-derives from the plaintext presented on a later request', () => {
    const issued = generateApiKeyPlaintext();
    // server stored `issued.hashedKey`; a later request presents `issued.plaintext`
    const presentedHash = hashApiKey(issued.plaintext);
    expect(hashesEqual(presentedHash, issued.hashedKey)).toBe(true);
    // a tampered plaintext must not match
    expect(hashesEqual(hashApiKey(issued.plaintext + 'x'), issued.hashedKey)).toBe(false);
  });
});
