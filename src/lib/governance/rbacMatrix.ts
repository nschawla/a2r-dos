/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Central RBAC Master Matrix — the single table that decides, for every
 * human-facing persona, which sidebar modules, tab pills and routes render
 * at all.
 *
 * This is deliberately NOT a new, parallel security system. A `RbacPersona`
 * is a human-readable name for one (or, for the merged executive tier
 * below, one of two) of the six real, server-enforced `DeliveryAccessRole`
 * tiers already defined in src/lib/auth/rbac.ts (the tier that gates every
 * scoped query, edit action and masked figure in the app) — see
 * `DELIVERY_ROLE_TO_PERSONA`. Introducing a second, disconnected role enum
 * would either (a) gate nothing real, or (b) require a schema migration and
 * a second set of authorization checks to keep in sync with the first —
 * both are worse for security than one true axis with a friendlier name
 * painted on top of it.
 *
 * 4-Tier RBAC simplification — `PRACTICE_DIRECTOR` and `VP_EXECUTIVE` (two
 * distinct `DeliveryAccessRole`s, real titles worth keeping distinct in the
 * roster) now both resolve to the ONE merged `ENGAGEMENT_MANAGER` persona
 * below: "Practice Director & VP-Professional Services" — the exact same
 * `allowedModules`/`landing`/`financialVisibility`. This is presentation-
 * layer only, built by elevating `VP_EXECUTIVE` up to `PRACTICE_DIRECTOR`'s
 * existing full-operational nav breadth, never by narrowing PD down — real
 * edit/approval authority in src/lib/auth/rbac.ts's `PERMISSIONS`/
 * `canEditProject` is untouched: a VP_EXECUTIVE session now SEES every
 * module a Practice Director does, but still can never edit one (VP is,
 * and stays, read-only by design). That asymmetry (equal visibility,
 * unequal edit authority) is intentional and safe precisely because
 * `allowedModules` only ever governs what renders, never what a write
 * action itself authorizes.
 *
 * What IS new here: a per-persona ALLOW-list of `GOVERNABLE_MODULES` keys
 * (src/lib/governance/config.ts — the same module/route registry the
 * tenant Governance framework already uses), used to:
 *   1. filter the Sidebar and ProjectHeader's per-engagement pills (and
 *      write affordances like the Lock Baseline control) so an
 *      unauthorized item is never rendered at all (not just disabled), and
 *   2. gate the underlying routes in middleware.ts, so hiding a link is
 *      never the only thing standing between a persona and a page.
 *
 * The one place a viewer can *change* which persona they're rendered as is
 * src/components/layout/PersonaPreviewBar.tsx — a single, explicit control
 * shown only to a tenant ADMIN or A2R staff. Every other signed-in user
 * gets no switcher: they're locked into `personaForDeliveryRole` of their
 * own real session role.
 *
 * The RBAC allow-list and the tenant's own Governance hidden-module list
 * are two independent restrictions over the same module registry — a
 * module renders only when BOTH permit it (`effectiveHiddenHrefs`).
 */
import type { DeliveryRole } from '@/lib/auth/rbac';
import type { FinancialVisibility } from '@/lib/security/masking';
import { GOVERNABLE_MODULES, findOwningModule, type GovernableModule } from './config';

export type RbacPersona =
  | 'GLOBAL_ADMIN'
  | 'DELIVERY_EXECUTIVE'
  | 'ENGAGEMENT_MANAGER'
  | 'DELIVERY_LEAD'
  | 'OBSERVER';

export interface RbacPersonaDef {
  key: RbacPersona;
  /** The real, server-enforced tier(s) this persona is a friendly name
   * for — usually one, but the merged "Practice Director & VP-PS" tier
   * (ENGAGEMENT_MANAGER) is a friendly name for two distinct
   * DeliveryAccessRoles (PRACTICE_DIRECTOR and VP_EXECUTIVE) that share
   * identical nav/masking treatment. Plural on purpose — see
   * DELIVERY_ROLE_TO_PERSONA for the (many-to-one) reverse mapping. */
  deliveryRoles: readonly DeliveryRole[];
  label: string;
  blurb: string;
  /** GOVERNABLE_MODULES keys this persona may reach — sidebar, tab pills,
   * and (via middleware.ts) the underlying route. Anything not listed is
   * completely omitted from navigation and 307s away if visited directly.
   *
   * This list is a FLOOR, not a stylized headline — every module where
   * `canEditProject` (src/lib/auth/rbac.ts) can return true for this
   * persona's deliveryRole MUST stay included, even where a simplified
   * role spec wouldn't have named it. Otherwise a real user with working
   * edit authority on a project (per-project `authorizeProjectEdit`, used
   * uniformly across commercial-baseline/financials/schedule/raid/audit —
   * it doesn't distinguish by module) would be 307'd away from a page they
   * can actually edit: a dead route in the opposite direction from a ghost
   * nav link, and just as much of a bug. PRACTICE_DIRECTOR and
   * PROJECT_MANAGER both carry that per-project edit authority, so both
   * keep all five of those modules regardless of how narrowly a role
   * spec's "visible nav items" column names them. */
  allowedModules: readonly string[];
  /** Where this persona lands when an admin switches to it in the Persona
   * Preview banner (src/components/layout/PersonaPreviewBar.tsx), and
   * where their own real "Go to my landing view" click goes when this is
   * their real deliveryRole. Always a member of `allowedModules`
   * (enforced by tests/rbac-matrix.test.ts). */
  landing: string;
  /** Mirrors src/lib/security/masking.ts's tier for this persona's
   * DeliveryRole — informational here (masking.ts remains the one place
   * that actually strips/masks figures); shown in the switcher for clarity. */
  financialVisibility: FinancialVisibility;
}

