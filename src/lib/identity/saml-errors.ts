/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Human-readable classification for SAML ACS failures — same job as
 * src/lib/integrations/errors.ts does for the adapter framework: turn a
 * library exception into a plain-language message an Ops Console operator
 * (or a tenant admin reading the "why did my login fail" note) can act on,
 * never a raw stack trace.
 *
 * The match patterns below are `@node-saml/node-saml`'s actual thrown
 * `Error.message` strings (node_modules/@node-saml/node-saml/lib/saml.js) —
 * substring-matched, case-insensitive, so a patch-version wording tweak
 * degrades to UNKNOWN rather than throwing a classifier bug.
 */
import type { SsoErrorCategory } from '@prisma/client';

export interface ClassifiedSsoError {
  category: SsoErrorCategory;
  humanMessage: string;
  /** The matched substring / original message — safe to store (never a
   * stack trace, never a secret; node-saml's messages are static English
   * strings with at most an entity-id or a timestamp interpolated). */
  rawDetail: string;
}

interface Rule {
  category: SsoErrorCategory;
  patterns: RegExp[];
  message: string;
}

const RULES: Rule[] = [
  {
    category: 'INVALID_SIGNATURE',
    patterns: [/invalid signature/i, /invalid document signature/i, /cannot obtain assertion from signed data/i],
    message:
      'The SAML response’s digital signature could not be validated against the certificate on file. This usually means the IdP rotated its signing certificate — re-verify the IdP metadata in the Ops Console and update the stored certificate.',
  },
  {
    category: 'EXPIRED_ASSERTION',
    patterns: [/assertion not yet valid/i, /assertion expired/i, /clocks skewed/i, /assertion too old/i],
    message:
      'The SAML assertion’s validity window (NotBefore / NotOnOrAfter) had already passed by the time it reached PS-DOS. Usually a clock-sync issue between the IdP and this server, or the sign-in simply took too long to complete — ask the user to try again.',
  },
  {
    category: 'REPLAY_DETECTED',
    patterns: [
      /inresponseto is not valid/i,
      /inresponseto is missing/i,
      /inresponseto does not match/i,
      /subjectinresponseto is not valid/i,
    ],
    message:
      'The response’s InResponseTo did not match an outstanding sign-in request from this tenant. Either the same SAML response was submitted twice (a replay, correctly blocked), the request expired before the IdP replied (the window is 10 minutes), or the sign-in was started from a different PS-DOS instance than the one handling the callback.',
  },
  {
    category: 'ISSUER_MISMATCH',
    patterns: [
      /unknown saml issuer/i,
      /missing saml issuer/i,
      /audiencerestriction/i,
      /audience mismatch/i,
      /audience value/i,
    ],
    message:
      'The response was signed by, or addressed to, an identity provider other than the one configured for this tenant. Confirm the tenant’s stored Entity ID / SSO URL match what the corporate IdP actually issues — this can also mean a group mapping or SSO test was pointed at the wrong tenant.',
  },
  {
    category: 'MALFORMED_RESPONSE',
    patterns: [
      /missing saml assertion/i,
      /unknown saml response message/i,
      /invalid encryptedassertion content/i,
      /too many signatures/i,
      /too many transforms/i,
    ],
    message:
      'The SAML response could not be parsed as a well-formed assertion. This points at an IdP-side misconfiguration (wrong binding, an unexpected response shape) rather than anything on the PS-DOS side — compare against the IdP’s published metadata.',
  },
];

/** Classify a thrown error from `SAML#validatePostResponseAsync`. */
export function classifySamlThrown(err: unknown): ClassifiedSsoError {
  const message = err instanceof Error ? err.message : String(err);
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(message))) {
      return { category: rule.category, humanMessage: rule.message, rawDetail: message };
    }
  }
  return {
    category: 'UNKNOWN',
    humanMessage:
      'The federated sign-in failed for an unrecognized reason. The original library message is attached below for troubleshooting.',
    rawDetail: message,
  };
}

/** Not a library exception — one of the deliberate, expected refusals this
 * app's own ACS handler makes before/after calling node-saml. */
export function classifyKnownRefusal(
  reason: 'no-relay-state' | 'no-idp' | 'idp-disabled' | 'not-saml' | 'no-tenant-access' | 'no-name-id' | 'issuer-mismatch',
  detail?: string
): ClassifiedSsoError {
  switch (reason) {
    case 'no-relay-state':
      return {
        category: 'MALFORMED_RESPONSE',
        humanMessage:
          'The identity provider’s POST to the ACS endpoint arrived without a RelayState, so PS-DOS could not tell which tenant this sign-in belongs to. Confirm the IdP is configured to echo RelayState back unchanged.',
        rawDetail: detail ?? 'missing RelayState',
      };
    case 'issuer-mismatch':
      return {
        category: 'ISSUER_MISMATCH',
        humanMessage:
          'The verified assertion’s Issuer did not match this tenant’s configured Entity ID. Confirm the tenant’s stored Entity ID matches what the corporate IdP actually issues — this is checked explicitly here because node-saml’s own issuer check does not run for the sign-in path.',
        rawDetail: detail ?? 'assertion Issuer did not match IdentityProvider.samlEntityId',
      };
    case 'no-name-id':
      return {
        category: 'MALFORMED_RESPONSE',
        humanMessage:
          'The SAML response validated but carried no NameID — PS-DOS uses NameID as the user’s email address. Confirm the IdP is configured to send the user’s email as the NameID (format urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress).',
        rawDetail: detail ?? 'validated response carried no NameID',
      };
    case 'no-idp':
      return {
        category: 'NO_IDP_CONFIGURED',
        humanMessage:
          'This tenant has no SAML identity provider configured yet. Configure one from the Ops Console (Identity Federation) before enabling federated sign-in links for its users.',
        rawDetail: detail ?? 'no IdentityProvider row',
      };
    case 'idp-disabled':
      return {
        category: 'IDP_DISABLED',
        humanMessage:
          'This tenant’s identity provider is configured but not enabled. Enable federation from the Ops Console once the metadata has been verified.',
        rawDetail: detail ?? 'IdentityProvider.enabled = false',
      };
    case 'not-saml':
      return {
        category: 'NO_IDP_CONFIGURED',
        humanMessage:
          'This tenant’s identity provider is configured for OIDC, not SAML, but a SAML assertion arrived at the SAML ACS endpoint. Check which protocol the tenant’s SSO login link points at.',
        rawDetail: detail ?? 'IdentityProvider.protocol = OIDC',
      };
    case 'no-tenant-access':
      return {
        category: 'MAPPING_DENIED',
        humanMessage:
          'The identity was verified, but the user has no membership in this workspace and just-in-time provisioning is disabled for it. Either enable JIT provisioning or add the user manually.',
        rawDetail: detail ?? 'no membership, JIT disabled',
      };
  }
}
