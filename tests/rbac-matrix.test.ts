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
  it('has exactly 5 personas (4 enterprise tiers + the read-only Observer/guest tier), each keyed consistently in RBAC_MATRIX', () => {
    expect(RBAC_PERSONAS).toHaveLength(5);
    expect(Object.keys(RBAC_MATRIX)).toHaveLength(5);
    for (const key of RBAC_PERSONAS) expect(RBAC_MATRIX[key].key).toBe(key);
  });

  it('every allowedModules entry is a real GOVERNABLE_MODULES key', () => {
    for (const persona of RBAC_PERSONAS) {
      for (const mod of RBAC_MATRIX[persona].allowedModules) {
        expect(ALL_MODULE_KEYS.has(mod), `${persona} → ${mod}`).toBe(true);
      }
    }
  });

  it('every real DeliveryRole is covered by exactly one persona\'s deliveryRoles — the merged ENGAGEMENT_MANAGER tier covers two', () => {
    const allRoles = RBAC_PERSONAS.flatMap((p) => RBAC_MATRIX[p].deliveryRoles);
    expect(new Set(allRoles).size).toBe(6);
    expect([...allRoles].sort()).toEqual([...DELIVERY_ROLES].sort());
    expect([...RBAC_MATRIX.ENGAGEMENT_MANAGER.deliveryRoles].sort()).toEqual(['PRACTICE_DIRECTOR', 'VP_EXECUTIVE']);
  });

  it('control-tower (the universal landing page) is allowed for every persona', () => {
    for (const persona of RBAC_PERSONAS) {
      expect(isModuleAllowedForPersona(persona, 'control-tower')).toBe(true);
    }
  });

  it('CLIENT_ADMIN can reach every governable module', () => {
    const allowed = allowedModuleKeys('CLIENT_ADMIN');
    for (const m of GOVERNABLE_MODULES) expect(allowed.has(m.key)).toBe(true);
  });

  it('Admin & Org Setup and the Compliance Ledger are CLIENT_ADMIN-only', () => {
    for (const persona of RBAC_PERSONAS) {
      const expected = persona === 'CLIENT_ADMIN';
      expect(isModuleAllowedForPersona(persona, 'admin')).toBe(expected);
      expect(isModuleAllowedForPersona(persona, 'audit-log')).toBe(expected);
    }
  });

  it('DELIVERY_EXECUTIVE — the Delivery/Project Director tier — never sees admin modules, but does see aggregate financials and staffing', () => {
    for (const mod of ['admin', 'audit-log']) {
      expect(isModuleAllowedForPersona('DELIVERY_EXECUTIVE', mod)).toBe(false);
    }
    // 4-Tier RBAC: broadened to aggregate financials/commercial baseline
    // visibility across their PMs' projects, plus the pre-existing
    // staffing exposure — the whole point of the "Resource Utilization &
    // Staffing Gaps" nav item in their spec.
    for (const mod of ['capacity', 'financials', 'commercial-baseline']) {
      expect(isModuleAllowedForPersona('DELIVERY_EXECUTIVE', mod)).toBe(true);
    }
  });

  it('every persona\'s landing module is one it is actually allowed into', () => {
    for (const persona of RBAC_PERSONAS) {
      const owner = GOVERNABLE_MODULES.find((m) => m.href === RBAC_MATRIX[persona].landing);
      expect(owner, `${persona} landing ${RBAC_MATRIX[persona].landing} owns no module`).toBeDefined();
      expect(isModuleAllowedForPersona(persona, owner!.key)).toBe(true);
    }
  });

  it('ENGAGEMENT_MANAGER and DELIVERY_LEAD keep every module they hold real per-project edit authority on', () => {
    // authorizeProjectEdit (canEditProject) is undifferentiated across
    // commercial-baseline/financials/schedule/raid/audit — a role that can
    // edit one can edit all five on their own project(s), so none of the
    // five may ever be missing from their nav allow-list (a "dead route":
    // reachable-to-edit but unreachable-to-navigate). This holds for
    // ENGAGEMENT_MANAGER's PRACTICE_DIRECTOR half — its VP_EXECUTIVE half
    // shares the same nav for visibility only and never gets real edit
    // authority (see src/lib/auth/rbac.ts's canEditProject).
    for (const persona of ['ENGAGEMENT_MANAGER', 'DELIVERY_LEAD'] as const) {
      for (const mod of ['commercial-baseline', 'financials', 'schedule', 'raid', 'audit']) {
        expect(isModuleAllowedForPersona(persona, mod), `${persona} → ${mod}`).toBe(true);
      }
    }
  });
});

