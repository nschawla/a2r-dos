import { describe, it, expect } from 'vitest';
import {
  buildCommandKItems,
  groupCommandKItems,
  type CommandKEntities,
} from '../src/lib/command-center/command-k-results';

const ENTITIES: CommandKEntities = {
  isStaff: false,
  projects: [
    { id: 'p1', name: 'Acme Health — Data Platform', client: 'Acme Health', healthCode: 'R' },
    { id: 'p2', name: 'Northwind Control Tower', client: 'Northwind', healthCode: 'G' },
  ],
  resources: [
    { id: 'r1', name: 'Priya Raman', roleName: 'Senior Consultant', practiceName: 'Data & Analytics' },
  ],
  raidAlerts: [
    { id: 'a1', projectId: 'p1', projectName: 'Acme Health — Data Platform', description: 'OCR accuracy below the pilot exit bar', severity: 'CRITICAL' },
  ],
};

describe('buildCommandKItems', () => {
  it('an empty query returns only navigation defaults', () => {
    const items = buildCommandKItems('', ENTITIES);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.section === 'Navigate')).toBe(true);
    expect(items.every((i) => i.action.type === 'navigate')).toBe(true);
  });

  it('a destination keyword resolves to a Navigate item', () => {
    const items = buildCommandKItems('raid', ENTITIES);
    expect(items.some((i) => i.section === 'Navigate' && i.action.type === 'navigate' && i.action.href === '/raid')).toBe(true);
  });

  it('matches an engagement with a health dot', () => {
    const items = buildCommandKItems('northwind', ENTITIES);
    const eng = items.find((i) => i.section === 'Engagements');
    expect(eng).toMatchObject({ label: 'Northwind Control Tower', dot: 'good', action: { type: 'navigate', href: '/commercial-baseline/p2' } });
  });

  it('surfaces people and escalated risks', () => {
    const people = buildCommandKItems('priya', ENTITIES);
    expect(people.find((i) => i.section === 'People')).toMatchObject({ label: 'Priya Raman', action: { type: 'navigate', href: '/admin' } });

    const risks = buildCommandKItems('ocr accuracy', ENTITIES);
    const risk = risks.find((i) => i.section === 'Risks');
    expect(risk).toMatchObject({ dot: 'critical', action: { type: 'navigate', href: '/raid/p1' } });
  });

  it('does not run entity search for a 1-char query', () => {
    const items = buildCommandKItems('a', ENTITIES);
    expect(items.every((i) => i.section === 'Navigate' || i.section === 'Actions' || i.section === 'Engagements')).toBe(true);
    expect(items.some((i) => i.section === 'People' || i.section === 'Risks')).toBe(false);
  });

  it('honours the limit', () => {
    expect(buildCommandKItems('a', ENTITIES, 3)).toHaveLength(3);
  });

  it('gates the Ops Console command on staff', () => {
    expect(buildCommandKItems('ops', { ...ENTITIES, isStaff: false }).some((i) => i.label === 'A2R Ops Console')).toBe(false);
    expect(buildCommandKItems('ops', { ...ENTITIES, isStaff: true }).some((i) => i.label === 'A2R Ops Console')).toBe(true);
  });
});

describe('groupCommandKItems', () => {
  it('groups by section, preserving first-seen order', () => {
    const groups = groupCommandKItems(buildCommandKItems('acme', ENTITIES));
    const names = groups.map((g) => g.section);
    expect(names).toEqual([...new Set(names)]); // no duplicate section headers
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
  });
});
