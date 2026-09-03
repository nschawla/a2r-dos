/**
 * Tenant lifecycle state machine — pure, zero-dependency (no Prisma, no
 * crypto), so it unit-tests trivially and is safe to import from both the
 * server service (tenant-management.ts) and client components.
 */
import type { OrgStatus } from '@prisma/client';

export type TenantLifecycleState = OrgStatus; // 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD'

export interface TenantStateDescriptor {
  state: TenantLifecycleState;
  label: string;
  /** members can open the workspace at all */
  memberAccess: boolean;
  /** members can write (edit projects, financials, etc.) */
  memberCanWrite: boolean;
  tone: 'success' | 'warning' | 'critical';
}

export const TENANT_STATE: Record<TenantLifecycleState, TenantStateDescriptor> = {
  ACTIVE: { state: 'ACTIVE', label: 'Active', memberAccess: true, memberCanWrite: true, tone: 'success' },
  GRACE_PERIOD: {
    state: 'GRACE_PERIOD',
    label: 'Grace period (read-only)',
    memberAccess: true,
    memberCanWrite: false,
    tone: 'warning',
  },
  SUSPENDED: { state: 'SUSPENDED', label: 'Suspended', memberAccess: false, memberCanWrite: false, tone: 'critical' },
};

/** Documented lifecycle flow. The operator console can force any state, but
 * `from === to` is always rejected. */
const ALLOWED_TRANSITIONS: Record<TenantLifecycleState, TenantLifecycleState[]> = {
  ACTIVE: ['SUSPENDED', 'GRACE_PERIOD'],
  GRACE_PERIOD: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'GRACE_PERIOD'],
};

export function canTransition(from: TenantLifecycleState, to: TenantLifecycleState): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}
