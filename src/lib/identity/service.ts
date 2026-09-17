/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Server-only identity-federation read for the Ops Console federation
 * panel. `getIdentityProvider` returns a SECRET-FREE view (only the OIDC
 * client-secret fingerprint).
 *
 * `React.cache()`-wrapped for RSC request-level memoization — which is why
 * this file holds ONLY that one function. The plain lookups used outside a
 * React render tree (NextAuth's signIn callback, the SAML SP-initiated
 * route, vitest) live in ./lookup.ts instead: `cache()` throws when this
 * module is imported from a non-React runtime (v1.19.0 — discovered when a
 * DB-integration test transitively imported this file and hit
 * `TypeError: cache is not a function`), so nothing that needs to work
 * outside Next.js's request scope may share a module with it.
 */
import { cache } from 'react';
import { db } from '@/lib/db';
import { isEncryptedSecret } from './crypto';
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
