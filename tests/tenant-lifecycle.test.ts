/**
 * Unit tests for the pure parts of the Tenant Fleet Management service
 * (src/lib/ops/tenant-management.ts) — the lifecycle state machine.
 * Impersonation / purge need a database and are covered by the e2e suite.
 */
import { describe, it, expect } from 'vitest';
import { canTransition, TENANT_STATE } from '../src/lib/ops/tenant-lifecycle';

describe('tenant lifecycle state machine', () => {
  it('describes each state with the right access flags', () => {
    expect(TENANT_STATE.ACTIVE).toMatchObject({ memberAccess: true, memberCanWrite: true });
    expect(TENANT_STATE.GRACE_PERIOD).toMatchObject({ memberAccess: true, memberCanWrite: false });
    expect(TENANT_STATE.SUSPENDED).toMatchObject({ memberAccess: false, memberCanWrite: false });
  });

  it('allows the expected transitions and forbids no-ops', () => {
    expect(canTransition('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransition('ACTIVE', 'GRACE_PERIOD')).toBe(true);
    expect(canTransition('GRACE_PERIOD', 'ACTIVE')).toBe(true);
    expect(canTransition('GRACE_PERIOD', 'SUSPENDED')).toBe(true);
    expect(canTransition('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(canTransition('SUSPENDED', 'GRACE_PERIOD')).toBe(true);

    expect(canTransition('ACTIVE', 'ACTIVE')).toBe(false);
    expect(canTransition('SUSPENDED', 'SUSPENDED')).toBe(false);
    expect(canTransition('GRACE_PERIOD', 'GRACE_PERIOD')).toBe(false);
  });

  it('every state can reach every other state (operator override is total)', () => {
    const states = ['ACTIVE', 'SUSPENDED', 'GRACE_PERIOD'] as const;
    for (const from of states) {
      for (const to of states) {
        if (from === to) continue;
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });
});
