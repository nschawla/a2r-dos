import { describe, expect, it } from 'vitest';
import { DEMO_SCRIPT, DEMO_PERSONAS, getStepsForPersona, isDemoPersona, type DemoStep } from '@/lib/demo/demo-script';

describe('DEMO_SCRIPT', () => {
  it('is non-empty and every step has a well-formed route, duration, and caption', () => {
    expect(DEMO_SCRIPT.length).toBeGreaterThan(0);
    for (const step of DEMO_SCRIPT) {
      expect(step.route.startsWith('/')).toBe(true);
      expect(step.durationMs).toBeGreaterThan(0);
      expect(step.caption.trim().length).toBeGreaterThan(10);
      expect(step.personas.length).toBeGreaterThan(0);
    }
  });

  it('has unique step ids', () => {
    const ids = DEMO_SCRIPT.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the Introduction, Ops Console, and Security & Trust acts', () => {
    const acts = new Set(DEMO_SCRIPT.map((s) => s.act));
    expect(acts.has('Introduction')).toBe(true);
    expect(acts.has('Ops Console')).toBe(true);
    expect(acts.has('Security & Trust')).toBe(true);
  });

  it('only tags steps with real, non-"Full Tour" persona values', () => {
    const allowed = new Set(['Executive', 'Admin', 'Security']);
    for (const step of DEMO_SCRIPT) {
      for (const p of step.personas) {
        expect(allowed.has(p)).toBe(true);
      }
    }
  });

  it('never points a beat at a route that only exists as a redirect', () => {
    // `/ops` 307s to the operator's landing route since v1.16.0 — beats
    // must name the resolved route so the walkthrough shows no flash.
    for (const step of DEMO_SCRIPT) {
      expect(step.route).not.toBe('/ops');
    }
  });

  it('showcases Role-Based Scoped Filtering, shown to every single-persona track', () => {
    const step = DEMO_SCRIPT.find((s) => s.id === 'scoped-practice-view');
    expect(step).toBeDefined();
    expect(step?.route).toBe('/capacity');
    expect(step?.personas).toEqual(expect.arrayContaining(['Executive', 'Admin', 'Security']));
    expect(step?.highlightSelector).toBe('#capacity-scope-indicator');
    expect(step?.caption).toMatch(/practice/i);
  });

  it('showcases the Custom KPI Builder, Admin-track only', () => {
    const step = DEMO_SCRIPT.find((s) => s.id === 'admin-kpis');
    expect(step).toBeDefined();
    expect(step?.route).toBe('/admin/kpis');
    expect(step?.act).toBe('Ops Console');
    expect(step?.personas).toEqual(['Admin']);
    expect(step?.highlightSelector).toBe('#new-kpi-button');
    expect(step?.caption).toMatch(/KPI/);
  });

  it('carries a Security & Trust segment: tenant isolation, operator RBAC, step-up MFA, immutable ledger', () => {
    const security = DEMO_SCRIPT.filter((s) => s.act === 'Security & Trust');
    const ids = security.map((s) => s.id);
    expect(ids).toEqual(['tenant-isolation', 'operator-roles', 'step-up-mfa', 'audit-ledger']);

    const isolation = DEMO_SCRIPT.find((s) => s.id === 'tenant-isolation')!;
    expect(isolation.personas).toEqual(expect.arrayContaining(['Executive', 'Admin', 'Security']));
    expect(isolation.caption).toMatch(/database/i);

    const roles = DEMO_SCRIPT.find((s) => s.id === 'operator-roles')!;
    expect(roles.route).toBe('/ops/access');
    expect(roles.highlightSelector).toBe('#operator-capability-matrix');
    expect(roles.caption).toMatch(/least privilege/i);

    const mfa = DEMO_SCRIPT.find((s) => s.id === 'step-up-mfa')!;
    expect(mfa.route).toBe('/ops/security');
    expect(mfa.highlightSelector).toBe('#operator-mfa-panel');

    const ledger = DEMO_SCRIPT.find((s) => s.id === 'audit-ledger')!;
    expect(ledger.route).toBe('/ops/audit');
    expect(ledger.highlightSelector).toBe('#jit-elevation-log');
    expect(ledger.caption).toMatch(/immutable|hash-chained/i);

    // the deep operator beats are for the Admin and Security tracks only —
    // never the board-level Executive track.
    for (const id of ['operator-roles', 'step-up-mfa', 'audit-ledger']) {
      const step = DEMO_SCRIPT.find((s) => s.id === id)!;
      expect(step.personas).toEqual(expect.arrayContaining(['Admin', 'Security']));
      expect(step.personas).not.toContain('Executive');
    }
  });
});

