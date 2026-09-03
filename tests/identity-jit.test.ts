import { describe, it, expect } from 'vitest';
import { computeJitOutcome, type JitInputs } from '../src/lib/identity/jit';
import type { ResolvedFederatedRole } from '../src/lib/identity/mapping';

const role = (over: Partial<ResolvedFederatedRole> = {}): ResolvedFederatedRole => ({
  deliveryRole: 'PROJECT_MANAGER',
  membershipRole: 'MEMBER',
  practiceId: null,
  matchedClaim: 'A2R-Delivery',
  ...over,
});

const base: JitInputs = {
  existingUser: null,
  existingMembership: null,
  resolvedRole: role(),
  jitEnabled: true,
};

describe('computeJitOutcome', () => {
  it('new user, JIT on → create user + membership', () => {
    const o = computeJitOutcome(base);
    expect(o.action.kind).toBe('create-user-and-membership');
    expect(o.createsUser).toBe(true);
    expect(o.mutatesAccess).toBe(true);
  });

  it('existing user without a membership here, JIT on → create membership', () => {
    const o = computeJitOutcome({ ...base, existingUser: { id: 'u1', name: 'Jo' } });
    expect(o.action.kind).toBe('create-membership');
    expect(o.createsUser).toBe(false);
  });

  it('no membership + JIT off → deny access', () => {
    const o = computeJitOutcome({ ...base, existingUser: { id: 'u1', name: 'Jo' }, jitEnabled: false });
    expect(o.action.kind).toBe('deny-no-membership');
    expect(o.mutatesAccess).toBe(false);
  });

  it('SSO-provisioned membership whose role drifted → re-sync', () => {
    const o = computeJitOutcome({
      ...base,
      existingUser: { id: 'u1', name: 'Jo' },
      existingMembership: { role: 'MEMBER', deliveryRole: 'DELIVERY_MANAGER', provisionedVia: 'SSO_JIT' },
      resolvedRole: role({ deliveryRole: 'PRACTICE_DIRECTOR' }),
    });
    expect(o.action.kind).toBe('update-membership-role');
    if (o.action.kind === 'update-membership-role') {
      expect(o.action.from.deliveryRole).toBe('DELIVERY_MANAGER');
    }
    expect(o.targetRole.deliveryRole).toBe('PRACTICE_DIRECTOR');
  });

  it('MANUALLY-managed membership is never re-roled by JIT', () => {
    const o = computeJitOutcome({
      ...base,
      existingUser: { id: 'u1', name: 'Jo' },
      existingMembership: { role: 'ADMIN', deliveryRole: 'ADMIN', provisionedVia: 'MANUAL' },
      resolvedRole: role({ deliveryRole: 'PROJECT_MANAGER' }),
    });
    expect(o.action.kind).toBe('touch-membership');
    expect(o.mutatesAccess).toBe(false);
  });

  it('SSO membership already in sync → just touch lastJitSyncAt', () => {
    const o = computeJitOutcome({
      ...base,
      existingUser: { id: 'u1', name: 'Jo' },
      existingMembership: { role: 'MEMBER', deliveryRole: 'PROJECT_MANAGER', provisionedVia: 'SSO_JIT' },
    });
    expect(o.action.kind).toBe('touch-membership');
  });

  it('SSO membership drift but JIT turned off → left alone', () => {
    const o = computeJitOutcome({
      ...base,
      jitEnabled: false,
      existingUser: { id: 'u1', name: 'Jo' },
      existingMembership: { role: 'MEMBER', deliveryRole: 'DELIVERY_MANAGER', provisionedVia: 'SSO_JIT' },
      resolvedRole: role({ deliveryRole: 'PRACTICE_DIRECTOR' }),
    });
    expect(o.action.kind).toBe('touch-membership');
  });
});
