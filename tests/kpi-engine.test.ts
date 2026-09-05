import { describe, expect, it } from 'vitest';
import { evaluateKpiStatus, evaluateKpi, readMetricValue, validateKpiDefinition, type KpiMetricValues } from '@/lib/kpi-engine';
import { KPI_METRICS, metricsForSource, getMetricDef, KPI_DATA_SOURCES, type CustomKpiDef, type CustomKpiInput } from '@/types/kpi';

function kpi(overrides: Partial<CustomKpiDef> = {}): CustomKpiDef {
  return {
    id: 'kpi-1',
    name: 'Test KPI',
    dataSource: 'FINANCIALS',
    metricKey: 'blendedMarginPct',
    formulaType: 'DIRECT',
    targetValue: 30,
    warningValue: 20,
    targetPersonas: ['EXECUTIVE_BOARD'] as CustomKpiDef['targetPersonas'],
    ...overrides,
  };
}

describe('KPI_METRICS catalog', () => {
  it('covers all 4 data sources with exactly 2 metrics each', () => {
    for (const source of KPI_DATA_SOURCES) {
      expect(metricsForSource(source)).toHaveLength(2);
    }
    expect(KPI_METRICS).toHaveLength(8);
  });

  it('every metric key is unique and resolvable via getMetricDef', () => {
    const keys = KPI_METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(getMetricDef(key)?.key).toBe(key);
  });

  it('getMetricDef returns undefined for an unknown key', () => {
    expect(getMetricDef('not-a-real-metric')).toBeUndefined();
  });
});

describe('readMetricValue', () => {
  it('reads a present finite number', () => {
    expect(readMetricValue('blendedMarginPct', { blendedMarginPct: 37.5 })).toBe(37.5);
  });

  it('treats a missing key, an explicit null, and NaN/Infinity all as null', () => {
    const values: KpiMetricValues = { blendedMarginPct: null };
    expect(readMetricValue('blendedMarginPct', {})).toBeNull();
    expect(readMetricValue('blendedMarginPct', values)).toBeNull();
    expect(readMetricValue('overloadedResourceCount', { overloadedResourceCount: NaN })).toBeNull();
  });
});

describe('evaluateKpiStatus', () => {
  describe('DIRECT (higher is better)', () => {
    const def = { formulaType: 'DIRECT' as const, targetValue: 30, warningValue: 20 };

    it('at or above target is on-track', () => {
      expect(evaluateKpiStatus(def, 30)).toBe('on-track');
      expect(evaluateKpiStatus(def, 45)).toBe('on-track');
    });

    it('between warning and target is at-risk', () => {
      expect(evaluateKpiStatus(def, 25)).toBe('at-risk');
      expect(evaluateKpiStatus(def, 20)).toBe('at-risk');
    });

    it('below warning is critical', () => {
      expect(evaluateKpiStatus(def, 19.9)).toBe('critical');
      expect(evaluateKpiStatus(def, -5)).toBe('critical');
    });
  });

  describe('INVERSE (lower is better)', () => {
    const def = { formulaType: 'INVERSE' as const, targetValue: 2, warningValue: 5 };

    it('at or below target is on-track', () => {
      expect(evaluateKpiStatus(def, 0)).toBe('on-track');
      expect(evaluateKpiStatus(def, 2)).toBe('on-track');
    });

    it('between target and warning is at-risk', () => {
      expect(evaluateKpiStatus(def, 3)).toBe('at-risk');
      expect(evaluateKpiStatus(def, 5)).toBe('at-risk');
    });

    it('above warning is critical', () => {
      expect(evaluateKpiStatus(def, 6)).toBe('critical');
      expect(evaluateKpiStatus(def, 100)).toBe('critical');
    });
  });

  it('a null value always reads as no-data, regardless of thresholds', () => {
    expect(evaluateKpiStatus({ formulaType: 'DIRECT', targetValue: 30, warningValue: 20 }, null)).toBe('no-data');
    expect(evaluateKpiStatus({ formulaType: 'INVERSE', targetValue: 2, warningValue: 5 }, null)).toBe('no-data');
  });
});

