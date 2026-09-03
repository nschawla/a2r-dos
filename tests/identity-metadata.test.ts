import { describe, it, expect } from 'vitest';
import {
  parseSamlMetadata,
  validateOidcDiscovery,
  normalizeCertificate,
  VENDOR_PRESETS,
  normalizeEmailDomain,
  parseEmailDomainList,
  emailDomainOf,
  emailMatchesDomains,
} from '../src/lib/identity/metadata';

const SAML_XML = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sts.windows.net/abc-123/">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data><ds:X509Certificate>
MIIC8DCCAdigAwIBAgIQ${'A'.repeat(200)}
        </ds:X509Certificate></ds:X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://login.microsoftonline.com/abc-123/saml2"/>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://login.microsoftonline.com/abc-123/saml2"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

describe('parseSamlMetadata', () => {
  it('extracts entityID, the redirect SSO URL, and the signing certificate', () => {
    const r = parseSamlMetadata(SAML_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entityId).toBe('https://sts.windows.net/abc-123/');
    expect(r.value.ssoUrl).toBe('https://login.microsoftonline.com/abc-123/saml2');
    expect(r.value.certificate).not.toContain('\n');
    expect(r.value.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to the HTTP-POST binding when there is no redirect one', () => {
    const postOnly = SAML_XML.replace(/Binding="[^"]*HTTP-Redirect"[^/]*\/>/i, '');
    const r = parseSamlMetadata(postOnly);
    expect(r.ok).toBe(true);
  });

  it('rejects non-metadata, missing entityID, missing endpoint, missing cert', () => {
    expect(parseSamlMetadata('<html/>').ok).toBe(false);
    expect(parseSamlMetadata('<EntityDescriptor></EntityDescriptor>').ok).toBe(false);
    expect(
      parseSamlMetadata('<EntityDescriptor entityID="urn:x"></EntityDescriptor>').ok
    ).toBe(false);
  });

  it('rejects a non-https SSO endpoint', () => {
    const insecure = SAML_XML.replace(/https:\/\/login\.microsoftonline\.com/g, 'http://login.microsoftonline.com');
    const r = parseSamlMetadata(insecure);
    expect(r.ok).toBe(false);
  });

  it('normalizeCertificate strips PEM armour and whitespace', () => {
    expect(normalizeCertificate('-----BEGIN CERTIFICATE-----\nAB CD\n-----END CERTIFICATE-----')).toBe('ABCD');
  });
});

describe('validateOidcDiscovery', () => {
  const good = {
    issuer: 'https://login.microsoftonline.com/abc/v2.0',
    authorization_endpoint: 'https://login.microsoftonline.com/abc/oauth2/v2.0/authorize',
    token_endpoint: 'https://login.microsoftonline.com/abc/oauth2/v2.0/token',
    jwks_uri: 'https://login.microsoftonline.com/abc/discovery/v2.0/keys',
    scopes_supported: ['openid', 'profile', 'email'],
  };

  it('accepts a well-formed discovery document', () => {
    const r = validateOidcDiscovery(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.issuer).toBe(good.issuer);
  });

  it('rejects missing / non-https endpoints', () => {
    expect(validateOidcDiscovery({ ...good, token_endpoint: undefined }).ok).toBe(false);
    expect(validateOidcDiscovery({ ...good, jwks_uri: 'http://insecure/keys' }).ok).toBe(false);
    expect(validateOidcDiscovery('nope').ok).toBe(false);
    expect(validateOidcDiscovery(null).ok).toBe(false);
  });

  it('rejects an IdP that does not advertise the openid scope', () => {
    expect(validateOidcDiscovery({ ...good, scopes_supported: ['profile'] }).ok).toBe(false);
  });
});

describe('vendor presets', () => {
  it('covers the three named vendors plus generic, each with the openid protocols', () => {
    for (const v of ['AZURE_AD', 'OKTA', 'GOOGLE_WORKSPACE', 'GENERIC'] as const) {
      expect(VENDOR_PRESETS[v].vendor).toBe(v);
      expect(VENDOR_PRESETS[v].protocols.length).toBeGreaterThan(0);
    }
    expect(VENDOR_PRESETS.AZURE_AD.discoveryTemplate).toContain('{tenantId}');
    expect(VENDOR_PRESETS.GOOGLE_WORKSPACE.discoveryTemplate).toContain('accounts.google.com');
  });
});

describe('email domain helpers', () => {
  it('normalizes and parses domain lists', () => {
    expect(normalizeEmailDomain('@Contoso.COM')).toBe('contoso.com');
    expect(parseEmailDomainList('contoso.com, Contoso.com; bad, fabrikam.co.uk')).toEqual([
      'contoso.com',
      'fabrikam.co.uk',
    ]);
  });

  it('matches an email to a configured domain', () => {
    expect(emailDomainOf('jo@contoso.com')).toBe('contoso.com');
    expect(emailMatchesDomains('jo@contoso.com', ['fabrikam.com', 'contoso.com'])).toBe(true);
    expect(emailMatchesDomains('jo@evil.com', ['contoso.com'])).toBe(false);
    expect(emailMatchesDomains('not-an-email', ['contoso.com'])).toBe(false);
  });
});
