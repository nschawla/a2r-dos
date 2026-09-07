/**
 * A2R Delivery OS™ — Role-Based Data Masking & PII / financial security.
 *
 * A field-visibility layer that sits on top of the src/lib/auth/rbac.ts
 * DeliveryRole tier. Dependency-light and pure (only Prisma *types*), same
 * as rbac.ts — so it unit-tests trivially and can run on both the server
 * (to strip sensitive numbers out of query payloads before they reach the
 * client) and in client components (to decide whether to render `••••`).
 *
 * Three visibility tiers for financial data:
 *
 *   full        ADMIN                         — everything, incl. raw
 *                                               per-role cost rates and
 *                                               contractor cost exposure.
 *   summary     VP_EXECUTIVE, PRACTICE_DIRECTOR — blended margins, EAC
 *                                               totals, variance/drift;
 *                                               raw cost rates masked.
 *   restricted  DELIVERY_MANAGER, PROJECT_MANAGER — no cost or margin
 *                                               figures at all; hours,
 *                                               schedule and health only.
 */
import type { DeliveryRole } from '@/lib/auth/rbac';

export type FinancialVisibility = 'full' | 'summary' | 'restricted';

/**
 * Layer-2 org governance override (see src/lib/governance/config.ts). When
 * `maskFinancialsForDelivery` is set, the summary tier (Practice Director)
 * is pushed down to `restricted`, on top of the role-based tiers below.
 * All functions accept this optionally and are unchanged when it's absent.
 */
export interface FinancialMaskOptions {
  maskFinancialsForDelivery?: boolean;
}

const VISIBILITY_BY_ROLE: Record<DeliveryRole, FinancialVisibility> = {
  ADMIN: 'full',
  VP_EXECUTIVE: 'summary',
  PRACTICE_DIRECTOR: 'summary',
  DELIVERY_MANAGER: 'restricted',
  PROJECT_MANAGER: 'restricted',
  // v1.16.0 — a guest observer gets the most conservative tier: cost rates,
  // margins and variance are all scrubbed ("restricted read-only observation").
  VIEWER: 'restricted',
};

/** Roles below VP that the org-level `maskFinancialsForDelivery` toggle
 * scrubs. (DELIVERY_MANAGER / PROJECT_MANAGER are already restricted, so
 * the toggle only changes PRACTICE_DIRECTOR in practice — listed in full
 * for intent.) */
const DELIVERY_TIER_ROLES: ReadonlySet<DeliveryRole> = new Set<DeliveryRole>([
  'PRACTICE_DIRECTOR',
  'DELIVERY_MANAGER',
  'PROJECT_MANAGER',
]);

export function financialVisibility(role: DeliveryRole, opts?: FinancialMaskOptions): FinancialVisibility {
  if (opts?.maskFinancialsForDelivery && DELIVERY_TIER_ROLES.has(role)) return 'restricted';
  return VISIBILITY_BY_ROLE[role];
}

/** Blended margin %, EAC totals, margin drift / variance — the executive view. */
export function canViewMargins(role: DeliveryRole, opts?: FinancialMaskOptions): boolean {
  return financialVisibility(role, opts) !== 'restricted';
}

/** Raw per-role cost rates, blended cost rate, per-line actual cost, contractor $ exposure. */
export function canViewCostRates(role: DeliveryRole, opts?: FinancialMaskOptions): boolean {
  return financialVisibility(role, opts) === 'full';
}

/** Any financial figure at all (used for the page-level "restricted" banner). */
export function canViewAnyFinancials(role: DeliveryRole, opts?: FinancialMaskOptions): boolean {
  return canViewMargins(role, opts);
}

export const MASK = '••••';

export const RESTRICTED_BADGE_LABEL = 'Restricted to Partners';
export const COST_RATE_BADGE_LABEL = 'Partner-only';

export function restrictedNoticeFor(visibility: FinancialVisibility): string | null {
  if (visibility === 'restricted') {
    return 'Cost rates, margins and financial variance on this page are restricted to Partners and authorized Finance / Ops leads. Figures below are shown masked.';
  }
  if (visibility === 'summary') {
    return 'Raw contractor cost rates and per-line cost detail are restricted to Partners. Blended margins and EAC totals are shown in full.';
  }
  return null;
}

// ─────────────────────────────────────────────────── value formatters

export function maskMoney(value: number | null | undefined, canView: boolean): string {
  if (!canView) return MASK;
  const n = value ?? 0;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function maskPct(value: number | null | undefined, canView: boolean, digits = 1): string {
  if (!canView) return MASK;
  return `${(value ?? 0).toFixed(digits)}%`;
}

export function maskPoints(value: number | null | undefined, canView: boolean, digits = 1): string {
  if (!canView) return MASK;
  const n = value ?? 0;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)} pts`;
}

export function maskRate(value: number | null | undefined, canView: boolean): string {
  if (!canView) return MASK;
  return `$${Math.round(value ?? 0)}`;
}

/** Generic: return the number, or the mask token, as a display string. */
export function maskNumber(value: number | null | undefined, canView: boolean): string {
  if (!canView) return MASK;
  return (value ?? 0).toLocaleString('en-US');
}

// ─────────────────────────────────────────── server-side payload stripping

export interface MaskableRateRole {
  id: string;
  name: string;
  // WP2 — the calc engine passes rates as exact decimal strings; masking
  // only zeroes or passes them through, so it accepts either form.
  billRate: number | string;
  costRate: number | string;
  employmentType?: 'fte' | 'contractor';
}

/**
 * Zero out `costRate` / `billRate` on a rate-card payload before it is
 * serialized to the client, so a **restricted** viewer (PM / DM) never
 * receives the sensitive numbers at all — not just a component that
 * declines to render them.
 *
 * `summary` viewers (VP / Practice Director) keep the rates in the payload:
 * the calculation engine needs them to derive the blended margins and EAC
 * totals those roles ARE authorized to see; the UI still hides the raw
 * per-role cost-rate column.
 */
export function maskRateRolesForViewer<T extends MaskableRateRole>(
  roles: T[],
  role: DeliveryRole,
  opts?: FinancialMaskOptions
): T[] {
  if (financialVisibility(role, opts) !== 'restricted') return roles;
  return roles.map((r) => ({ ...r, costRate: 0, billRate: 0 }));
}

/** Zero the per-line `cost` on financial-actual rows for a restricted viewer. */
export function maskFinancialActualsForViewer<T extends { cost: number | string }>(
  rows: T[],
  role: DeliveryRole,
  opts?: FinancialMaskOptions
): T[] {
  if (canViewMargins(role, opts)) return rows;
  return rows.map((r) => ({ ...r, cost: 0 }));
}
