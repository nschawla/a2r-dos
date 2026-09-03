/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Security-group → role resolution for federated logins. Pure — the DB
 * mappings are loaded by the caller and passed in.
 *
 * A federated assertion carries zero or more group / role claim values.
 * Each is matched case-insensitively against the tenant's SsoGroupMapping
 * rows; the lowest `priority` wins (ties broken by first-configured). No
 * match → the IdP's configured default role.
 */
import type { DeliveryAccessRole, MembershipRole } from '@prisma/client';

export interface GroupMappingRule {
  claimValue: string;
  deliveryRole: DeliveryAccessRole;
  membershipRole: MembershipRole;
  practiceId: string | null;
  priority: number;
}

export interface RoleDefaults {
  deliveryRole: DeliveryAccessRole;
  membershipRole: MembershipRole;
}

export interface ResolvedFederatedRole {
  deliveryRole: DeliveryAccessRole;
  membershipRole: MembershipRole;
  practiceId: string | null;
  /** Which mapping claim matched, or null when the default was used. */
  matchedClaim: string | null;
}

const norm = (s: string): string => (s ?? '').trim().toLowerCase();

export function resolveFederatedRole(
  groups: readonly string[],
  mappings: readonly GroupMappingRule[],
  defaults: RoleDefaults
): ResolvedFederatedRole {
  const claimed = new Set(groups.map(norm).filter(Boolean));

  const matched = mappings
    .filter((m) => claimed.has(norm(m.claimValue)))
    .sort((a, b) => a.priority - b.priority)[0];

  if (matched) {
    return {
      deliveryRole: matched.deliveryRole,
      membershipRole: matched.membershipRole,
      practiceId: matched.practiceId,
      matchedClaim: matched.claimValue,
    };
  }

  return {
    deliveryRole: defaults.deliveryRole,
    membershipRole: defaults.membershipRole,
    practiceId: null,
    matchedClaim: null,
  };
}

/**
 * Pull the group / role claim values out of a federated profile. Accepts
 * the common shapes: OIDC `groups` / `roles` (array or space/comma
 * string), Azure `wids`, or a SAML attribute array.
 */
export function extractGroupClaims(profile: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ['groups', 'roles', 'wids', 'memberOf', 'Group']) {
    const v = profile[key];
    if (Array.isArray(v)) {
      for (const item of v) if (typeof item === 'string' && item.trim()) out.push(item.trim());
    } else if (typeof v === 'string' && v.trim()) {
      for (const item of v.split(/[\s,;]+/)) if (item.trim()) out.push(item.trim());
    }
  }
  // de-dupe, preserve order
  return [...new Set(out)];
}
