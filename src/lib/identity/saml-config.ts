/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Enterprise SAML SSO — live handshake, v1.19.0. Builds the `@node-saml/
 * node-saml` `SAML` instance for one tenant's configured IdP.
 *
 * One Service Provider identity is shared across every tenant (the
 * standard multi-tenant-SaaS pattern — a customer's IdP admin trusts
 * "PS-DOS", not a per-tenant SP): a single entity ID and one ACS URL. What
 * varies per tenant is which IdP that shared SP trusts, keyed off the
 * tenant's stored `samlSsoUrl` / `samlCertificate` / `samlEntityId`
 * (IdentityProvider, configured via the Ops Console — src/server/actions/
 * identity.ts).
 *
 * Server-only (node-saml pulls in node:crypto / xml-crypto).
 */
import { SAML, ValidateInResponseTo, type SamlConfig, type CacheProvider } from '@node-saml/node-saml';
import { makeSamlCacheProvider, SAML_REQUEST_TTL_MS } from './saml-cache-provider';

/** Base URL this deployment is reachable at. Same env var session-mint.ts
 * and the SSO-enforcement cookie logic already key off. */
function baseUrl(): string {
  const url = (process.env.NEXTAUTH_URL ?? '').trim();
  return url.length > 0 ? url.replace(/\/$/, '') : 'http://localhost:3000';
}

/** The one SP entity ID PS-DOS presents to every tenant's IdP. Overridable
 * via env for a deployment that needs a stable, non-URL entity ID (some
 * enterprise IdP admins prefer a URN); defaults to the SP metadata URL,
 * the common convention. */
export function spEntityId(): string {
  return (process.env.SAML_SP_ENTITY_ID ?? '').trim() || `${baseUrl()}/api/auth/saml/metadata`;
}

export function acsUrl(): string {
  return `${baseUrl()}/api/auth/saml/acs`;
}

export interface TenantIdpRecord {
  organizationId: string;
  samlEntityId: string | null;
  samlSsoUrl: string | null;
  samlCertificate: string | null;
}

/**
 * Build a node-saml `SAML` instance scoped to one tenant's IdP. Returns
 * `null` when the tenant hasn't finished SAML setup (missing SSO URL or
 * certificate) — callers turn that into a `NO_IDP_CONFIGURED` classified
 * error rather than letting node-saml throw an opaque one.
 */
export function buildSamlClient(idp: TenantIdpRecord): SAML | null {
  if (!idp.samlSsoUrl || !idp.samlCertificate) return null;

  const cacheProvider: CacheProvider = makeSamlCacheProvider(idp.organizationId);

  const config: SamlConfig = {
    callbackUrl: acsUrl(),
    entryPoint: idp.samlSsoUrl,
    issuer: spEntityId(),
    idpCert: idp.samlCertificate,
    // NOTE: node-saml's `idpIssuer` option only guards the SLO (logout)
    // flow (`verifyIssuer`, called from verifyLogoutRequest/Response) — it
    // is NOT consulted by `validatePostResponseAsync`'s login path, so it
    // does nothing for an ordinary sign-in. Set anyway (harmless, correct
    // for SLO); the actual cross-check for login — comparing the verified
    // assertion's Issuer against this tenant's stored samlEntityId — is
    // done explicitly in src/server/services/saml-sso.ts AFTER
    // validatePostResponseAsync returns, since node-saml won't do it.
    ...(idp.samlEntityId ? { idpIssuer: idp.samlEntityId } : {}),
    wantAssertionsSigned: true,
    // Some IdPs sign only the Response, some only the Assertion, some
    // both — node-saml's default (require the assertion signed) is the
    // safer floor; we don't additionally require the outer Response
    // signed so a conformant IdP that only signs the assertion still works.
    wantAuthnResponseSigned: false,
    identifierFormat: null,
    disableRequestedAuthnContext: true,
    // Replay protection — every InResponseTo is checked against, and
    // consumed from, the DB-backed cache below.
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: SAML_REQUEST_TTL_MS,
    cacheProvider,
  };

  return new SAML(config);
}

/**
 * A bare SAML instance for `generateServiceProviderMetadata` only — no
 * `entryPoint`, no `cacheProvider` use, nothing tenant-specific. node-saml's
 * constructor unconditionally requires a non-empty `idpCert` even though
 * metadata generation never reads it (`assertRequired` in its constructor);
 * this placeholder is inert — never used to validate a real signature.
 */
export function buildSpMetadataClient(): SAML {
  return new SAML({
    callbackUrl: acsUrl(),
    issuer: spEntityId(),
    idpCert: 'unused-for-sp-metadata-generation',
  });
}
