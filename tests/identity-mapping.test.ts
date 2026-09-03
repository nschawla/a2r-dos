import { describe, it, expect } from 'vitest';
import { resolveFederatedRole, extractGroupClaims, type GroupMappingRule } from '../src/lib/identity/mapping';

const rules: GroupMappingRule[] = [
  { claimValue: 'A2R-Delivery-Admins', deliveryRole: 'ADMIN', membershipRole: 'ADMIN', practiceId: null, priority: 10 },
  { claimValue: 'A2R-Practice-Directors', deliveryRole: 'PRACTICE_DIRECTOR', membershipRole: 'MEMBER', practiceId: 'prac-1', priority: 20 },
  { claimValue: 'A2R-Delivery', deliveryRole: 'PROJECT_MANAGER', membershipRole: 'MEMBER', practiceId: null, priority: 50 },
];

const defaults = { deliveryRole: 'PROJECT_MANAGER' as const, membershipRole: 'MEMBER' as const };

describe('resolveFederatedRole', () => {
  it('maps a matching group to its role', () => {
    const r = resolveFederatedRole(['A2R-Practice-Directors'], rules, defaults);
    expect(r.deliveryRole).toBe('PRACTICE_DIRECTOR');
    expect(r.practiceId).toBe('prac-1');
    expect(r.matchedClaim).toBe('A2R-Practice-Directors');
  });

  it('is case-insensitive on both sides', () => {
    const r = resolveFederatedRole(['a2r-delivery-admins'], rules, defaults);
    expect(r.deliveryRole).toBe('ADMIN');
  });

  it('lowest priority wins when several groups match', () => {
    const r = resolveFederatedRole(['A2R-Delivery', 'A2R-Delivery-Admins'], rules, defaults);
    expect(r.deliveryRole).toBe('ADMIN'); // priority 10 beats 50
  });

  it('falls back to the IdP default when nothing matches', () => {
    const r = resolveFederatedRole(['Some-Unrelated-Group'], rules, defaults);
    expect(r).toEqual({ deliveryRole: 'PROJECT_MANAGER', membershipRole: 'MEMBER', practiceId: null, matchedClaim: null });
  });

  it('falls back with an empty claim set', () => {
    expect(resolveFederatedRole([], rules, defaults).matchedClaim).toBeNull();
  });
});

describe('extractGroupClaims', () => {
  it('reads an array `groups` claim', () => {
    expect(extractGroupClaims({ groups: ['G1', 'G2', ' G2 '] })).toEqual(['G1', 'G2']);
  });

  it('reads a space/comma-delimited string claim and merges roles + groups', () => {
    expect(extractGroupClaims({ roles: 'admin viewer', groups: 'admin' })).toEqual(['admin', 'viewer']);
  });

  it('returns [] when there are no recognised claims', () => {
    expect(extractGroupClaims({ sub: 'x', email: 'y@z.com' })).toEqual([]);
  });
});
