/**
 * Unit tests for the RBAC Master Matrix (src/lib/governance/rbacMatrix.ts).
 * Pure, no I/O — same testability contract as rbac.ts / masking.ts /
 * governance/config.ts.
 */
import { describe, it, expect } from 'vitest';
import { DELIVERY_ROLES, type DeliveryRole } from '../src/lib/auth/rbac';
import { GOVERNABLE_MODULES } from '../src/lib/governance/config';
import {
  RBAC_MATRIX,
  RBAC_PERSONAS,
  personaForDeliveryRole,
  isRbacPersona,
  allowedModuleKeys,
  isModuleAllowedForPersona,
  rbacHiddenHrefs,
  isRouteBlockedForPersona,
  type RbacPersona,
} from '../src/lib/governance/rbacMatrix';

const ALL_MODULE_KEYS = new Set(GOVERNABLE_MODULES.map((m) => m.key));

describe('RBAC matrix — data integrity', () => {
  it('has exactly 6 personas, each keyed consistently in RBAC_MATRIX', () => {
    expect(RBAC_PERSONAS).toHaveLength(6);
    expect(Object.keys(RBAC_MATRIX)).toHaveLength(6);
    for (const key of RBAC_PERSONAS) expect(RBAC_MATRIX[key].key).toBe(key);
  });

  it('every allowedModules entry is a real GOVERNABLE_MODULES key', () => {
    for (const persona of RBAC_PERSONAS) {
      for (const mod of RBAC_MATRIX[persona].allowedModules) {
        expect(ALL_MODULE_KEYS.has(mod), `${persona} → ${mod}`).toBe(true);
      }
    }
  });

  it('each persona maps to a distinct real DeliveryRole (one persona per tier)', () => {
    const roles = RBAC_PERSONAS.map((p) => RBAC_MATRIX[p].deliveryRole);
    expect(new Set(roles).size).toBe(6);
    expect([...roles].sort()).toEqual([...DELIVERY_ROLES].sort());
  });

  it('control-tower (the universal landing page) is allowed for every persona', () => {
    for (const persona of RBAC_PERSONAS) {
      expect(isModuleAllowedForPersona(persona, 'control-tower')).toBe(true);
    }
  });

  it('GLOBAL_ADMIN can reach every governable module', () => {
    const allowed = allowedModuleKeys('GLOBAL_ADMIN');
    for (const m of GOVERNABLE_MODULES) expect(allowed.has(m.key)).toBe(true);
  });

  it('Admin & Org Setup and the Compliance Ledger are GLOBAL_ADMIN-only', () => {
    for (const persona of RBAC_PERSONAS) {
      const expected = persona === 'GLOBAL_ADMIN';
      expect(isModuleAllowedForPersona(persona, 'admin')).toBe(expected);
      expect(isModuleAllowedForPersona(persona, 'audit-log')).toBe(expected);
    }
  });

  it('CLIENT_SPONSOR — the external-facing persona — never sees internal commercial/cost/roster modules', () => {
    for (const mod of ['commercial-baseline', 'financials', 'capacity', 'command', 'admin', 'audit-log']) {
      expect(isModuleAllowedForPersona('CLIENT_SPONSOR', mod)).toBe(false);
    }
  });
});

describe('personaForDeliveryRole', () => {
  it('is a total, role-preserving mapping for every real DeliveryRole', () => {
    for (const role of DELIVERY_ROLES) {
      const persona = personaForDeliveryRole(role);
      expect(RBAC_PERSONAS).toContain(persona);
      expect(RBAC_MATRIX[persona].deliveryRole).toBe(role);
    }
  });

  it('ADMIN resolves to GLOBAL_ADMIN and PROJECT_MANAGER to DELIVERY_LEAD', () => {
    expect(personaForDeliveryRole('ADMIN')).toBe('GLOBAL_ADMIN');
    expect(personaForDeliveryRole('PROJECT_MANAGER')).toBe('DELIVERY_LEAD');
  });
});

describe('isRbacPersona', () => {
  it('accepts every persona key', () => {
    for (const p of RBAC_PERSONAS) expect(isRbacPersona(p)).toBe(true);
  });

  it('rejects junk, empty, and null/undefined', () => {
    expect(isRbacPersona('NOT_A_PERSONA')).toBe(false);
    expect(isRbacPersona('')).toBe(false);
    expect(isRbacPersona(null)).toBe(false);
    expect(isRbacPersona(undefined)).toBe(false);
  });
});

