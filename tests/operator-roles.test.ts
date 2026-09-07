import { describe, it, expect } from 'vitest';
import {
  OPERATOR_ROLES,
  OPERATOR_CAPABILITIES,
  ROLE_CAPABILITIES,
  OPERATOR_ROLE_LABEL,
  OPERATOR_ROLE_DESCRIPTION,
  operatorCan,
  capabilitiesFor,
  isOperatorRole,
  roleReachesOpsRoute,
  capabilityForOpsPath,
} from '@/lib/ops/operator-roles';

/** v1.16.0 — the A2R organizational-role capability matrix (pure, Edge-safe). */
describe('operator-roles — matrix integrity', () => {
  it('every role has a label, a description, and a capability set', () => {
    for (const role of OPERATOR_ROLES) {
      expect(OPERATOR_ROLE_LABEL[role]).toBeTruthy();
      expect(OPERATOR_ROLE_DESCRIPTION[role]).toBeTruthy();
      expect(ROLE_CAPABILITIES[role]).toBeInstanceOf(Set);
    }
  });

  it('every capability granted by a role is a known capability', () => {
    const known = new Set<string>(OPERATOR_CAPABILITIES);
    for (const role of OPERATOR_ROLES) {
      for (const cap of ROLE_CAPABILITIES[role]) expect(known.has(cap)).toBe(true);
    }
  });

  it('SUPER_ADMIN holds every capability; VIEWER holds the fewest', () => {
    expect(capabilitiesFor('SUPER_ADMIN').size).toBe(OPERATOR_CAPABILITIES.length);
    const sizes = OPERATOR_ROLES.map((r) => capabilitiesFor(r).size);
    expect(capabilitiesFor('VIEWER').size).toBe(Math.min(...sizes));
  });

  it('every role can reach the console at all (ops:view + telemetry)', () => {
    for (const role of OPERATOR_ROLES) {
      expect(operatorCan(role, 'ops:view')).toBe(true);
      expect(operatorCan(role, 'telemetry:view')).toBe(true);
    }
  });

  it('only SUPER_ADMIN may purge a tenant or manage staff / roles', () => {
    for (const role of OPERATOR_ROLES) {
      const expected = role === 'SUPER_ADMIN';
      expect(operatorCan(role, 'tenants:purge')).toBe(expected);
      expect(operatorCan(role, 'staff:manage')).toBe(expected);
      expect(operatorCan(role, 'roles:manage')).toBe(expected);
      expect(operatorCan(role, 'apikeys:manage')).toBe(expected);
    }
  });

  it('capability boundaries per role', () => {
    expect(operatorCan('PROVISIONING', 'tenants:provision')).toBe(true);
    expect(operatorCan('PROVISIONING', 'tenants:impersonate')).toBe(false);
    expect(operatorCan('SUPPORT', 'tenants:impersonate')).toBe(true);
    expect(operatorCan('SUPPORT', 'tenants:provision')).toBe(false);
    expect(operatorCan('AUDITOR', 'audit:view')).toBe(true);
    expect(operatorCan('AUDITOR', 'tenants:suspend')).toBe(false);
    expect(operatorCan('BILLING', 'billing:view')).toBe(true);
    expect(operatorCan('BILLING', 'tenants:view')).toBe(true);
    expect(operatorCan('BILLING', 'audit:view')).toBe(false);
    expect(operatorCan('VIEWER', 'tenants:view')).toBe(false);
  });

  it('operatorCan is false for a null / unknown role', () => {
    expect(operatorCan(null, 'ops:view')).toBe(false);
    expect(operatorCan(undefined, 'telemetry:view')).toBe(false);
  });
});

describe('operator-roles — isOperatorRole', () => {
  it('accepts the six roles, rejects anything else', () => {
    for (const r of OPERATOR_ROLES) expect(isOperatorRole(r)).toBe(true);
    expect(isOperatorRole('OWNER')).toBe(false);
    expect(isOperatorRole('')).toBe(false);
    expect(isOperatorRole(null)).toBe(false);
    expect(isOperatorRole(2)).toBe(false);
  });
});

describe('operator-roles — route guard', () => {
  it('maps /ops sub-routes to a capability', () => {
    expect(capabilityForOpsPath('/ops/tenants')).toBe('tenants:view');
    expect(capabilityForOpsPath('/ops/tenants/abc')).toBe('tenants:view');
    expect(capabilityForOpsPath('/ops/staff')).toBe('staff:manage');
    expect(capabilityForOpsPath('/ops/access')).toBe('roles:manage');
    expect(capabilityForOpsPath('/ops/audit')).toBe('audit:view');
    expect(capabilityForOpsPath('/ops/billing')).toBe('billing:view');
    expect(capabilityForOpsPath('/ops/security')).toBe('ops:view');
    expect(capabilityForOpsPath('/ops')).toBe('ops:view');
    expect(capabilityForOpsPath('/portfolio')).toBeNull();
  });

  it('a VIEWER reaches telemetry + pulse + their own security, nothing else', () => {
    expect(roleReachesOpsRoute('VIEWER', '/ops/telemetry')).toBe(true);
    expect(roleReachesOpsRoute('VIEWER', '/ops/pulse')).toBe(true);
    expect(roleReachesOpsRoute('VIEWER', '/ops/security')).toBe(true);
    expect(roleReachesOpsRoute('VIEWER', '/ops/tenants')).toBe(false);
    expect(roleReachesOpsRoute('VIEWER', '/ops/staff')).toBe(false);
    expect(roleReachesOpsRoute('VIEWER', '/ops/access')).toBe(false);
  });

  it('a PROVISIONING operator reaches tenants + ingestion, not audit / staff', () => {
    expect(roleReachesOpsRoute('PROVISIONING', '/ops/tenants')).toBe(true);
    expect(roleReachesOpsRoute('PROVISIONING', '/ops/ingestion')).toBe(true);
    expect(roleReachesOpsRoute('PROVISIONING', '/ops/identity')).toBe(true);
    expect(roleReachesOpsRoute('PROVISIONING', '/ops/audit')).toBe(false);
    expect(roleReachesOpsRoute('PROVISIONING', '/ops/staff')).toBe(false);
  });

  it('SUPER_ADMIN reaches every /ops route', () => {
    for (const path of ['/ops', '/ops/tenants', '/ops/staff', '/ops/access', '/ops/audit', '/ops/billing', '/ops/identity', '/ops/ingestion', '/ops/dev-docs']) {
      expect(roleReachesOpsRoute('SUPER_ADMIN', path)).toBe(true);
    }
  });

  it('a non-ops path is never an operator-route concern', () => {
    expect(roleReachesOpsRoute('VIEWER', '/portfolio')).toBe(true);
    expect(roleReachesOpsRoute(null, '/launch')).toBe(true);
  });
});
