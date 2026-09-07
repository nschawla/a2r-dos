/**
 * A2R Operator Control Plane — organizational roles (v1.16.0).
 *
 * The `/ops` console access axis, layered on top of the binary
 * `staff_grants` entitlement: a live grant carries exactly one
 * `OperatorRole`. This module is the single source of truth for what each
 * role may reach.
 *
 * PURE + Edge-safe — no Prisma, no `next/*`, no node built-ins. Imported by
 * `src/middleware.ts` (Edge route guard), `src/lib/ops-auth.ts` (server
 * guard), and the Ops Console UI.
 */

export const OPERATOR_ROLES = [
  'SUPER_ADMIN',
  'PROVISIONING',
  'SUPPORT',
  'AUDITOR',
  'BILLING',
  'VIEWER',
] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const OPERATOR_ROLE_LABEL: Record<OperatorRole, string> = {
  SUPER_ADMIN: 'Super Admin / Owner',
  PROVISIONING: 'Provisioning Staff',
  SUPPORT: 'Support / Troubleshooting',
  AUDITOR: 'Auditor / Compliance',
  BILLING: 'Billing / Finance',
  VIEWER: 'Viewer / Guest',
};

export const OPERATOR_ROLE_DESCRIPTION: Record<OperatorRole, string> = {
  SUPER_ADMIN: 'Full access to every operator surface and action.',
  PROVISIONING: 'Tenant onboarding and creation; ingestion and SSO setup.',
  SUPPORT: 'Diagnostic inspection, platform health, and read-only tenant impersonation for troubleshooting.',
  AUDITOR: 'Read-only: the immutable audit ledger, elevation history, and platform logs.',
  BILLING: 'Subscription, contract-tier, and invoicing records.',
  VIEWER: 'Restricted read-only observation — platform pulse and telemetry only.',
};

// ── Capabilities ──────────────────────────────────────────────────────────

export const OPERATOR_CAPABILITIES = [
  'ops:view', //          reach the /ops console at all
  'telemetry:view',
  'pulse:view',
  'devdocs:view',
  'tenants:view', //      the tenant list + a tenant's detail
  'tenants:provision',
  'tenants:suspend',
  'tenants:impersonate',
  'tenants:export',
  'tenants:purge',
  'apikeys:manage',
  'identity:manage', //   per-tenant SSO / identity federation
  'ingestion:manage',
  'staff:manage', //      grant / revoke operator access
  'roles:manage', //      change an operator's role
  'audit:view', //        the immutable audit ledger + elevation history
  'billing:view',
] as const;
export type OperatorCapability = (typeof OPERATOR_CAPABILITIES)[number];

const ALL: readonly OperatorCapability[] = OPERATOR_CAPABILITIES;

/** The role → capability matrix. */
export const ROLE_CAPABILITIES: Record<OperatorRole, ReadonlySet<OperatorCapability>> = {
  SUPER_ADMIN: new Set(ALL),
  PROVISIONING: new Set<OperatorCapability>([
    'ops:view', 'telemetry:view', 'pulse:view', 'devdocs:view',
    'tenants:view', 'tenants:provision', 'tenants:suspend',
    'identity:manage', 'ingestion:manage',
  ]),
  SUPPORT: new Set<OperatorCapability>([
    'ops:view', 'telemetry:view', 'pulse:view', 'devdocs:view',
    'tenants:view', 'tenants:impersonate', 'audit:view',
  ]),
  AUDITOR: new Set<OperatorCapability>([
    'ops:view', 'telemetry:view', 'pulse:view', 'devdocs:view',
    'tenants:view', 'tenants:export', 'audit:view', 'billing:view',
  ]),
  BILLING: new Set<OperatorCapability>([
    'ops:view', 'telemetry:view', 'pulse:view', 'devdocs:view',
    'tenants:view', 'billing:view',
  ]),
  VIEWER: new Set<OperatorCapability>([
    'ops:view', 'telemetry:view', 'pulse:view',
  ]),
};

export function operatorCan(role: OperatorRole | null | undefined, capability: OperatorCapability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

export function capabilitiesFor(role: OperatorRole): ReadonlySet<OperatorCapability> {
  return ROLE_CAPABILITIES[role] ?? new Set();
}

export function isOperatorRole(value: unknown): value is OperatorRole {
  return typeof value === 'string' && (OPERATOR_ROLES as readonly string[]).includes(value);
}

// ── Route → capability map ───────────────────────────────────────────────
// Longest-prefix match. `/ops/security` (manage your OWN authenticator) and
// the bare `/ops` index are open to any operator.

const OPS_ROUTE_CAPABILITY: ReadonlyArray<[prefix: string, capability: OperatorCapability]> = [
  ['/ops/telemetry', 'telemetry:view'],
  ['/ops/pulse', 'pulse:view'],
  ['/ops/dev-docs', 'devdocs:view'],
  ['/ops/tenants', 'tenants:view'],
  ['/ops/identity', 'identity:manage'],
  ['/ops/ingestion', 'ingestion:manage'],
  ['/ops/staff', 'staff:manage'],
  ['/ops/access', 'roles:manage'],
  ['/ops/audit', 'audit:view'],
  ['/ops/billing', 'billing:view'],
  ['/ops/security', 'ops:view'],
  ['/ops', 'ops:view'],
];

/** The capability required to load an `/ops` pathname, or null when the
 * path is not an operator route. */
export function capabilityForOpsPath(pathname: string): OperatorCapability | null {
  for (const [prefix, capability] of OPS_ROUTE_CAPABILITY) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return capability;
  }
  return null;
}

/** True when `role` may load `pathname` (an `/ops/*` route). Non-ops paths
 * return true — this function only speaks to operator-route authorization. */
export function roleReachesOpsRoute(role: OperatorRole | null | undefined, pathname: string): boolean {
  const required = capabilityForOpsPath(pathname);
  if (required === null) return true;
  return operatorCan(role, required);
}

/** The landing route for a role that hit an /ops page it can't see. Every
 * role can reach telemetry, so that is the safe fallback. */
export const OPERATOR_ROLE_HOME = '/ops/telemetry';
