/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Server-only identity-federation reads. `getIdentityProvider` returns a
 * SECRET-FREE view (only the OIDC client-secret fingerprint) for the Admin
 * panel; `isSsoEnforcedForEmail` is the enforcement check the NextAuth
 * signIn callback runs on every password login.
 */
import { cache } from 'react';
import { db } from '@/lib/db';
import { isEncryptedSecret, secretFingerprint } from './crypto';
import { validateOidcDiscovery } from './metadata';
import type { DeliveryAccessRole, IdpProtocol, IdpVendor, MembershipRole } from '@prisma/client';

export interface GroupMappingView {
  id: string;
  claimValue: string;
  deliveryRole: DeliveryAccessRole;
  membershipRole: MembershipRole;
  practiceId: string | null;
  priority: number;
}

export interface IdentityProviderView {
  id: string;
  protocol: IdpProtocol;
  vendor: IdpVendor;
  displayName: string;
  enabled: boolean;
  enforced: boolean;
  emailDomains: string[];
  jitEnabled: boolean;
  defaultDeliveryRole: DeliveryAccessRole;
  defaultMembershipRole: MembershipRole;

  samlEntityId: string | null;
  samlSsoUrl: string | null;
  samlCertificate: string | null;

  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcDiscoveryUrl: string | null;
  oidcAuthEndpoint: string | null;
  oidcTokenEndpoint: string | null;
  oidcJwksUri: string | null;
  /** Present when a client secret is stored — never the secret itself. */
  oidcClientSecretHint: string | null;

  lastVerifiedAt: string | null;
  metadataFingerprint: string | null;
  groupMappings: GroupMappingView[];
}

export const getIdentityProvider = cache(
  async (organizationId: string): Promise<IdentityProviderView | null> => {
    const idp = await db.identityProvider.findUnique({
      where: { organizationId },
      include: { groupMappings: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!idp) return null;

    return {
      id: idp.id,
      protocol: idp.protocol,
      vendor: idp.vendor,
      displayName: idp.displayName,
      enabled: idp.enabled,
      enforced: idp.enforced,
      emailDomains: idp.emailDomains,
      jitEnabled: idp.jitEnabled,
      defaultDeliveryRole: idp.defaultDeliveryRole,
      defaultMembershipRole: idp.defaultMembershipRole,
      samlEntityId: idp.samlEntityId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCertificate: idp.samlCertificate,
      oidcIssuer: idp.oidcIssuer,
      oidcClientId: idp.oidcClientId,
      oidcDiscoveryUrl: idp.oidcDiscoveryUrl,
      oidcAuthEndpoint: idp.oidcAuthEndpoint,
      oidcTokenEndpoint: idp.oidcTokenEndpoint,
      oidcJwksUri: idp.oidcJwksUri,
      oidcClientSecretHint:
        idp.oidcClientSecretCiphertext && isEncryptedSecret(idp.oidcClientSecretCiphertext)
          ? 'stored'
          : null,
      lastVerifiedAt: idp.lastVerifiedAt?.toISOString() ?? null,
      metadataFingerprint: idp.metadataFingerprint,
      groupMappings: idp.groupMappings.map((m) => ({
        id: m.id,
        claimValue: m.claimValue,
        deliveryRole: m.deliveryRole,
        membershipRole: m.membershipRole,
        practiceId: m.practiceId,
        priority: m.priority,
      })),
    };
  }
);

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