describe('evaluateKpi', () => {
  it('reads the KPI’s bound metric and evaluates it in one step', () => {
    const values: KpiMetricValues = { blendedMarginPct: 35 };
    const result = evaluateKpi(kpi(), values);
    expect(result.value).toBe(35);
    expect(result.status).toBe('on-track');
    expect(result.kpi.id).toBe('kpi-1');
  });

  it('reports no-data when the bound metric was never computed for this dashboard', () => {
    const result = evaluateKpi(kpi({ metricKey: 'overloadedResourceCount' }), {});
    expect(result.value).toBeNull();
    expect(result.status).toBe('no-data');
  });

  it('an INVERSE-direction KPI on a count metric evaluates correctly end-to-end', () => {
    const overloadedKpi = kpi({
      dataSource: 'CAPACITY',
      metricKey: 'overloadedResourceCount',
      formulaType: 'INVERSE',
      targetValue: 0,
      warningValue: 2,
    });
    expect(evaluateKpi(overloadedKpi, { overloadedResourceCount: 0 }).status).toBe('on-track');
    expect(evaluateKpi(overloadedKpi, { overloadedResourceCount: 1 }).status).toBe('at-risk');
    expect(evaluateKpi(overloadedKpi, { overloadedResourceCount: 5 }).status).toBe('critical');
  });
});

describe('validateKpiDefinition', () => {
  function input(overrides: Partial<CustomKpiInput> = {}): CustomKpiInput {
    return {
      name: 'Portfolio Margin Health',
      dataSource: 'FINANCIALS',
      metricKey: 'blendedMarginPct',
      formulaType: 'DIRECT',
      targetValue: 30,
      warningValue: 20,
      targetPersonas: ['EXECUTIVE_BOARD'] as CustomKpiInput['targetPersonas'],
      ...overrides,
    };
  }

  it('accepts a well-formed definition', () => {
    expect(validateKpiDefinition(input())).toEqual([]);
  });

  it('requires a name', () => {
    expect(validateKpiDefinition(input({ name: '  ' }))).toContain('Name is required.');
  });

  it('rejects a metric that belongs to a different data source', () => {
    const errors = validateKpiDefinition(input({ dataSource: 'RAID', metricKey: 'blendedMarginPct' }));
    expect(errors.some((e) => e.includes('belongs to FINANCIALS'))).toBe(true);
  });

  it('rejects an unknown metric key', () => {
    const errors = validateKpiDefinition(input({ metricKey: 'not-a-real-metric' as CustomKpiInput['metricKey'] }));
    expect(errors).toContain('Unknown metric.');
  });

  it('requires numeric target and warning values', () => {
    const errors = validateKpiDefinition(input({ targetValue: NaN, warningValue: NaN }));
    expect(errors).toContain('Target value must be a number.');
    expect(errors).toContain('Warning value must be a number.');
  });

  it('rejects a DIRECT KPI whose warning value is above its target', () => {
    const errors = validateKpiDefinition(input({ formulaType: 'DIRECT', targetValue: 20, warningValue: 25 }));
    expect(errors.some((e) => e.includes('higher is better'))).toBe(true);
  });

  it('rejects an INVERSE KPI whose warning value is below its target', () => {
    const errors = validateKpiDefinition(input({ formulaType: 'INVERSE', targetValue: 5, warningValue: 2 }));
    expect(errors.some((e) => e.includes('lower is better'))).toBe(true);
  });

  it('requires at least one target persona', () => {
    expect(validateKpiDefinition(input({ targetPersonas: [] }))).toContain(
      'Choose at least one persona this KPI should render for.'
    );
  });

  it('accumulates every violated rule at once rather than stopping at the first', () => {
    const errors = validateKpiDefinition(
      input({ name: '', targetValue: NaN, warningValue: NaN, targetPersonas: [] })
    );
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
