/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Workspace Lenses — a lightweight "perspective" axis for multi-role users.
 *
 * A lens is NOT an access tier. It never gates a query or a server action —
 * `DeliveryRole` (src/lib/auth/rbac.ts) and the scoped-portfolio filters
 * still decide what data a person can see, and `canViewMargins` still masks
 * financials. A lens only decides which tailored landing page a person
 * drops onto by default. Every destination stays reachable from the
 * sidebar and ⌘K regardless of the active lens.
 *
 * It is also a different thing from `Persona`
 * (src/components/layout/personas.ts), which is a client-only RBAC preview
 * for testing. Persona simulates "what would a PROJECT_MANAGER see"; a lens
 * is the real user choosing "land me on the board briefing, not the
 * delivery tower".
 *
 * Deliberately dependency-light — pure functions over the two existing
 * capability checks, so it stays trivially unit-testable.
 */
import { hasPermission, type DeliveryRole } from '@/lib/auth/rbac';
import { canViewMargins } from '@/lib/security/masking';

export type WorkspaceLens = 'executive' | 'delivery' | 'finance' | 'operations';

export interface LensDef {
  key: WorkspaceLens;
  /** Full name in the switcher menu. */
  label: string;
  /** Compact name for the header pill. */
  short: string;
  /** Where this lens drops the user by default. */
  landing: string;
  /** One line under the label in the switcher menu. */
  blurb: string;
}

export const LENSES: Record<WorkspaceLens, LensDef> = {
  executive: {
    key: 'executive',
    label: 'Executive / SteerCo',
    short: 'Executive',
    landing: '/steerco',
    blurb: 'Board-ready portfolio briefing',
  },
  delivery: {
    key: 'delivery',
    label: 'Delivery Lead',
    short: 'Delivery',
    landing: '/',
    blurb: 'Every engagement, its health, and open RAID',
  },
  finance: {
    key: 'finance',
    label: 'Finance Controller',
    short: 'Finance',
    landing: '/reports',
    blurb: 'Margin, EAC, and utilization rollups',
  },
  operations: {
    key: 'operations',
    label: 'Operations',
    short: 'Operations',
    landing: '/command',
    blurb: 'Live vitals, the command bar, and the activity stream',
  },
};

/** Canonical display / iteration order. */
export const LENS_ORDER: readonly WorkspaceLens[] = ['executive', 'delivery', 'finance', 'operations'];

/** Cookie that carries the user's explicit lens choice across requests so
 * the server-side landing dispatcher (/launch) can honour it. */
export const LENS_COOKIE = 'a2r_lens';

export interface LensViewerContext {
  deliveryRole: DeliveryRole;
  isA2rStaff: boolean;
  /** Enterprise Governance Layer-2 toggle — when the tenant scrubs
   * financials for delivery roles, the Finance lens follows suit. */
  maskFinancialsForDelivery?: boolean;
}

export function isLens(value: string | null | undefined): value is WorkspaceLens {
  return value === 'executive' || value === 'delivery' || value === 'finance' || value === 'operations';
}

/**
 * The lenses this viewer may switch among.
 *  - Delivery and Operations are available to everyone — both landing pages
 *    are already role-scoped and margin-masked.
 *  - Executive needs SteerCo access (`steerco:view`).
 *  - Finance needs at least summary margin visibility (`canViewMargins`).
 *  - A2R staff viewing a tenant get the full set.
 */
export function availableLenses(ctx: LensViewerContext): WorkspaceLens[] {
  const allowed = new Set<WorkspaceLens>(['delivery', 'operations']);
  if (ctx.isA2rStaff || hasPermission(ctx.deliveryRole, 'steerco:view')) allowed.add('executive');
  if (
    ctx.isA2rStaff ||
    canViewMargins(ctx.deliveryRole, { maskFinancialsForDelivery: ctx.maskFinancialsForDelivery })
  ) {
    allowed.add('finance');
  }
  return LENS_ORDER.filter((lens) => allowed.has(lens));
}

const PREFERRED_BY_ROLE: Record<DeliveryRole, WorkspaceLens> = {
  ADMIN: 'delivery',
  VP_EXECUTIVE: 'executive',
  PRACTICE_DIRECTOR: 'delivery',
  DELIVERY_MANAGER: 'delivery',
  PROJECT_MANAGER: 'delivery',
};

/** The landing lens for a viewer who has never made an explicit choice.
 * Always one of `availableLenses(ctx)`. */
export function defaultLens(ctx: LensViewerContext): WorkspaceLens {
  const available = availableLenses(ctx);
  const preferred = PREFERRED_BY_ROLE[ctx.deliveryRole];
  return available.includes(preferred) ? preferred : available[0]!;
}

/**
 * The viewer's effective lens: their stored choice when it is a real lens
 * that is still available to them, otherwise the role default. Never
 * returns a lens outside `availableLenses(ctx)`.
 */
export function resolveLens(stored: string | null | undefined, ctx: LensViewerContext): WorkspaceLens {
  if (isLens(stored) && availableLenses(ctx).includes(stored)) return stored;
  return defaultLens(ctx);
}

export function landingFor(lens: WorkspaceLens): string {
  return LENSES[lens].landing;
}