describe('personaForDeliveryRole', () => {
  it('is a total mapping for every real DeliveryRole, and every persona\'s deliveryRoles list contains the role(s) that resolve to it', () => {
    for (const role of DELIVERY_ROLES) {
      const persona = personaForDeliveryRole(role);
      expect(RBAC_PERSONAS).toContain(persona);
      expect(RBAC_MATRIX[persona].deliveryRoles).toContain(role);
    }
  });

  it('ADMIN resolves to CLIENT_ADMIN and PROJECT_MANAGER to DELIVERY_LEAD', () => {
    expect(personaForDeliveryRole('ADMIN')).toBe('CLIENT_ADMIN');
    expect(personaForDeliveryRole('PROJECT_MANAGER')).toBe('DELIVERY_LEAD');
  });

  it('4-Tier RBAC: PRACTICE_DIRECTOR and VP_EXECUTIVE both resolve to the merged ENGAGEMENT_MANAGER tier, with identical nav', () => {
    expect(personaForDeliveryRole('PRACTICE_DIRECTOR')).toBe('ENGAGEMENT_MANAGER');
    expect(personaForDeliveryRole('VP_EXECUTIVE')).toBe('ENGAGEMENT_MANAGER');
    expect(RBAC_MATRIX[personaForDeliveryRole('PRACTICE_DIRECTOR')].allowedModules).toEqual(
      RBAC_MATRIX[personaForDeliveryRole('VP_EXECUTIVE')].allowedModules
    );
  });
});

describe('isRbacPersona', () => {
  it('accepts every persona key', () => {
    for (const p of RBAC_PERSONAS) expect(isRbacPersona(p)).toBe(true);
  });

  it('rejects junk, empty, null/undefined, and the retired EXECUTIVE_BOARD key', () => {
    expect(isRbacPersona('NOT_A_PERSONA')).toBe(false);
    expect(isRbacPersona('EXECUTIVE_BOARD')).toBe(false);
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

  it('CLIENT_ADMIN hides nothing; the OBSERVER (guest) persona hides the most', () => {
    expect(rbacHiddenHrefs('CLIENT_ADMIN')).toEqual([]);
    const hiddenCounts = RBAC_PERSONAS.map((p) => rbacHiddenHrefs(p).length);
    expect(Math.max(...hiddenCounts)).toBe(rbacHiddenHrefs('OBSERVER').length);
    // the OBSERVER sees strictly fewer modules than the Delivery Executive
    expect(rbacHiddenHrefs('OBSERVER').length).toBeGreaterThan(rbacHiddenHrefs('DELIVERY_EXECUTIVE').length);
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

  it('/command permanently redirects, and owns no module (never blocked, for anyone)', () => {
    for (const persona of RBAC_PERSONAS) expect(isRouteBlockedForPersona(persona, '/command')).toBe(false);
  });

  it('blocks /admin and a deep audit-log path for everyone except CLIENT_ADMIN', () => {
    for (const persona of RBAC_PERSONAS) {
      const expectBlocked = persona !== 'CLIENT_ADMIN';
      expect(isRouteBlockedForPersona(persona, '/admin')).toBe(expectBlocked);
      expect(isRouteBlockedForPersona(persona, '/admin/audit-log')).toBe(expectBlocked);
    }
  });

  it('matches the deepest owning module on a deep per-project route', () => {
    // DELIVERY_EXECUTIVE cannot see Control Audit, so a specific project's
    // audit page is blocked too, not just the bare /audit index.
    expect(isRouteBlockedForPersona('DELIVERY_EXECUTIVE', '/audit/proj-123')).toBe(true);
    // ...but the same persona IS allowed into Schedule for that project.
    expect(isRouteBlockedForPersona('DELIVERY_EXECUTIVE', '/schedule/proj-123')).toBe(false);
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
  it('every real DeliveryRole resolves to a persona whose deliveryRoles list contains it', () => {
    for (const role of DELIVERY_ROLES) {
      const persona = personaForDeliveryRole(role);
      expect(RBAC_MATRIX[persona].deliveryRoles).toContain(role);
    }
  });

  it('every RbacPersona type value is a key in RBAC_MATRIX (exhaustiveness)', () => {
    const keys: RbacPersona[] = ['CLIENT_ADMIN', 'DELIVERY_EXECUTIVE', 'ENGAGEMENT_MANAGER', 'DELIVERY_LEAD', 'OBSERVER'];
    for (const k of keys) expect(RBAC_MATRIX[k]).toBeDefined();
  });
});
