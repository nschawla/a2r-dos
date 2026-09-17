/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Server-only identity-federation lookups used OUTSIDE a React render
 * tree: NextAuth's `signIn` callback (`isSsoEnforcedForEmail`), the SAML
 * SP-initiated login route (`findSamlIdpForEmail`), the Ops Console's OIDC
 * discovery verification action (`fetchOidcDiscovery`).
 *
 * Deliberately separate from ./service.ts, whose `getIdentityProvider` is
 * wrapped in `React.cache()` — importing that wrapper from a non-React
 * runtime (a route handler invoked outside a render pass, a vitest test)
 * throws `TypeError: cache is not a function`. Nothing here touches
 * `React.cache`, so this module is safe to import from anywhere server-side.
 */
import { db } from '@/lib/db';
import { validateOidcDiscovery } from './metadata';

/**
 * True when the email's domain belongs to an IdP that has SSO ENFORCED —
 * password login for that user must be refused. Fails open only on a DB
 * error (logged), never silently.
 */
export async function isSsoEnforcedForEmail(email: string): Promise<boolean> {
  const at = (email ?? '').lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return false;
  try {
    const hit = await db.identityProvider.findFirst({
      where: { enabled: true, enforced: true, emailDomains: { has: domain } },
      select: { id: true },
    });
    return hit !== null;
  } catch (err) {
    console.error('[identity] isSsoEnforcedForEmail failed', err);
    return false;
  }
}

/**
 * Resolve the tenant + IdP a SAML SP-initiated login for this email should
 * redirect to. Unlike `isSsoEnforcedForEmail` (a yes/no gate), this is used
 * to actually BUILD the redirect — so it only matches an IdP that's usable
 * for a live handshake (SAML protocol, enabled, and has a stored SSO URL +
 * certificate from a completed metadata verification).
 */
export async function findSamlIdpForEmail(
  email: string
): Promise<{ organizationId: string; samlSsoUrl: string; samlCertificate: string; samlEntityId: string | null } | null> {
  const at = (email ?? '').lastIndexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return null;
  try {
    const idp = await db.identityProvider.findFirst({
      where: {
        protocol: 'SAML',
        enabled: true,
        emailDomains: { has: domain },
        samlSsoUrl: { not: null },
        samlCertificate: { not: null },
      },
      select: { organizationId: true, samlSsoUrl: true, samlCertificate: true, samlEntityId: true },
    });
    if (!idp || !idp.samlSsoUrl || !idp.samlCertificate) return null;
    return {
      organizationId: idp.organizationId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCertificate: idp.samlCertificate,
      samlEntityId: idp.samlEntityId,
    };
  } catch (err) {
    console.error('[identity] findSamlIdpForEmail failed', err);
    return null;
  }
}

/** Fetch + validate an OIDC discovery document. Network call — server only. */
export async function fetchOidcDiscovery(discoveryUrl: string) {
  let res: Response;
  try {
    res = await fetch(discoveryUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  } catch {
    return { ok: false as const, error: 'Could not reach the discovery URL' };
  }
  if (!res.ok) return { ok: false as const, error: `Discovery URL returned HTTP ${res.status}` };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false as const, error: 'Discovery URL did not return JSON' };
  }
  return validateOidcDiscovery(json);
}