describe('rbacHiddenHrefs', () => {
  it('partitions GOVERNABLE_MODULES: every href is either allowed or hidden, never both', () => {
    for (const persona of RBAC_PERSONAS) {
      const hidden = new Set(rbacHiddenHrefs(persona));
      for (const m of GOVERNABLE_MODULES) {
        const allowed = isModuleAllowedForPersona(persona, m.key);
        expect(hidden.has(m.href)).toBe(!allowed);
      }
    }
  });

  it('GLOBAL_ADMIN hides nothing; the OBSERVER (guest) persona hides the most', () => {
    expect(rbacHiddenHrefs('GLOBAL_ADMIN')).toEqual([]);
    const hiddenCounts = RBAC_PERSONAS.map((p) => rbacHiddenHrefs(p).length);
    expect(Math.max(...hiddenCounts)).toBe(rbacHiddenHrefs('OBSERVER').length);
    // the OBSERVER sees strictly fewer modules than the external client sponsor
    expect(rbacHiddenHrefs('OBSERVER').length).toBeGreaterThan(rbacHiddenHrefs('CLIENT_SPONSOR').length);
  });
});

describe('isRouteBlockedForPersona', () => {
  it('never blocks a path outside the governable-module registry', () => {
    for (const persona of RBAC_PERSONAS) {
      expect(isRouteBlockedForPersona(persona, '/terms')).toBe(false);
      expect(isRouteBlockedForPersona(persona, '/some/random/path')).toBe(false);
      expect(isRouteBlockedForPersona(persona, '/onboarding')).toBe(false);
    }
  });

  it('never blocks the Control Tower landing route for any persona', () => {
    for (const persona of RBAC_PERSONAS) expect(isRouteBlockedForPersona(persona, '/portfolio')).toBe(false);
  });

  it('the bare root (public landing) owns no module and is never blocked', () => {
    for (const persona of RBAC_PERSONAS) expect(isRouteBlockedForPersona(persona, '/')).toBe(false);
  });

  it('blocks /admin and a deep audit-log path for everyone except GLOBAL_ADMIN', () => {
    for (const persona of RBAC_PERSONAS) {
      const expectBlocked = persona !== 'GLOBAL_ADMIN';
      expect(isRouteBlockedForPersona(persona, '/admin')).toBe(expectBlocked);
      expect(isRouteBlockedForPersona(persona, '/admin/audit-log')).toBe(expectBlocked);
    }
  });

  it('matches the deepest owning module on a deep per-project route', () => {
    // CLIENT_SPONSOR cannot see Financials at all, so a specific project's
    // financials page is blocked too, not just the bare /financials index.
    expect(isRouteBlockedForPersona('CLIENT_SPONSOR', '/financials/proj-123')).toBe(true);
    // ...but the same persona IS allowed into Schedule for that project.
    expect(isRouteBlockedForPersona('CLIENT_SPONSOR', '/schedule/proj-123')).toBe(false);
  });

  it('agrees with isModuleAllowedForPersona for every module × persona pair', () => {
    for (const persona of RBAC_PERSONAS) {
      for (const m of GOVERNABLE_MODULES) {
        expect(isRouteBlockedForPersona(persona, m.href)).toBe(!isModuleAllowedForPersona(persona, m.key));
      }
    }
  });
});

describe('every persona resolves through the real DeliveryRole tiers', () => {
  it('round-trips DeliveryRole -> persona -> DeliveryRole', () => {
    const roundTrip = (role: DeliveryRole) => RBAC_MATRIX[personaForDeliveryRole(role)].deliveryRole;
    for (const role of DELIVERY_ROLES) expect(roundTrip(role)).toBe(role);
  });

  it('every RbacPersona type value is a key in RBAC_MATRIX (exhaustiveness)', () => {
    const keys: RbacPersona[] = ['GLOBAL_ADMIN', 'EXECUTIVE_BOARD', 'ENGAGEMENT_MANAGER', 'CLIENT_SPONSOR', 'DELIVERY_LEAD'];
    for (const k of keys) expect(RBAC_MATRIX[k]).toBeDefined();
  });
});
