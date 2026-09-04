/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
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
 * role enum would either (a) gate nothing real, same as the cosmetic
 * `Persona` preview in src/components/layout/personas.ts, or (b) require a
 * schema migration and a second set of authorization checks to keep in
 * sync with the first — both are worse for security than one true axis
 * with a friendlier name painted on top of it.
 *
 * What IS new here: a per-persona ALLOW-list of `GOVERNABLE_MODULES` keys
 * (src/lib/governance/config.ts — the same module/route registry the
 * tenant Governance framework already uses), used to:
 *   1. filter the Sidebar and ProjectHeader's per-engagement pills so an
 *      unauthorized item is never rendered at all (not just disabled), and
 *   2. gate the underlying routes in middleware.ts, so hiding a link is
 *      never the only thing standing between a persona and a page.
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
  | 'ENGAGEMENT_MANAGER'
  | 'CLIENT_SPONSOR'
  | 'DELIVERY_LEAD';

export interface RbacPersonaDef {
  key: RbacPersona;
  /** The real, server-enforced tier this persona is a friendly name for. */
  deliveryRole: DeliveryRole;
  label: string;
  blurb: string;
  /** GOVERNABLE_MODULES keys this persona may reach — sidebar, tab pills,
   * and (via middleware.ts) the underlying route. Anything not listed is
   * completely omitted from navigation and 307s away if visited directly. */
  allowedModules: readonly string[];
  /** Mirrors src/lib/security/masking.ts's tier for this persona's
   * DeliveryRole — informational here (masking.ts remains the one place
   * that actually strips/masks figures); shown in the switcher for clarity. */
  financialVisibility: FinancialVisibility;
}

export const RBAC_PERSONAS: readonly RbacPersona[] = [
  'GLOBAL_ADMIN',
  'EXECUTIVE_BOARD',
  'ENGAGEMENT_MANAGER',
  'CLIENT_SPONSOR',
  'DELIVERY_LEAD',
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
    financialVisibility: 'full',
  },
  EXECUTIVE_BOARD: {
    key: 'EXECUTIVE_BOARD',
    deliveryRole: 'VP_EXECUTIVE',
    label: 'Executive Board',
    blurb: 'Portfolio-wide strategic view — vitals, capacity, and board reporting.',
    allowedModules: ['command', 'control-tower', 'capacity', 'steerco', 'reports'],
    financialVisibility: 'summary',
  },
  ENGAGEMENT_MANAGER: {
    key: 'ENGAGEMENT_MANAGER',
    deliveryRole: 'PRACTICE_DIRECTOR',
    label: 'Engagement Manager',
    blurb: 'Runs their practice’s engagements end to end — full delivery governance.',
    allowedModules: [
      'command',
      'control-tower',
      'capacity',
      'commercial-baseline',
      'financials',
      'schedule',
      'raid',
      'audit',
      'steerco',
      'reports',
    ],
    financialVisibility: 'summary',
  },
  CLIENT_SPONSOR: {
    key: 'CLIENT_SPONSOR',
    deliveryRole: 'DELIVERY_MANAGER',
    label: 'Client Sponsor',
    blurb: 'External-facing status only — schedule, risk, and the board briefing. No cost or contract detail.',
    allowedModules: ['control-tower', 'schedule', 'raid', 'steerco', 'reports'],
    financialVisibility: 'restricted',
  },
  DELIVERY_LEAD: {
    key: 'DELIVERY_LEAD',
    deliveryRole: 'PROJECT_MANAGER',
    label: 'Delivery Lead',
    blurb: 'Hands-on execution of their own engagement — baseline through audit.',
    allowedModules: [
      'command',
      'control-tower',
      'commercial-baseline',
      'financials',
      'schedule',
      'raid',
      'audit',
      'steerco',
      'reports',
    ],
    financialVisibility: 'restricted',
  },
};

const DELIVERY_ROLE_TO_PERSONA: Record<DeliveryRole, RbacPersona> = {
  ADMIN: 'GLOBAL_ADMIN',
  VP_EXECUTIVE: 'EXECUTIVE_BOARD',
  PRACTICE_DIRECTOR: 'ENGAGEMENT_MANAGER',
  DELIVERY_MANAGER: 'CLIENT_SPONSOR',
  PROJECT_MANAGER: 'DELIVERY_LEAD',
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
