/**
 * Unit tests for the PS Orchestration & Decision Engine's option generator
 * (src/lib/decision-options.ts). Pure — no DB. Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import { buildDecisionOptions, type DecisionOptionsContext, type SwapCandidate } from '../src/lib/decision-options';

const swapCandidate: SwapCandidate = {
  resourceId: 'r-1',
  resourceName: 'Priya N.',
  roleName: 'Senior Architect',
  headroomHours: 10,
  donorProjectName: 'Acme Health — Data Migration',
  donorProjectCommittedHoursPerWeek: 14,
};

function ctx(overrides: Partial<DecisionOptionsContext> = {}): DecisionOptionsContext {
  return {
    drivers: ['Over Budget'],
    clientTier: 'STANDARD',
    commercialModel: 'FF',
    locked: true,
    financialImpactUsd: 45_000,
    tcv: 500_000,
    approvalThresholdUsd: 25_000,
    swapCandidate: null,
    ...overrides,
  };
}

describe('buildDecisionOptions — Over Budget', () => {
  it('offers Change Order + Margin Absorption when there is no swap candidate', () => {
    const options = buildDecisionOptions(ctx());
    expect(options.map((o) => o.key)).toEqual(['change_order', 'margin_absorption']);
  });

  it('adds Resource Re-leveling as a third option when a real swap candidate exists', () => {
    const options = buildDecisionOptions(ctx({ swapCandidate }));
    expect(options.map((o) => o.key)).toEqual(['change_order', 'resource_releveling', 'margin_absorption']);
    expect(options).toHaveLength(3);
  });

  it('names the real candidate and donor project in the Resource Re-leveling summary', () => {
    const [, releveling] = buildDecisionOptions(ctx({ swapCandidate }));
    expect(releveling!.summary).toContain('Priya N.');
    expect(releveling!.summary).toContain('Senior Architect');
    expect(releveling!.domino.affectedProjectName).toBe('Acme Health — Data Migration');
    expect(releveling!.domino.affectedProjectNote).toContain('14 hrs/wk');
  });

  it('computes a negative margin-delta % for Margin Absorption from the real $ impact and BAC', () => {
    const options = buildDecisionOptions(ctx());
    const absorption = options.find((o) => o.key === 'margin_absorption')!;
    // 45,000 / 500,000 = 9.0%
    expect(absorption.domino.marginDeltaPct).toBe(-9);
  });

  it('flags Change Order and Margin Absorption as requiring approval above the threshold', () => {
    const options = buildDecisionOptions(ctx({ financialImpactUsd: 45_000, approvalThresholdUsd: 25_000 }));
    for (const o of options) {
      expect(o.domino.requiresApproval).toBe(true);
      expect(o.domino.approvalReason).toMatch(/exceeds \$25,000/);
    }
  });

  it('does not require approval below the threshold', () => {
    const options = buildDecisionOptions(ctx({ financialImpactUsd: 10_000, approvalThresholdUsd: 25_000 }));
    for (const o of options) {
      expect(o.domino.requiresApproval).toBe(false);
      expect(o.domino.approvalReason).toBeNull();
    }
  });
});

describe('buildDecisionOptions — Behind Schedule', () => {
  it('offers Timeline Extension + Scope Descope when there is no swap candidate', () => {
    const options = buildDecisionOptions(ctx({ drivers: ['Behind Schedule'], financialImpactUsd: null }));
    expect(options.map((o) => o.key)).toEqual(['timeline_extension', 'scope_descope']);
  });

  it('adds Resource Re-leveling as a third option when a real swap candidate exists', () => {
    const options = buildDecisionOptions(ctx({ drivers: ['Behind Schedule'], financialImpactUsd: null, swapCandidate }));
    expect(options.map((o) => o.key)).toEqual(['timeline_extension', 'resource_releveling', 'scope_descope']);
  });

  it('never requires approval — schedule-only options carry no $ figure', () => {
    const options = buildDecisionOptions(ctx({ drivers: ['Behind Schedule'], financialImpactUsd: null }));
    for (const o of options) expect(o.domino.requiresApproval).toBe(false);
  });
});

describe('buildDecisionOptions — Governance Red', () => {
  it('offers exactly Governance Remediation + Escalate to Practice Director', () => {
    const options = buildDecisionOptions(ctx({ drivers: ['Governance Red'], financialImpactUsd: null }));
    expect(options.map((o) => o.key)).toEqual(['governance_remediation', 'escalate_governance']);
  });
});

describe('buildDecisionOptions — driver priority', () => {
  it('prioritizes Over Budget over Behind Schedule when both are present', () => {
    const options = buildDecisionOptions(ctx({ drivers: ['Over Budget', 'Behind Schedule'] }));
    expect(options.map((o) => o.key)).toEqual(['change_order', 'margin_absorption']);
  });

  it('caps the result at 3 options even with a swap candidate on Over Budget', () => {
    const options = buildDecisionOptions(ctx({ swapCandidate }));
    expect(options.length).toBeLessThanOrEqual(3);
  });
});

describe('buildDecisionOptions — no drivers', () => {
  it('returns no options for an empty driver list', () => {
    expect(buildDecisionOptions(ctx({ drivers: [] }))).toEqual([]);
  });
});
