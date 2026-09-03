/**
 * Unit tests for the Enterprise Governance Hybrid Configuration Model
 * (src/lib/governance/config.ts). Pure, no I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  GOVERNABLE_MODULES,
  HIDEABLE_MODULES,
  GOVERNANCE_TEMPLATES,
  TEMPLATE_ORDER,
  DEFAULT_GOVERNANCE,
  applyTemplate,
  detectTemplate,
  resolveStoredGovernance,
  withOverrides,
  isGovernanceTemplateKey,
  isModuleHidden,
  hiddenHrefs,
  isPathHidden,
} from '../src/lib/governance/config';

describe('module registry', () => {
  it('every template hides only real, hideable module keys', () => {
    const hideable = new Set(HIDEABLE_MODULES.map((m) => m.key));
    for (const key of TEMPLATE_ORDER) {
      for (const mod of GOVERNANCE_TEMPLATES[key].hiddenModules) {
        expect(hideable.has(mod), `${key} → ${mod}`).toBe(true);
      }
    }
  });

  it('core modules are never in the hideable set', () => {
    const core = GOVERNABLE_MODULES.filter((m) => m.core).map((m) => m.key);
    for (const k of core) expect(HIDEABLE_MODULES.some((m) => m.key === k)).toBe(false);
    expect(core).toEqual(expect.arrayContaining(['control-tower', 'admin', 'audit-log']));
  });
});

describe('detectTemplate', () => {
  it('recognises each pre-built template from its settings', () => {
    for (const key of TEMPLATE_ORDER) {
      const t = GOVERNANCE_TEMPLATES[key];
      expect(
        detectTemplate({ hiddenModules: t.hiddenModules, maskFinancialsForDelivery: t.maskFinancialsForDelivery })
      ).toBe(key);
    }
  });

  it('is order-insensitive on hiddenModules', () => {
    const t = GOVERNANCE_TEMPLATES.BOARD_ONLY;
    const shuffled = [...t.hiddenModules].reverse();
    expect(detectTemplate({ hiddenModules: shuffled, maskFinancialsForDelivery: false })).toBe('BOARD_ONLY');
  });

  it('returns CUSTOM when the settings match nothing', () => {
    expect(detectTemplate({ hiddenModules: ['raid'], maskFinancialsForDelivery: false })).toBe('CUSTOM');
    // no bundled template hides raid while also scrubbing financials
    expect(detectTemplate({ hiddenModules: ['raid'], maskFinancialsForDelivery: true })).toBe('CUSTOM');
    // ...whereas empty + masking-on is exactly Strict Financial Governance
    expect(detectTemplate({ hiddenModules: [], maskFinancialsForDelivery: true })).toBe('STRICT_FINANCIAL');
  });

  it('ignores unknown / core keys when matching', () => {
    expect(
      detectTemplate({ hiddenModules: ['not-real', 'admin', 'control-tower'], maskFinancialsForDelivery: false })
    ).toBe('STANDARD');
  });
});

describe('applyTemplate', () => {
  it('produces a resolved config whose template round-trips', () => {
    for (const key of TEMPLATE_ORDER) {
      const resolved = applyTemplate(key);
      expect(resolved.template).toBe(key);
      expect(detectTemplate(resolved)).toBe(key);
    }
  });

  it('STRICT_FINANCIAL and AGILE_DELIVERY scrub financials for delivery', () => {
    expect(applyTemplate('STRICT_FINANCIAL').maskFinancialsForDelivery).toBe(true);
    expect(applyTemplate('AGILE_DELIVERY').maskFinancialsForDelivery).toBe(true);
    expect(applyTemplate('STANDARD').maskFinancialsForDelivery).toBe(false);
    expect(applyTemplate('BOARD_ONLY').maskFinancialsForDelivery).toBe(false);
  });
});

describe('resolveStoredGovernance', () => {
  it('null / undefined → the Standard default', () => {
    expect(resolveStoredGovernance(null)).toEqual(DEFAULT_GOVERNANCE);
    expect(resolveStoredGovernance(undefined)).toEqual(DEFAULT_GOVERNANCE);
  });

  it('sanitises a stored row — drops unknown & core keys, re-derives the template label', () => {
    const resolved = resolveStoredGovernance({
      template: 'STANDARD', // stale label
      hiddenModules: ['commercial-baseline', 'reports', 'admin', 'bogus'],
      maskFinancialsForDelivery: true,
    });
    expect(resolved.hiddenModules).toEqual(['commercial-baseline', 'reports']);
    expect(resolved.template).toBe('AGILE_DELIVERY'); // recomputed from real settings
  });
});

describe('withOverrides', () => {
  it('merges a partial patch and re-derives the template', () => {
    const base = applyTemplate('STANDARD');
    const next = withOverrides(base, { maskFinancialsForDelivery: true });
    expect(next.maskFinancialsForDelivery).toBe(true);
    expect(next.template).toBe('STRICT_FINANCIAL');
  });

  it('drops core keys passed in a patch', () => {
    const next = withOverrides(DEFAULT_GOVERNANCE, { hiddenModules: ['admin', 'raid'] });
    expect(next.hiddenModules).toEqual(['raid']);
  });
});

describe('visibility queries', () => {
  const boardOnly = applyTemplate('BOARD_ONLY');

  it('isModuleHidden respects core immunity', () => {
    expect(isModuleHidden(boardOnly, 'financials')).toBe(true);
    expect(isModuleHidden(boardOnly, 'control-tower')).toBe(false); // core
    expect(isModuleHidden(boardOnly, 'steerco')).toBe(false); // not hidden by this template
    expect(isModuleHidden(DEFAULT_GOVERNANCE, 'financials')).toBe(false);
  });

  it('hiddenHrefs lists the routes to drop from nav', () => {
    const hrefs = hiddenHrefs(applyTemplate('AGILE_DELIVERY'));
    expect(hrefs).toContain('/commercial-baseline');
    expect(hrefs).toContain('/reports');
    expect(hrefs).not.toContain('/'); // control tower is core
  });

  it('isPathHidden matches the deepest owning module', () => {
    expect(isPathHidden(boardOnly, '/financials')).toBe(true);
    expect(isPathHidden(boardOnly, '/financials/abc123')).toBe(true);
    expect(isPathHidden(boardOnly, '/')).toBe(false); // control tower, core
    expect(isPathHidden(boardOnly, '/steerco')).toBe(false);
    expect(isPathHidden(DEFAULT_GOVERNANCE, '/financials/abc')).toBe(false);
  });
});

describe('isGovernanceTemplateKey', () => {
  it('accepts the four template keys, rejects CUSTOM and junk', () => {
    for (const k of TEMPLATE_ORDER) expect(isGovernanceTemplateKey(k)).toBe(true);
    expect(isGovernanceTemplateKey('CUSTOM')).toBe(false);
    expect(isGovernanceTemplateKey('nope')).toBe(false);
    expect(isGovernanceTemplateKey(null)).toBe(false);
  });
});
