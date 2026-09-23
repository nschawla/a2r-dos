/**
 * Unit tests for the Schedule & Milestones Cockpit Executive Triage &
 * Thematic Clustering engine (src/lib/schedule-triage.ts). Pure — no DB.
 * Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import type { SchedulePhaseInput } from '../src/lib/calculations/types';
import { buildScheduleTriage, classifyScheduleTheme, phaseHealthRag, type ScheduleTriageProjectInput } from '../src/lib/schedule-triage';

const NOW = new Date('2026-09-23T00:00:00.000Z');

function phase(overrides: Partial<SchedulePhaseInput> = {}): SchedulePhaseInput {
  return {
    phaseKey: 'build',
    plannedStart: '2026-08-01T00:00:00.000Z',
    plannedEnd: '2026-09-01T00:00:00.000Z',
    actualStart: '2026-08-01T00:00:00.000Z',
    actualEnd: null,
    pctComplete: 50,
    status: 'inprogress',
    ...overrides,
  };
}

const ALL_PHASES: string[] = ['initiate', 'design', 'build', 'test', 'deploy', 'sustain'];

function sixPhases(overrides: Partial<Record<string, Partial<SchedulePhaseInput>>> = {}): SchedulePhaseInput[] {
  return ALL_PHASES.map((key) =>
    phase({ phaseKey: key, status: 'complete', plannedEnd: '2026-01-01T00:00:00.000Z', actualEnd: '2026-01-01T00:00:00.000Z', ...overrides[key] })
  );
}

function project(overrides: Partial<ScheduleTriageProjectInput> = {}): ScheduleTriageProjectInput {
  return {
    id: 'p-1',
    name: 'Test Engagement',
    phases: sixPhases(),
    healthScope: 'Green',
    healthRes: 'Green',
    openDependencyRisk: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('phaseHealthRag', () => {
  it('marks an explicitly DELAYED phase Red regardless of dates', () => {
    const p = phase({ status: 'delayed', plannedEnd: null, actualEnd: null });
    expect(phaseHealthRag(p, NOW)).toBe('Red');
  });

  it('marks a phase with a critical date slip Red', () => {
    const p = phase({ status: 'inprogress', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-20T00:00:00.000Z' });
    expect(phaseHealthRag(p, NOW)).toBe('Red');
  });

  it('marks a phase with a warning-band date slip Amber', () => {
    const p = phase({ status: 'inprogress', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-08T00:00:00.000Z' });
    expect(phaseHealthRag(p, NOW)).toBe('Amber');
  });

  it('marks a phase burning calendar time ahead of progress (pace-critical) Amber or Red even with no actualEnd yet', () => {
    // 90% of the planned window elapsed, only 10% complete.
    const p = phase({
      status: 'inprogress',
      plannedStart: '2026-08-01T00:00:00.000Z',
      plannedEnd: '2026-08-11T00:00:00.000Z',
      actualEnd: null,
      pctComplete: 10,
    });
    const rag = phaseHealthRag(p, new Date('2026-08-10T00:00:00.000Z'));
    expect(['Amber', 'Red']).toContain(rag);
  });

  it('marks an on-pace, undated-slip phase Green', () => {
    const p = phase({ status: 'notstarted', plannedStart: null, plannedEnd: null, actualEnd: null });
    expect(phaseHealthRag(p, NOW)).toBe('Green');
  });
});

describe('classifyScheduleTheme', () => {
  it('classifies an open high-severity dependency as Third-Party Dependency Cascade', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases(),
      healthScope: 'Green',
      healthRes: 'Green',
      openDependencyRisk: true,
    });
    expect(theme).toBe('THIRD_PARTY_DEPENDENCY');
  });

  it('classifies a slipped Test phase as UAT Sign-off Lag', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases({ test: { status: 'delayed', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-20T00:00:00.000Z' } }),
      healthScope: 'Green',
      healthRes: 'Green',
      openDependencyRisk: false,
    });
    expect(theme).toBe('UAT_SIGNOFF_LAG');
  });

  it('classifies a slipped Deploy phase + thin delivery team as Deployment Resource Contention', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases({ deploy: { status: 'delayed', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-20T00:00:00.000Z' } }),
      healthScope: 'Green',
      healthRes: 'Amber',
      openDependencyRisk: false,
    });
    expect(theme).toBe('DEPLOYMENT_RESOURCE_CONTENTION');
  });

  it('does not classify a slipped Deploy phase as resource contention without the healthRes signal', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases({ deploy: { status: 'delayed', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-20T00:00:00.000Z' } }),
      healthScope: 'Green',
      healthRes: 'Green',
      openDependencyRisk: false,
    });
    expect(theme).not.toBe('DEPLOYMENT_RESOURCE_CONTENTION');
  });

  it('classifies healthScope Red as Scope Expansion Slippage', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases(),
      healthScope: 'Red',
      healthRes: 'Green',
      openDependencyRisk: false,
    });
    expect(theme).toBe('SCOPE_EXPANSION_SLIPPAGE');
  });

  it('falls back to OTHER when nothing matches', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases({ build: { status: 'delayed' } }),
      healthScope: 'Green',
      healthRes: 'Green',
      openDependencyRisk: false,
    });
    expect(theme).toBe('OTHER');
  });

  it('prioritizes dependency cascade over every other signal', () => {
    const theme = classifyScheduleTheme({
      phases: sixPhases({ test: { status: 'delayed' } }),
      healthScope: 'Red',
      healthRes: 'Amber',
      openDependencyRisk: true,
    });
    expect(theme).toBe('THIRD_PARTY_DEPENDENCY');
  });
});

describe('buildScheduleTriage', () => {
  it('counts active (non-complete) milestones and splits them by health', () => {
    const result = buildScheduleTriage(
      [project({ phases: sixPhases({ build: { status: 'inprogress' }, test: { status: 'delayed' } }) })],
      NOW
    );
    // 6 phases total, 2 non-complete (build, test) => 4 stay complete/excluded.
    expect(result.activeMilestoneCount).toBe(2);
    expect(result.redMilestoneCount).toBe(1); // test, explicitly delayed
  });

  it('counts upcoming go-lives within 30 and 60 days', () => {
    const result = buildScheduleTriage(
      [
        project({
          id: 'a',
          phases: sixPhases({ deploy: { status: 'inprogress', plannedEnd: '2026-10-08T00:00:00.000Z' } }), // 15 days out
        }),
        project({
          id: 'b',
          phases: sixPhases({ deploy: { status: 'inprogress', plannedEnd: '2026-11-15T00:00:00.000Z' } }), // ~53 days out
        }),
        project({
          id: 'c',
          phases: sixPhases({ deploy: { status: 'inprogress', plannedEnd: '2027-01-01T00:00:00.000Z' } }), // well past 60
        }),
      ],
      NOW
    );
    expect(result.goLiveNext30).toBe(1);
    expect(result.goLiveNext60).toBe(2);
  });

  it('excludes fully on-track projects from clusters entirely', () => {
    const result = buildScheduleTriage([project()], NOW);
    expect(result.clusters).toHaveLength(0);
  });

  it('groups at-risk projects into clusters and only returns non-empty ones', () => {
    const result = buildScheduleTriage(
      [
        project({ id: 'a', openDependencyRisk: true, phases: sixPhases({ build: { status: 'delayed' } }) }),
        project({ id: 'b', healthScope: 'Red', phases: sixPhases({ design: { status: 'delayed' } }) }),
        project({ id: 'c' }),
      ],
      NOW
    );
    const themes = result.clusters.map((c) => c.theme);
    expect(themes).toContain('THIRD_PARTY_DEPENDENCY');
    expect(themes).toContain('SCOPE_EXPANSION_SLIPPAGE');
    expect(themes).not.toContain('UAT_SIGNOFF_LAG');
  });

  it('sorts clusters by distinct project count first, then total slip days', () => {
    const result = buildScheduleTriage(
      [
        // Dependency theme: 1 project, huge slip.
        project({
          id: 'a',
          openDependencyRisk: true,
          phases: sixPhases({ build: { status: 'inprogress', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-09-10T00:00:00.000Z' } }),
        }),
        // Scope theme: 2 projects, smaller slips each — more systemic.
        project({
          id: 'b',
          healthScope: 'Red',
          phases: sixPhases({ build: { status: 'inprogress', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-10T00:00:00.000Z' } }),
        }),
        project({
          id: 'c',
          healthScope: 'Red',
          phases: sixPhases({ build: { status: 'inprogress', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-09T00:00:00.000Z' } }),
        }),
      ],
      NOW
    );
    expect(result.clusters[0]!.theme).toBe('SCOPE_EXPANSION_SLIPPAGE');
    expect(result.clusters[1]!.theme).toBe('THIRD_PARTY_DEPENDENCY');
  });

  it('computes per-cluster Red/Amber counts and total slip days independent of portfolio-wide totals', () => {
    const result = buildScheduleTriage(
      [
        project({ id: 'a', healthScope: 'Red', phases: sixPhases({ build: { status: 'delayed' } }) }),
        project({
          id: 'b',
          healthScope: 'Red',
          phases: sixPhases({ build: { status: 'inprogress', plannedEnd: '2026-08-01T00:00:00.000Z', actualEnd: '2026-08-08T00:00:00.000Z' } }),
        }),
      ],
      NOW
    );
    const cluster = result.clusters.find((c) => c.theme === 'SCOPE_EXPANSION_SLIPPAGE')!;
    expect(cluster.redCount).toBe(1);
    expect(cluster.amberCount).toBe(1);
    expect(cluster.totalSlipDays).toBe(7);
  });
});
