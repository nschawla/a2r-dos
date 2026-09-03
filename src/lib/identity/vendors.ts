/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * IdP vendor presets + email-domain helpers. ZERO dependencies (no
 * node:crypto, no Prisma) so this is safe to import from client components
 * (the Admin federation panel) as well as the server. The SAML/OIDC
 * metadata *parsing* lives in ./metadata.ts (server-only — it hashes).
 */

export type IdpVendorKey = 'AZURE_AD' | 'OKTA' | 'GOOGLE_WORKSPACE' | 'GENERIC';

export interface VendorPreset {
  vendor: IdpVendorKey;
  label: string;
  protocols: ('SAML' | 'OIDC')[];
  /** `{placeholder}` tokens the admin fills in. */
  discoveryTemplate: string | null;
  groupClaimHint: string;
  docsUrl: string;
}

export const VENDOR_PRESETS: Record<IdpVendorKey, VendorPreset> = {
  AZURE_AD: {
    vendor: 'AZURE_AD',
    label: 'Microsoft Entra ID (Azure AD)',
    protocols: ['OIDC', 'SAML'],
    discoveryTemplate: 'https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration',
    groupClaimHint: 'Emit the `groups` claim (or an App Role) — Entra sends group object IDs by default.',
    docsUrl: 'https://learn.microsoft.com/entra/identity-platform/v2-protocols-oidc',
  },
  OKTA: {
    vendor: 'OKTA',
    label: 'Okta',
    protocols: ['OIDC', 'SAML'],
    discoveryTemplate: 'https://{oktaDomain}/.well-known/openid-configuration',
    groupClaimHint: 'Add a `groups` claim to the ID token (Filter: matches regex `.*`).',
    docsUrl: 'https://developer.okta.com/docs/concepts/oauth-openid/',
  },
  GOOGLE_WORKSPACE: {
    vendor: 'GOOGLE_WORKSPACE',
    label: 'Google Workspace',
    protocols: ['OIDC', 'SAML'],
    discoveryTemplate: 'https://accounts.google.com/.well-known/openid-configuration',
    groupClaimHint:
      'Google OIDC does not emit groups — map by the `hd` (hosted domain) claim or use SAML with a Group attribute.',
    docsUrl: 'https://developers.google.com/identity/openid-connect/openid-connect',
  },
  GENERIC: {
    vendor: 'GENERIC',
    label: 'Generic SAML 2.0 / OIDC',
    protocols: ['SAML', 'OIDC'],
    discoveryTemplate: null,
    groupClaimHint: 'Configure your IdP to release a multi-valued group / role attribute.',
    docsUrl: 'https://openid.net/specs/openid-connect-discovery-1_0.html',
  },
};

// ───────────────────────────────────────────────────────── email domains

export function normalizeEmailDomain(input: string): string {
  return (input ?? '')
    .toLowerCase()
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export function parseEmailDomainList(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of (input ?? '').split(/[\s,;]+/)) {
    const d = normalizeEmailDomain(raw);
    if (d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) seen.add(d);
  }
  return [...seen];
}

export function emailDomainOf(email: string): string {
  const at = (email ?? '').lastIndexOf('@');
  return at === -1 ? '' : normalizeEmailDomain(email.slice(at + 1));
}

export function emailMatchesDomains(email: string, domains: readonly string[]): boolean {
  const d = emailDomainOf(email);
  return d.length > 0 && domains.map((x) => x.toLowerCase()).includes(d);
}
