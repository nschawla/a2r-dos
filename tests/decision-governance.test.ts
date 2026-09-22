/**
 * Unit tests for the PS Orchestration & Decision Engine's guardrail check
 * (src/lib/decision-governance.ts). Pure — no DB. Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import { checkGuardrail, type GuardrailContext } from '../src/lib/decision-governance';
import { buildDecisionOptions } from '../src/lib/decision-options';

const [changeOrder, marginAbsorption] = buildDecisionOptions({
  drivers: ['Over Budget'],
  clientTier: 'STANDARD',
  commercialModel: 'FF',
  locked: true,
  financialImpactUsd: 45_000,
  tcv: 500_000,
  approvalThresholdUsd: 25_000,
  swapCandidate: null,
});
const [timelineExtension] = buildDecisionOptions({
  drivers: ['Behind Schedule'],
  clientTier: 'STANDARD',
  commercialModel: 'FF',
  locked: true,
  financialImpactUsd: null,
  tcv: 500_000,
  approvalThresholdUsd: 25_000,
  swapCandidate: null,
});

function ctx(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
  return {
    option: changeOrder!,
    commercialModel: 'FF',
    locked: true,
    deliveryRole: 'ADMIN',
    approvalThresholdUsd: 25_000,
    ...overrides,
  };
}

describe('checkGuardrail — change_order', () => {
  it('blocks a Change Order when the baseline is not locked', () => {
    const result = checkGuardrail(ctx({ locked: false }));
    expect(result.canExecute).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.notes[0]).toMatch(/baseline must be locked/i);
  });

  it('allows a locked, FF Change Order for a role with approval authority, with no caution', () => {
    const result = checkGuardrail(ctx({ locked: true, commercialModel: 'FF', deliveryRole: 'ADMIN' }));
    expect(result.canExecute).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it('cautions (but still allows) a Change Order on a T&M engagement', () => {
    const result = checkGuardrail(ctx({ locked: true, commercialModel: 'TM', deliveryRole: 'ADMIN' }));
    expect(result.canExecute).toBe(true);
    expect(result.notes.some((n) => /T&M/.test(n))).toBe(true);
  });
});

describe('checkGuardrail — approval threshold / RBAC', () => {
  it('blocks a Project Manager from executing an option above the threshold', () => {
    const result = checkGuardrail(ctx({ option: marginAbsorption!, deliveryRole: 'PROJECT_MANAGER' }));
    expect(result.canExecute).toBe(false);
    expect(result.notes[0]).toMatch(/exceeds \$25,000/);
  });

  it('allows a Delivery Manager (project:approve) to execute an option above the threshold', () => {
    const result = checkGuardrail(ctx({ option: marginAbsorption!, deliveryRole: 'DELIVERY_MANAGER' }));
    expect(result.canExecute).toBe(true);
  });

  it('allows a Practice Director (project:approve) to execute an option above the threshold', () => {
    const result = checkGuardrail(ctx({ option: marginAbsorption!, deliveryRole: 'PRACTICE_DIRECTOR' }));
    expect(result.canExecute).toBe(true);
  });

  it('blocks a VP Executive — read-only, no project:approve — from executing an approval-gated option', () => {
    const result = checkGuardrail(ctx({ option: marginAbsorption!, deliveryRole: 'VP_EXECUTIVE' }));
    expect(result.canExecute).toBe(false);
  });

  it('never blocks an option with no approval requirement, regardless of role', () => {
    const result = checkGuardrail({ ...ctx(), option: timelineExtension!, deliveryRole: 'PROJECT_MANAGER' });
    expect(result.canExecute).toBe(true);
    expect(result.notes).toEqual([]);
  });
});