describe('getStepsForPersona', () => {
  it('"Full Tour" plays the entire script, in order', () => {
    const steps = getStepsForPersona('Full Tour');
    expect(steps).toEqual(DEMO_SCRIPT);
  });

  it('returns a new array (not the same reference) so callers can never mutate the master script', () => {
    expect(getStepsForPersona('Full Tour')).not.toBe(DEMO_SCRIPT);
  });

  it('a single-persona track is a strict, order-preserving subset of the full script', () => {
    for (const persona of ['Executive', 'Admin', 'Security'] as const) {
      const steps = getStepsForPersona(persona);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.length).toBeLessThan(DEMO_SCRIPT.length);
      for (const step of steps) expect(step.personas).toContain(persona);

      // order-preserving: each step's index in the full script is strictly
      // increasing across the filtered subsequence.
      const fullIndexes = steps.map((s) => DEMO_SCRIPT.findIndex((d) => d.id === s.id));
      for (let i = 1; i < fullIndexes.length; i++) {
        expect(fullIndexes[i]!).toBeGreaterThan(fullIndexes[i - 1]!);
      }
    }
  });

  it('every single-persona track opens on Welcome and closes on the sign-off', () => {
    for (const persona of ['Executive', 'Admin', 'Security'] as const) {
      const steps = getStepsForPersona(persona);
      expect(steps[0]?.id).toBe('welcome');
      expect(steps[steps.length - 1]?.id).toBe('closing');
    }
  });

  it('the Executive, Admin, and Security tracks each include at least one Introduction step', () => {
    const introActs = (steps: DemoStep[]) => steps.some((s) => s.act === 'Introduction');
    expect(introActs(getStepsForPersona('Executive'))).toBe(true);
    expect(introActs(getStepsForPersona('Admin'))).toBe(true);
    expect(introActs(getStepsForPersona('Security'))).toBe(true);
  });

  it('only the Admin track includes the Ops Console act', () => {
    const opsActs = (steps: DemoStep[]) => steps.some((s) => s.act === 'Ops Console');
    expect(opsActs(getStepsForPersona('Admin'))).toBe(true);
    expect(opsActs(getStepsForPersona('Executive'))).toBe(false);
    expect(opsActs(getStepsForPersona('Security'))).toBe(false);
  });

  it('the Admin and Security tracks both play the full Security & Trust segment', () => {
    const trustActs = (steps: DemoStep[]) => steps.filter((s) => s.act === 'Security & Trust').map((s) => s.id);
    expect(trustActs(getStepsForPersona('Admin'))).toEqual([
      'tenant-isolation',
      'operator-roles',
      'step-up-mfa',
      'audit-ledger',
    ]);
    expect(trustActs(getStepsForPersona('Security'))).toEqual([
      'tenant-isolation',
      'operator-roles',
      'step-up-mfa',
      'audit-ledger',
    ]);
    // the Executive track gets only the one tenant-facing trust beat.
    expect(trustActs(getStepsForPersona('Executive'))).toEqual(['tenant-isolation']);
  });
});

describe('isDemoPersona', () => {
  it('accepts every declared persona and rejects everything else', () => {
    for (const p of DEMO_PERSONAS) expect(isDemoPersona(p)).toBe(true);
    expect(isDemoPersona('Client')).toBe(false);
    expect(isDemoPersona('')).toBe(false);
    expect(isDemoPersona(null)).toBe(false);
    expect(isDemoPersona(42)).toBe(false);
  });
});
