import { describe, it, expect } from 'vitest';
import { resolveCommand } from '../src/lib/command-center/commands';
import { relativeTime } from '../src/lib/relative-time';

const PROJECTS = [
  { id: 'p1', name: 'Acme Health — Data Platform Modernization' },
  { id: 'p2', name: 'Northwind Supply Chain Control Tower' },
];
const ctx = (isStaff = false) => ({ projects: PROJECTS, isStaff });

describe('resolveCommand', () => {
  it('returns default destinations for an empty query', () => {
    const out = resolveCommand('', ctx());
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.action.type === 'navigate')).toBe(true);
    expect(out.map((s) => s.label)).toContain('Command Center');
  });

  it('resolves a bare destination keyword', () => {
    const out = resolveCommand('raid', ctx());
    expect(out[0]).toMatchObject({ kind: 'nav', action: { type: 'navigate', href: '/raid' } });
  });

  it('strips a leading verb', () => {
    const out = resolveCommand('go to capacity', ctx());
    expect(out.some((s) => s.action.type === 'navigate' && s.action.href === '/capacity')).toBe(true);
  });

  it('resolves "<module> for <engagement>" to the scoped route', () => {
    const out = resolveCommand('financials for acme', ctx());
    expect(out[0]).toMatchObject({
      kind: 'engagement',
      action: { type: 'navigate', href: '/financials/p1' },
    });
  });

  it('matches an engagement by fuzzy name', () => {
    const out = resolveCommand('northwind', ctx());
    expect(out.some((s) => s.action.type === 'navigate' && s.action.href === '/commercial-baseline/p2')).toBe(true);
  });

  it('exposes the sign-out and search actions', () => {
    expect(resolveCommand('sign out', ctx())[0]).toMatchObject({ action: { type: 'signout' } });
    expect(resolveCommand('search', ctx())[0]).toMatchObject({ action: { type: 'search' } });
  });

  it('gates the Ops Console command on staff', () => {
    expect(resolveCommand('ops console', ctx(false)).some((s) => s.label === 'A2R Ops Console')).toBe(false);
    expect(resolveCommand('ops console', ctx(true)).some((s) => s.label === 'A2R Ops Console')).toBe(true);
  });

  it('caps suggestions', () => {
    expect(resolveCommand('a', ctx(true)).length).toBeLessThanOrEqual(7);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');
  it('formats recent deltas compactly', () => {
    expect(relativeTime('2026-09-03T11:59:40.000Z', now)).toBe('just now');
    expect(relativeTime('2026-09-03T11:45:00.000Z', now)).toBe('15m');
    expect(relativeTime('2026-09-03T09:00:00.000Z', now)).toBe('3h');
    expect(relativeTime('2026-09-01T12:00:00.000Z', now)).toBe('2d');
  });
  it('falls back to a short date past a week', () => {
    expect(relativeTime('2026-08-01T12:00:00.000Z', now)).toBe('Aug 1');
    expect(relativeTime('2025-12-25T12:00:00.000Z', now)).toBe('Dec 25, 2025');
  });
  it('is safe on bad input', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});
