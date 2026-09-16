/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Central RBAC Master Matrix — the single table that decides, for every
 * human-facing persona, which sidebar modules, tab pills and routes render
 * at all.
 *
 * This is deliberately NOT a new, parallel security system. A `RbacPersona`
 * is a human-readable name for one of the five real, server-enforced
 * `DeliveryAccessRole` tiers already defined in src/lib/auth/rbac.ts (the
 * tier that gates every scoped query, edit action and masked figure in the
 * app) — see `PERSONA_TO_DELIVERY_ROLE`. Introducing a second, disconnected
 * role enum would either (a) gate nothing real, or (b) require a schema
 * migration and a second set of authorization checks to keep in sync with
 * the first — both are worse for security than one true axis with a
 * friendlier name painted on top of it.
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
  | 'EXECUTIVE_BOARD'
  | 'DELIVERY_EXECUTIVE'
  | 'ENGAGEMENT_MANAGER'
  | 'DELIVERY_LEAD'
  | 'OBSERVER';

export interface RbacPersonaDef {
  key: RbacPersona;
  /** The real, server-enforced tier this persona is a friendly name for. */
  deliveryRole: DeliveryRole;
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
  'EXECUTIVE_BOARD',
  'DELIVERY_EXECUTIVE',
  'ENGAGEMENT_MANAGER',
  'DELIVERY_LEAD',
  'OBSERVER',
];

/**
 * The master matrix. Every module key here must be a real
 * GOVERNABLE_MODULES key (enforced by tests/rbac-matrix.test.ts) — adjust
 * access by editing these lists, nowhere else.
 */
export const RBAC_MATRIX: Record<RbacPersona, RbacPersonaDef> = {
  GLOBAL_ADMIN: {
    key: 'GLOBAL_ADMIN',
    deliveryRole: 'ADMIN',
    label: 'Global Admin',
    blurb: 'Full tenant authority — every module, the rate card, and org setup.',
    allowedModules: GOVERNABLE_MODULES.map((m) => m.key),
    landing: '/portfolio',
    financialVisibility: 'full',
  },
  EXECUTIVE_BOARD: {
    key: 'EXECUTIVE_BOARD',
    deliveryRole: 'VP_EXECUTIVE',
    label: 'Executive Board',
    blurb:
      'Board-level read-out — the macro Control Tower, the SteerCo briefing, margin realization, and the Executive Hub’s risk & compliance overview. No operational editing, no rate card, no admin settings.',
    allowedModules: ['control-tower', 'steerco', 'financials', 'reports'],
    landing: '/steerco',
    financialVisibility: 'summary',
  },
  DELIVERY_EXECUTIVE: {
    key: 'DELIVERY_EXECUTIVE',
    deliveryRole: 'DELIVERY_MANAGER',
    label: 'Delivery Executive',
    blurb:
      'Internal delivery leadership escalation view — account health roll-up, escalated RAID & risk, cross-project milestones, and staffing exposure. No financials, no admin tools.',
    allowedModules: ['control-tower', 'raid', 'schedule', 'capacity'],
    landing: '/portfolio',
    financialVisibility: 'restricted',
  },
  ENGAGEMENT_MANAGER: {
    key: 'ENGAGEMENT_MANAGER',
    deliveryRole: 'PRACTICE_DIRECTOR',
    label: 'Engagement / Practice Manager',
    blurb:
      'Runs their practice’s engagements end to end — the practice dashboard, active engagements, resourcing, and full delivery governance. No macro-tenant settings, no global admin tools.',
    // Every module — like GLOBAL_ADMIN, minus admin/audit-log. Not a
    // literal reading of the role spec's shorter nav-item list: PD holds
    // real per-project edit authority (canEditProject) across commercial-
    // baseline/financials/schedule/raid/audit uniformly (see the
    // allowedModules doc comment above), and command/steerco/reports carry
    // no edit surface at all — nothing to over-grant by including them.
    // The spec's restrictions for this role ("macro-tenant settings",
    // "global admin tools") are about admin/audit-log, already excluded;
    // "the practice-wide vs. whole-portfolio" distinction on Control
    // Tower/Capacity/Executive Hub is a data-scoping concern
    // (src/lib/scoping.ts), and margin visibility is a masking concern
    // (financialVisibility: 'summary' below) — neither is a module-level
    // nav gate, and narrowing this list to match the spec's headline items
    // literally breaks real, already-shipped behavior (a Practice Director
    // reading their masked portfolio rollup on the Executive Hub, e.g.).
    allowedModules: GOVERNABLE_MODULES.filter((m) => m.key !== 'admin' && m.key !== 'audit-log').map((m) => m.key),
    landing: '/portfolio',
    financialVisibility: 'summary',
  },
  DELIVERY_LEAD: {
    key: 'DELIVERY_LEAD',
    deliveryRole: 'PROJECT_MANAGER',
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
    deliveryRole: 'VIEWER',
    label: 'Viewer / Guest',
    blurb: 'Read-only observation — the control tower, board briefing, and summary reports. No edit, create, or write controls anywhere, including baseline locking.',
    allowedModules: ['control-tower', 'steerco', 'reports'],
    landing: '/portfolio',
    financialVisibility: 'restricted',
  },
};

const DELIVERY_ROLE_TO_PERSONA: Record<DeliveryRole, RbacPersona> = {
  ADMIN: 'GLOBAL_ADMIN',
  VP_EXECUTIVE: 'EXECUTIVE_BOARD',
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
