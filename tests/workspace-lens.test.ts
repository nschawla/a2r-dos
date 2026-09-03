import { describe, it, expect } from 'vitest';
import {
  LENSES,
  LENS_ORDER,
  availableLenses,
  defaultLens,
  resolveLens,
  isLens,
  landingFor,
  type LensViewerContext,
} from '../src/lib/workspace/lenses';
import { DELIVERY_ROLES, type DeliveryRole } from '../src/lib/auth/rbac';

const ctx = (deliveryRole: DeliveryRole, isA2rStaff = false): LensViewerContext => ({ deliveryRole, isA2rStaff });

describe('workspace lenses — availableLenses', () => {
  it('gives every delivery role Delivery + Operations at minimum', () => {
    for (const role of DELIVERY_ROLES) {
      const lenses = availableLenses(ctx(role));
      expect(lenses).toContain('delivery');
      expect(lenses).toContain('operations');
    }
  });

  it('unlocks Executive only with SteerCo access', () => {
    expect(availableLenses(ctx('ADMIN'))).toContain('executive');
    expect(availableLenses(ctx('VP_EXECUTIVE'))).toContain('executive');
    expect(availableLenses(ctx('PRACTICE_DIRECTOR'))).not.toContain('executive');
    expect(availableLenses(ctx('DELIVERY_MANAGER'))).not.toContain('executive');
    expect(availableLenses(ctx('PROJECT_MANAGER'))).not.toContain('executive');
  });

  it('unlocks Finance only with margin visibility', () => {
    expect(availableLenses(ctx('ADMIN'))).toContain('finance');
    expect(availableLenses(ctx('VP_EXECUTIVE'))).toContain('finance');
    expect(availableLenses(ctx('PRACTICE_DIRECTOR'))).toContain('finance');
    expect(availableLenses(ctx('DELIVERY_MANAGER'))).not.toContain('finance');
    expect(availableLenses(ctx('PROJECT_MANAGER'))).not.toContain('finance');
  });

  it('gives A2R staff the full set regardless of delivery role', () => {
    expect(availableLenses(ctx('PROJECT_MANAGER', true))).toEqual([...LENS_ORDER]);
  });

  it('always returns lenses in canonical order', () => {
    const lenses = availableLenses(ctx('ADMIN'));
    expect(lenses).toEqual([...LENS_ORDER].filter((l) => lenses.includes(l)));
  });
});

describe('workspace lenses — defaultLens', () => {
  it('lands executives on the board briefing', () => {
    expect(defaultLens(ctx('VP_EXECUTIVE'))).toBe('executive');
  });

  it('lands everyone else on the delivery tower', () => {
    expect(defaultLens(ctx('ADMIN'))).toBe('delivery');
    expect(defaultLens(ctx('PRACTICE_DIRECTOR'))).toBe('delivery');
    expect(defaultLens(ctx('DELIVERY_MANAGER'))).toBe('delivery');
    expect(defaultLens(ctx('PROJECT_MANAGER'))).toBe('delivery');
  });

  it('never defaults to a lens the viewer cannot use', () => {
    for (const role of DELIVERY_ROLES) {
      for (const staff of [false, true]) {
        const c = ctx(role, staff);
        expect(availableLenses(c)).toContain(defaultLens(c));
      }
    }
  });
});

describe('workspace lenses — resolveLens', () => {
  it('honours a valid, still-available stored choice', () => {
    expect(resolveLens('operations', ctx('PROJECT_MANAGER'))).toBe('operations');
    expect(resolveLens('finance', ctx('ADMIN'))).toBe('finance');
  });

  it('falls back to the role default when the stored lens is no longer available', () => {
    // a PM who once had Finance access, or a tampered cookie
    expect(resolveLens('finance', ctx('PROJECT_MANAGER'))).toBe('delivery');
    expect(resolveLens('executive', ctx('DELIVERY_MANAGER'))).toBe('delivery');
  });

  it('falls back to the role default on missing or garbage input', () => {
    expect(resolveLens(null, ctx('VP_EXECUTIVE'))).toBe('executive');
    expect(resolveLens(undefined, ctx('ADMIN'))).toBe('delivery');
    expect(resolveLens('not-a-lens', ctx('ADMIN'))).toBe('delivery');
  });
});

describe('workspace lenses — registry', () => {
  it('isLens guards the four keys and nothing else', () => {
    expect(LENS_ORDER.every(isLens)).toBe(true);
    expect(isLens('executive')).toBe(true);
    expect(isLens('')).toBe(false);
    expect(isLens('EXECUTIVE')).toBe(false);
    expect(isLens(null)).toBe(false);
  });

  it('every lens has a distinct in-app landing route', () => {
    const routes = LENS_ORDER.map((l) => landingFor(l));
    expect(new Set(routes).size).toBe(routes.length);
    for (const r of routes) expect(r.startsWith('/')).toBe(true);
  });

  it('LENSES is keyed consistently with LENS_ORDER', () => {
    for (const key of LENS_ORDER) expect(LENSES[key].key).toBe(key);
  });
});
