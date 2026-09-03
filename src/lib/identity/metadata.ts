/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * IdP metadata parsing & verification — pure, dependency-light (no XML
 * library; the SAML metadata shapes we accept are regular enough to pull
 * apart with anchored patterns, and we validate what we extract).
 *
 *   parseSamlMetadata(xml)       — IdP EntityDescriptor XML → entityId,
 *                                  SSO redirect URL, signing certificate.
 *   validateOidcDiscovery(doc)   — a fetched .well-known/openid-configuration
 *                                  JSON → the endpoints we need.
 *   VENDOR_PRESETS               — Azure AD / Okta / Google Workspace setup
 *                                  hints and discovery-URL templates.
 *
 * The network fetch of a discovery document / metadata URL lives in the
 * server service (src/lib/identity/service.ts); everything here is offline.
 *
 * Server-only — it hashes (node:crypto). Vendor presets + email-domain
 * helpers that the client panel also needs live in ./vendors.ts and are
 * re-exported here for convenience.
 */
import { createHash } from 'node:crypto';

export {
  VENDOR_PRESETS,
  type VendorPreset,
  type IdpVendorKey,
  normalizeEmailDomain,
  parseEmailDomainList,
  emailDomainOf,
  emailMatchesDomains,
} from './vendors';

// ───────────────────────────────────────────────────────── SAML metadata

export interface SamlMetadata {
  entityId: string;
  ssoUrl: string;
  certificate: string;
  /** sha256 of the normalised signing cert — stable across whitespace. */
  fingerprint: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function firstMatch(xml: string, re: RegExp): string | null {
  const m = re.exec(xml);
  return m && m[1] ? m[1].trim() : null;
}

/** Strip PEM armour / whitespace from an X509 cert body. */
export function normalizeCertificate(raw: string): string {
  return (raw ?? '')
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function certificateFingerprint(raw: string): string {
  return createHash('sha256').update(normalizeCertificate(raw), 'utf8').digest('hex');
}

/**
 * Parse an IdP SAML 2.0 EntityDescriptor. Prefers the HTTP-Redirect
 * SingleSignOnService binding (what a browser SP-initiated flow uses);
 * falls back to HTTP-POST if that's all the IdP publishes.
 */
export function parseSamlMetadata(xml: string): ParseResult<SamlMetadata> {
  const text = (xml ?? '').trim();
  if (!text || !/EntityDescriptor/i.test(text)) {
    return { ok: false, error: 'Not a SAML EntityDescriptor document' };
  }

  const entityId = firstMatch(text, /EntityDescriptor[^>]*\bentityID="([^"]+)"/i);
  if (!entityId) return { ok: false, error: 'No entityID found in the metadata' };

  const redirect = firstMatch(
    text,
    /<[^>]*SingleSignOnService[^>]*Binding="[^"]*HTTP-Redirect"[^>]*Location="([^"]+)"/i
  );
  const post = firstMatch(
    text,
    /<[^>]*SingleSignOnService[^>]*Binding="[^"]*HTTP-POST"[^>]*Location="([^"]+)"/i
  );
  const ssoUrl = redirect ?? post;
  if (!ssoUrl) return { ok: false, error: 'No SingleSignOnService endpoint found' };
  if (!/^https:\/\//i.test(ssoUrl)) return { ok: false, error: 'The SSO endpoint must be an https URL' };

  const certRaw =
    firstMatch(text, /<(?:ds:)?X509Certificate>([\s\S]*?)<\/(?:ds:)?X509Certificate>/i) ?? '';
  const certificate = normalizeCertificate(certRaw);
  if (certificate.length < 100) {
    return { ok: false, error: 'No usable X509 signing certificate found' };
  }

  return {
    ok: true,
    value: {
      entityId,
      ssoUrl,
      certificate,
      fingerprint: certificateFingerprint(certificate),
    },
  };
}

// ───────────────────────────────────────────────────────── OIDC discovery

export interface OidcDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  /** sha256 of the issuer — a change means the IdP tenant was re-pointed. */
  fingerprint: string;
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https:\/\/[^\s]+$/i.test(v);
}

/** Validate a parsed `.well-known/openid-configuration` object. */
export function validateOidcDiscovery(doc: unknown): ParseResult<OidcDiscovery> {
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'Discovery document is not a JSON object' };
  const d = doc as Record<string, unknown>;

  if (!isHttpsUrl(d.issuer)) return { ok: false, error: 'Missing or non-https `issuer`' };
  if (!isHttpsUrl(d.authorization_endpoint)) return { ok: false, error: 'Missing `authorization_endpoint`' };
  if (!isHttpsUrl(d.token_endpoint)) return { ok: false, error: 'Missing `token_endpoint`' };
  if (!isHttpsUrl(d.jwks_uri)) return { ok: false, error: 'Missing `jwks_uri`' };

  const scopes = Array.isArray(d.scopes_supported) ? (d.scopes_supported as unknown[]) : [];
  if (scopes.length > 0 && !scopes.includes('openid')) {
    return { ok: false, error: 'IdP does not advertise the `openid` scope' };
  }

  return {
    ok: true,
    value: {
      issuer: d.issuer,
      authorizationEndpoint: d.authorization_endpoint,
      tokenEndpoint: d.token_endpoint,
      jwksUri: d.jwks_uri,
      fingerprint: createHash('sha256').update(d.issuer, 'utf8').digest('hex'),
    },
  };
}

// Vendor presets + email-domain helpers are re-exported from ./vendors at
// the top of this file (that module is dependency-free / client-safe).
