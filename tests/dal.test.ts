import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import {
  tenantDb,
  assertTenantContext,
  requireResolvedScope,
  TenantContextError,
} from '@/lib/dal';
import { runWithOrgScope, runUnscoped } from '@/lib/db/org-scope';

/**
 * The Data Access Layer's fail-closed gates (src/lib/dal/index.ts).
 * Pure — no DB round-trip. See tests/security/tenant-isolation.test.ts and
 * tests/org-scope.test.ts for the live cross-tenant proof.
 */
describe('DAL — assertTenantContext', () => {
  it('throws TenantContextError on a missing / ambiguous context', () => {
    expect(() => assertTenantContext(undefined)).toThrow(TenantContextError);
    expect(() => assertTenantContext(null)).toThrow(TenantContextError);
    expect(() => assertTenantContext({})).toThrow(TenantContextError);
    expect(() => assertTenantContext({ organizationId: '' })).toThrow(TenantContextError);
    expect(() => assertTenantContext({ organizationId: '   ' })).toThrow(TenantContextError);
    expect(() => assertTenantContext({ organizationId: null })).toThrow(TenantContextError);
    // @ts-expect-error — a non-string organizationId is a programming error, still fails closed
    expect(() => assertTenantContext({ organizationId: 123 })).toThrow(TenantContextError);
  });

  it('passes a real organizationId through as a type guard', () => {
    const ctx: { organizationId?: string | null } = { organizationId: 'org_abc123' };
    expect(() => assertTenantContext(ctx)).not.toThrow();
    // narrowed: no TS error accessing .organizationId as string
    assertTenantContext(ctx);
    const id: string = ctx.organizationId;
    expect(id).toBe('org_abc123');
  });
});

describe('DAL — requireResolvedScope', () => {
  it('throws when no org scope is set on the async context', () => {
    expect(() => requireResolvedScope()).toThrow(TenantContextError);
  });

  it('passes inside runWithOrgScope', () => {
    runWithOrgScope('org_abc123', () => {
      expect(() => requireResolvedScope()).not.toThrow();
    });
  });

  it('passes inside runUnscoped (an explicit cross-tenant marker is still a resolved scope)', () => {
    runUnscoped('test', () => {
      expect(() => requireResolvedScope()).not.toThrow();
    });
  });
});

describe('DAL — tenantDb', () => {
  it('is the same org-scoped client instance as @/lib/db', () => {
    expect(tenantDb).toBe(db);
  });
});
