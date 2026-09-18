/**
 * Unit tests for the Executive Action Triage engine
 * (src/lib/executive-triage.ts) — the pure selection + narrative synthesis
 * behind the Command Center's triage feed and the Executive Agent's
 * grounding context. Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import {
  selectTriageProjects,
  buildExecutiveTriage,
  TRIAGE_LIMIT,
  type TriageProjectInput,
  type TriageRaidInput,
} from '../src/lib/executive-triage';
import type { AuditEntryInput, SchedulePhaseInput } from '../src/lib/calculations/types';
import { CONTROL_DEFS } from '../src/lib/constants';

// A locked project with every control 'yes' is Green — the baseline "not
// flagged" project. Cloning + overriding a handful of controls to 'no'
// with `locked: false` reliably produces the audit-Red case tests need.
const GREEN_AUDIT: AuditEntryInput[] = CONTROL_DEFS.map((c) => ({ controlKey: c.id, status: 'yes' }));
const FAILING_AUDIT: AuditEntryInput[] = CONTROL_DEFS.map((c) => ({ controlKey: c.id, status: 'no' }));

function project(overrides: Partial<TriageProjectInput> = {}): TriageProjectInput {
  return {
    id: 'p-1',
    name: 'Test Engagement',
    locked: true,
    narrativeBlockers: null,
    bac: 100_000,
    actualsCost: 100_000,
    healthCost: 'Green',
    healthSched: 'Green',
    auditEntries: GREEN_AUDIT,
    deliveryManagerName: 'Dana Delivery',
    projectManagerName: 'Pat Manager',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('selectTriageProjects', () => {
  it('excludes a fully healthy project', () => {
    const flagged = selectTriageProjects([project()]);
    expect(flagged).toHaveLength(0);
  });

  it('flags a project whose healthCost is Red as Over Budget, even if audit + schedule are fine', () => {
    const flagged = selectTriageProjects([project({ healthCost: 'Red' })]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.drivers).toEqual(['Over Budget']);
  });

  it('flags a project whose healthSched is Red as Behind Schedule', () => {
    const flagged = selectTriageProjects([project({ healthSched: 'Red' })]);
    expect(flagged[0]!.drivers).toEqual(['Behind Schedule']);
  });

  it('flags an unlocked project with failing audit compliance as Governance Red', () => {
    const flagged = selectTriageProjects([project({ locked: false, auditEntries: FAILING_AUDIT })]);
    expect(flagged[0]!.drivers).toEqual(['Governance Red']);
  });

  it('an Amber lens alone does not flag a project', () => {
    const flagged = selectTriageProjects([project({ healthCost: 'Amber', healthSched: 'Amber' })]);
    expect(flagged).toHaveLength(0);
  });

  it('sorts more-driver projects ahead of single-driver ones', () => {
    const single = project({ id: 'single', healthCost: 'Red', actualsCost: 500_000, bac: 100_000 });
    const triple = project({
      id: 'triple',
      locked: false,
      auditEntries: FAILING_AUDIT,
      healthCost: 'Red',
      healthSched: 'Red',
      actualsCost: 110_000,
      bac: 100_000,
    });
    const flagged = selectTriageProjects([single, triple]);
    expect(flagged.map((f) => f.project.id)).toEqual(['triple', 'single']);
  });

  it('among equal driver counts, breaks ties by larger dollar variance first', () => {
    const small = project({ id: 'small', healthCost: 'Red', actualsCost: 110_000, bac: 100_000 });
    const large = project({ id: 'large', healthCost: 'Red', actualsCost: 200_000, bac: 100_000 });
    const flagged = selectTriageProjects([small, large]);
    expect(flagged.map((f) => f.project.id)).toEqual(['large', 'small']);
  });

  it('caps the result at TRIAGE_LIMIT even when more projects are flagged', () => {
    const many = Array.from({ length: TRIAGE_LIMIT + 4 }, (_, i) => project({ id: `p-${i}`, healthCost: 'Red' }));
    const flagged = selectTriageProjects(many);
    expect(flagged).toHaveLength(TRIAGE_LIMIT);
  });
});

describe('buildExecutiveTriage', () => {
  it('prefers narrativeBlockers as the Cause when present', () => {
    const flagged = selectTriageProjects([project({ healthCost: 'Red', narrativeBlockers: 'Vendor scope creep on integration work.' })]);
    const items = buildExecutiveTriage(flagged, new Map(), new Map());
    expect(items[0]!.cause).toBe('Vendor scope creep on integration work.');
  });

  it('falls back to the top open RAID item\'s description when there is no narrative', () => {
    const flagged = selectTriageProjects([project({ healthCost: 'Red' })]);
    const raid: TriageRaidInput = {
      projectId: 'p-1',
      title: null,
      description: 'Unscoped change order driving cost overrun.\nMore detail below.',
      impact: null,
      mitigationPlan: 'Get the change order signed this week.',
      severity: 'HIGH',
      escalate: false,
      ownerName: 'Riley Owner',
      targetDate: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    const items = buildExecutiveTriage(flagged, new Map(), new Map([['p-1', [raid]]]));
    expect(items[0]!.cause).toBe('Unscoped change order driving cost overrun.');
    expect(items[0]!.requiredAction).toBe('Get the change order signed this week.');
    expect(items[0]!.ownerName).toBe('Riley Owner');
    expect(items[0]!.deadline).toBe('2026-09-20T00:00:00.000Z');
    expect(items[0]!.lastUpdated).toBe('2026-09-10T00:00:00.000Z');
  });

  it('falls back to a templated cause + action when neither a narrative nor a RAID item exists', () => {
    const flagged = selectTriageProjects([project({ healthSched: 'Red' })]);
    const items = buildExecutiveTriage(flagged, new Map(), new Map());
    expect(items[0]!.cause).toMatch(/behind schedule/i);
    expect(items[0]!.requiredAction).toMatch(/timeline extension|reallocate resources/i);
    // no RAID item to own it — falls back to the delivery manager.
    expect(items[0]!.ownerName).toBe('Dana Delivery');
  });

  it('picks the highest-severity, escalated-first open RAID item as the driver', () => {
    const flagged = selectTriageProjects([project({ healthCost: 'Red' })]);
    const raidItems: TriageRaidInput[] = [
      {
        projectId: 'p-1',
        title: null,
        description: 'A low-severity note.',
        impact: null,
        mitigationPlan: null,
        severity: 'LOW',
        escalate: false,
        ownerName: 'Low Owner',
        targetDate: null,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        projectId: 'p-1',
        title: null,
        description: 'The critical, escalated driver.',
        impact: null,
        mitigationPlan: 'Escalated fix plan.',
        severity: 'CRITICAL',
        escalate: true,
        ownerName: 'Critical Owner',
        targetDate: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z',
      },
    ];
    const items = buildExecutiveTriage(flagged, new Map(), new Map([['p-1', raidItems]]));
    expect(items[0]!.cause).toBe('The critical, escalated driver.');
    expect(items[0]!.ownerName).toBe('Critical Owner');
  });

  it('computes a positive dollar financial impact only when actuals exceed BAC', () => {
    const overBudget = selectTriageProjects([project({ healthCost: 'Red', actualsCost: 145_000, bac: 100_000 })]);
    const items = buildExecutiveTriage(overBudget, new Map(), new Map());
    expect(items[0]!.financialImpact).toBe('$45,000 over budget');
  });

  it('computes a schedule-slip impact in weeks from the schedule engine', () => {
    const flagged = selectTriageProjects([project({ healthSched: 'Red' })]);
    const phases: SchedulePhaseInput[] = [
      {
        phaseKey: 'build',
        plannedStart: '2026-01-01',
        plannedEnd: '2026-06-01',
        actualStart: '2026-01-01',
        actualEnd: '2026-06-22', // 21 days late = 3 weeks
        pctComplete: 100,
        status: 'complete',
      },
    ];
    const items = buildExecutiveTriage(flagged, new Map([['p-1', phases]]), new Map());
    expect(items[0]!.scheduleImpact).toBe('3 weeks behind plan');
  });

  it('marks a RAID-driven deadline in the past as overdue', () => {
    const flagged = selectTriageProjects([project({ healthCost: 'Red' })]);
    const raid: TriageRaidInput = {
      projectId: 'p-1',
      title: null,
      description: 'Overdue driver.',
      impact: null,
      mitigationPlan: null,
      severity: 'HIGH',
      escalate: false,
      ownerName: 'Owner',
      targetDate: '2020-01-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const items = buildExecutiveTriage(flagged, new Map(), new Map([['p-1', [raid]]]));
    expect(items[0]!.overdue).toBe(true);
  });

  it('links to the RAID item when one drives the card, and the audit page otherwise', () => {
    const withRaid = selectTriageProjects([project({ id: 'a', healthCost: 'Red' })]);
    const withoutRaid = selectTriageProjects([project({ id: 'b', healthSched: 'Red' })]);
    const raid: TriageRaidInput = {
      projectId: 'a',
      title: null,
      description: 'x',
      impact: null,
      mitigationPlan: null,
      severity: 'HIGH',
      escalate: false,
      ownerName: null,
      targetDate: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const itemsWithRaid = buildExecutiveTriage(withRaid, new Map(), new Map([['a', [raid]]]));
    const itemsWithoutRaid = buildExecutiveTriage(withoutRaid, new Map(), new Map());
    expect(itemsWithRaid[0]!.driverHref).toBe('/raid/a');
    expect(itemsWithoutRaid[0]!.driverHref).toBe('/audit/b');
  });
});