export const RBAC_PERSONAS: readonly RbacPersona[] = [
  'GLOBAL_ADMIN',
  'ENGAGEMENT_MANAGER',
  'DELIVERY_EXECUTIVE',
  'DELIVERY_LEAD',
  'OBSERVER',
];

/**
 * The master matrix. Every module key here must be a real
 * GOVERNABLE_MODULES key (enforced by tests/rbac-matrix.test.ts) — adjust
 * access by editing these lists, nowhere else.
 *
 * Four definitive enterprise tiers (GLOBAL_ADMIN, ENGAGEMENT_MANAGER,
 * DELIVERY_EXECUTIVE, DELIVERY_LEAD) plus OBSERVER, the read-only guest
 * tier — not counted among the "four," since it's a guest/observer
 * accommodation rather than an enterprise role.
 */
export const RBAC_MATRIX: Record<RbacPersona, RbacPersonaDef> = {
  GLOBAL_ADMIN: {
    key: 'GLOBAL_ADMIN',
    deliveryRoles: ['ADMIN'],
    label: 'Global Admin',
    blurb: 'Full tenant authority — every module, the rate card, and org setup.',
    allowedModules: GOVERNABLE_MODULES.map((m) => m.key),
    landing: '/portfolio',
    financialVisibility: 'full',
  },
  DELIVERY_EXECUTIVE: {
    key: 'DELIVERY_EXECUTIVE',
    deliveryRoles: ['DELIVERY_MANAGER'],
    label: 'Delivery / Project Director',
    blurb:
      'Multi-project, account-level scope across their PMs’ engagements — aggregate financials, cross-project risk, account rollups, and staffing exposure. No admin tools.',
    // Broadened (4-Tier RBAC) to include the two financial modules — a
    // Delivery/Project Director now sees aggregate financials and
    // commercial baselines across their direct-report PMs' projects. This
    // is a VISIBILITY grant only: DELIVERY_MANAGER's real authority in
    // src/lib/auth/rbac.ts stays approval-only (`project:approve`) — it
    // never gains direct edit (`canEditProject` returns false for this
    // role regardless of nav), so there's no dead-route risk in the other
    // direction either.
    allowedModules: ['control-tower', 'raid', 'schedule', 'capacity', 'financials', 'commercial-baseline'],
    landing: '/portfolio',
    financialVisibility: 'restricted',
  },
  ENGAGEMENT_MANAGER: {
    key: 'ENGAGEMENT_MANAGER',
    // Merged 4-Tier RBAC tier: BOTH PRACTICE_DIRECTOR and VP_EXECUTIVE
    // resolve here (DELIVERY_ROLE_TO_PERSONA below) — "full enterprise
    // portfolio visibility" shared identically by Practice Directors and
    // VPs/Professional-Services executives. Built by elevating
    // VP_EXECUTIVE up to PRACTICE_DIRECTOR's existing full-operational
    // module list (see the top-of-file doc comment) — not by narrowing PD
    // down — so this is a strict superset of the old EXECUTIVE_BOARD
    // persona's nav, and identical to the old ENGAGEMENT_MANAGER's.
    deliveryRoles: ['PRACTICE_DIRECTOR', 'VP_EXECUTIVE'],
    label: 'Practice Director / VP-Professional Services',
    blurb:
      'Full enterprise portfolio visibility — SteerCo briefings, global utilization, commercial baselines, and realization metrics — plus practice-level delivery governance for a Practice Director’s own engagements. No macro-tenant settings, no global admin tools.',
    // Every module — like GLOBAL_ADMIN, minus admin/audit-log. Not a
    // literal reading of a simplified role spec's shorter nav-item list:
    // PRACTICE_DIRECTOR holds real per-project edit authority
    // (canEditProject) across commercial-baseline/financials/schedule/
    // raid/audit uniformly (see the allowedModules doc comment above), so
    // none of those five may ever be missing from this list — a role spec
    // naming only "SteerCo, utilization, commercial baselines, realization
    // metrics" as headline items doesn't mean the rest gets hidden out
    // from under a Practice Director's own working edit authority. VP_
    // EXECUTIVE shares this same module list for VISIBILITY only — it
    // never holds canEditProject/project:approve authority
    // (src/lib/auth/rbac.ts), so a VP seeing (e.g.) RAID Cockpit in nav
    // never grants them a write action there; they can look, never touch.
    allowedModules: GOVERNABLE_MODULES.filter((m) => m.key !== 'admin' && m.key !== 'audit-log').map((m) => m.key),
    landing: '/portfolio',
    financialVisibility: 'summary',
  },
  DELIVERY_LEAD: {
    key: 'DELIVERY_LEAD',
    deliveryRoles: ['PROJECT_MANAGER'],
    label: 'Project Manager',
    blurb:
      'Their own assigned engagements — milestones, RAID, effort tracking, baseline through audit. No portfolio-wide margin rollups, no practice-wide capacity headers, no admin configuration.',
    // Same reasoning as ENGAGEMENT_MANAGER above — every non-core module.
    // PROJECT_MANAGER holds real per-project edit authority via
    // canEditProject on commercial-baseline/financials/schedule/raid/audit
    // uniformly, and the spec's restrictions ("portfolio-wide margin
    // rollups", "practice-wide capacity headers") are already enforced as
    // data-level masking/scoping on Executive Hub / Resource & Capacity,
    // not as a page-level block — confirmed by e2e Suite H3, which signs
    // in as this exact role and asserts the Executive Hub renders with its
    // margin KPIs masked, not that the page 307s away.
    allowedModules: GOVERNABLE_MODULES.filter((m) => m.key !== 'admin' && m.key !== 'audit-log').map((m) => m.key),
    landing: '/portfolio',
    financialVisibility: 'restricted',
  },
  OBSERVER: {
    key: 'OBSERVER',
    deliveryRoles: ['VIEWER'],
    label: 'Viewer / Guest',
    blurb: 'Read-only observation — the control tower, board briefing, and summary reports. No edit, create, or write controls anywhere, including baseline locking.',
    allowedModules: ['control-tower', 'steerco', 'reports'],
    landing: '/portfolio',
    financialVisibility: 'restricted',
  },
};

