import { describe, it, expect } from 'vitest';
import { classifySamlThrown, classifyKnownRefusal } from '@/lib/identity/saml-errors';

/**
 * Unit coverage for src/lib/identity/saml-errors.ts's classifier against
 * every distinct message @node-saml/node-saml actually throws (verified
 * against node_modules/@node-saml/node-saml/lib/saml.js) — the live
 * handshake test (tests/identity-saml-handshake.test.ts) exercises four of
 * these end to end via real cryptography; this file covers the rest,
 * including every deliberate refusal this app's own ACS handler makes.
 */
describe('classifySamlThrown', () => {
  const cases: [string, string][] = [
    ['Invalid document signature', 'INVALID_SIGNATURE'],
    ['Invalid signature', 'INVALID_SIGNATURE'],
    ['Invalid signature: multiple assertions', 'INVALID_SIGNATURE'],
    ['Invalid signature from encrypted assertion', 'INVALID_SIGNATURE'],
    ['Cannot obtain assertion from signed data', 'INVALID_SIGNATURE'],
    ['SAML assertion not yet valid', 'EXPIRED_ASSERTION'],
    ['SAML assertion expired: clocks skewed too much', 'EXPIRED_ASSERTION'],
    ['SAML assertion expired: assertion too old', 'EXPIRED_ASSERTION'],
    ['InResponseTo is not valid', 'REPLAY_DETECTED'],
    ['InResponseTo is missing from response', 'REPLAY_DETECTED'],
    ['InResponseTo does not match subjectInResponseTo', 'REPLAY_DETECTED'],
    ['SubjectInResponseTo is not valid', 'REPLAY_DETECTED'],
    ['Unknown SAML issuer. Expected: https://idp.example Received: https://evil.example', 'ISSUER_MISMATCH'],
    ['Missing SAML issuer', 'ISSUER_MISMATCH'],
    ['SAML assertion has no AudienceRestriction', 'ISSUER_MISMATCH'],
    ['SAML assertion AudienceRestriction has no Audience value', 'ISSUER_MISMATCH'],
    ['SAML assertion audience mismatch. Expected: sp-entity Received: other-entity', 'ISSUER_MISMATCH'],
    ['Missing SAML assertion', 'MALFORMED_RESPONSE'],
    ['Unknown SAML response message', 'MALFORMED_RESPONSE'],
    ['Invalid EncryptedAssertion content', 'MALFORMED_RESPONSE'],
    ['Too many signatures found for this element', 'MALFORMED_RESPONSE'],
    // Starts with "Invalid signature" — correctly bucketed with the other
    // signature-validation failures (RULES is checked in order, and this
    // genuinely IS a signature-processing rejection), not MALFORMED_RESPONSE.
    ['Invalid signature, too many transforms', 'INVALID_SIGNATURE'],
  ];

  for (const [message, expectedCategory] of cases) {
    it(`"${message}" → ${expectedCategory}`, () => {
      const result = classifySamlThrown(new Error(message));
      expect(result.category).toBe(expectedCategory);
      expect(result.humanMessage.length).toBeGreaterThan(20);
      expect(result.humanMessage).not.toMatch(/\bat\s+\S+:\d+:\d+/); // never a stack trace
      expect(result.rawDetail).toBe(message);
    });
  }

  it('an unrecognized message classifies as UNKNOWN, never throws', () => {
    const result = classifySamlThrown(new Error('some future node-saml wording nobody has seen yet'));
    expect(result.category).toBe('UNKNOWN');
    expect(result.rawDetail).toMatch(/future node-saml/);
  });

  it('a non-Error thrown value is stringified, never throws', () => {
    const result = classifySamlThrown('a raw string throw');
    expect(result.category).toBe('UNKNOWN');
    expect(result.rawDetail).toBe('a raw string throw');
  });
});

describe('classifyKnownRefusal', () => {
  const reasons = ['no-relay-state', 'no-idp', 'idp-disabled', 'not-saml', 'no-tenant-access', 'no-name-id', 'issuer-mismatch'] as const;

  for (const reason of reasons) {
    it(`"${reason}" produces a human-readable, non-empty message`, () => {
      const result = classifyKnownRefusal(reason);
      expect(result.humanMessage.length).toBeGreaterThan(20);
      expect(result.category).toBeTruthy();
    });
  }

  it('carries the detail through as rawDetail when provided', () => {
    const result = classifyKnownRefusal('no-idp', 'organizationId=org_test123');
    expect(result.rawDetail).toBe('organizationId=org_test123');
  });
});
