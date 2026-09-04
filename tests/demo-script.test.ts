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

  it('covers both the Introduction and Ops Console acts', () => {
    const acts = new Set(DEMO_SCRIPT.map((s) => s.act));
    expect(acts.has('Introduction')).toBe(true);
    expect(acts.has('Ops Console')).toBe(true);
  });

  it('only tags steps with real, non-"Full Tour" persona values', () => {
    for (const step of DEMO_SCRIPT) {
      for (const p of step.personas) {
        expect(p === 'Executive' || p === 'Admin').toBe(true);
      }
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
    for (const persona of ['Executive', 'Admin'] as const) {
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

  it('the Executive and Admin tracks both include at least one Introduction step', () => {
    const introActs = (steps: DemoStep[]) => steps.some((s) => s.act === 'Introduction');
    expect(introActs(getStepsForPersona('Executive'))).toBe(true);
    expect(introActs(getStepsForPersona('Admin'))).toBe(true);
  });

  it('only the Admin track includes the Ops Console act', () => {
    const opsActs = (steps: DemoStep[]) => steps.some((s) => s.act === 'Ops Console');
    expect(opsActs(getStepsForPersona('Admin'))).toBe(true);
    expect(opsActs(getStepsForPersona('Executive'))).toBe(false);
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