// 4-Tier RBAC — many-to-one for the merged executive tier: both
// PRACTICE_DIRECTOR and VP_EXECUTIVE resolve to ENGAGEMENT_MANAGER. Every
// other real DeliveryAccessRole still maps 1:1 to its own persona.
const DELIVERY_ROLE_TO_PERSONA: Record<DeliveryRole, RbacPersona> = {
  ADMIN: 'GLOBAL_ADMIN',
  VP_EXECUTIVE: 'ENGAGEMENT_MANAGER',
  PRACTICE_DIRECTOR: 'ENGAGEMENT_MANAGER',
  DELIVERY_MANAGER: 'DELIVERY_EXECUTIVE',
  PROJECT_MANAGER: 'DELIVERY_LEAD',
  VIEWER: 'OBSERVER',
};

/** The persona for a signed-in user's real, session-verified DeliveryRole. */
export function personaForDeliveryRole(role: DeliveryRole): RbacPersona {
  return DELIVERY_ROLE_TO_PERSONA[role];
}

export function isRbacPersona(value: string | null | undefined): value is RbacPersona {
  return !!value && Object.prototype.hasOwnProperty.call(RBAC_MATRIX, value);
}

/** GOVERNABLE_MODULES keys this persona may see, core modules included
 * (core modules — Control Tower, Admin, Compliance Ledger — are subject
 * only to the RBAC allow-list here, not to tenant Governance hiding). */
export function allowedModuleKeys(persona: RbacPersona): ReadonlySet<string> {
  return new Set(RBAC_MATRIX[persona].allowedModules);
}

export function isModuleAllowedForPersona(persona: RbacPersona, moduleKey: string): boolean {
  return allowedModuleKeys(persona).has(moduleKey);
}

/** Route hrefs this persona may NOT reach — for Sidebar / nav filtering.
 * Merge with governance's `hiddenHrefs(config)` (a UNION) to get the full
 * set a given render must omit. */
export function rbacHiddenHrefs(persona: RbacPersona): string[] {
  const allowed = allowedModuleKeys(persona);
  return GOVERNABLE_MODULES.filter((m) => !allowed.has(m.key)).map((m) => m.href);
}

/** Is a concrete pathname outside this persona's allow-list? Used by
 * middleware.ts to 307 away from a URL that was never meant to be typed
 * in directly, mirroring src/lib/governance/config.ts#isPathHidden's
 * deepest-module-match logic exactly (findOwningModule). An unrecognised
 * path (not a GOVERNABLE_MODULES route) is never blocked here. */
export function isRouteBlockedForPersona(persona: RbacPersona, pathname: string): boolean {
  const owner = findOwningModule(pathname);
  if (!owner) return false;
  return !isModuleAllowedForPersona(persona, owner.key);
}

export type { GovernableModule };
