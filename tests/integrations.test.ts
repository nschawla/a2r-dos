import { describe, expect, it } from 'vitest';
import { normalizeRecords } from '../src/lib/integrations/normalize';
import { classifyHttpError, classifyThrown, classifySchemaMismatch, notConfiguredError } from '../src/lib/integrations/errors';
import { ADAPTERS, adapterFor, PROVIDER_LABEL } from '../src/lib/integrations/registry';
import { PROVIDER_META, PROVIDER_META_BY_KEY } from '../src/lib/integrations/provider-meta';
import type { IntegrationProvider } from '../src/lib/integrations/types';

const ALL_PROVIDERS: IntegrationProvider[] = [
  'JIRA', 'ASANA', 'MONDAY', 'NETSUITE', 'CERTINIA', 'KANTATA', 'OPENAIR', 'SALESFORCE',
];

describe('normalize.ts — the Normalization Layer runtime shape-guard', () => {
  it('accepts a well-formed record of each kind', () => {
    const delivery = {
      kind: 'DELIVERY_METRIC', externalId: 'DEL-1', sourceLabel: 'DEL', sprintOrPeriod: null,
      velocityPoints: 12, issuesOpen: 3, issuesClosed: 7, milestoneStatus: 'ON_TRACK',
      observedAt: new Date().toISOString(),
    };
    const financial = {
      kind: 'FINANCIAL_METRIC', externalId: 'F-1', sourceLabel: 'Acme', baselineMarginPct: 32.5,
      actualCost: 10000, actualRevenue: 15000, allocatedHours: 400,
      periodStart: '2026-01-01', periodEnd: '2026-03-31',
    };
    const pipeline = {
      kind: 'PIPELINE_RECORD', externalId: 'OPP-1', accountName: 'Acme', stage: 'Negotiation',
      amount: 50000, closeDate: '2026-06-01', probability: 60,
    };
    expect(normalizeRecords([delivery])).toEqual({ ok: true, records: [delivery] });
    expect(normalizeRecords([financial])).toEqual({ ok: true, records: [financial] });
    expect(normalizeRecords([pipeline])).toEqual({ ok: true, records: [pipeline] });
  });

  it('accepts an empty page', () => {
    expect(normalizeRecords([])).toEqual({ ok: true, records: [] });
  });

  it('rejects a record missing a required field, naming the bad index', () => {
    const bad = { kind: 'DELIVERY_METRIC', externalId: 'X' }; // missing everything else
    const result = normalizeRecords([{ kind: 'DELIVERY_METRIC', externalId: 'ok', sourceLabel: 'ok', sprintOrPeriod: null, velocityPoints: null, issuesOpen: 0, issuesClosed: 0, milestoneStatus: 'ON_TRACK', observedAt: new Date().toISOString() }, bad]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.badIndex).toBe(1);
  });

  it('rejects an unrecognized `kind`', () => {
    const result = normalizeRecords([{ kind: 'NOT_A_REAL_KIND' }]);
    expect(result.ok).toBe(false);
  });

  it('rejects a record with an extra, unexpected field (strict shape)', () => {
    const result = normalizeRecords([
      { kind: 'PIPELINE_RECORD', externalId: 'X', accountName: 'Acme', stage: 'Won', amount: null, closeDate: null, probability: null, extraField: 'not allowed' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects a probability outside 0-100', () => {
    const result = normalizeRecords([
      { kind: 'PIPELINE_RECORD', externalId: 'X', accountName: 'Acme', stage: 'Won', amount: null, closeDate: null, probability: 150 },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('errors.ts — categorized, human-readable translation', () => {
  it('401/403 → AUTH_EXPIRED, naming the provider', () => {
    const r = classifyHttpError('JIRA', 401);
    expect(r.category).toBe('AUTH_EXPIRED');
    expect(r.humanMessage).toContain('Jira');
    expect(r.humanMessage).toMatch(/token expired|lacks read scope/i);
  });

  it('429 → RATE_LIMITED, with the Retry-After minutes in the message', () => {
    const r = classifyHttpError('NETSUITE', 429, 900); // 900s = 15min
    expect(r.category).toBe('RATE_LIMITED');
    expect(r.humanMessage).toContain('NetSuite');
    expect(r.humanMessage).toContain('15 minute');
  });

  it('429 with no Retry-After falls back to a 15-minute default', () => {
    const r = classifyHttpError('SALESFORCE', 429, null);
    expect(r.humanMessage).toContain('15 minute');
  });

  it('5xx → NETWORK_TIMEOUT (transient, will retry)', () => {
    const r = classifyHttpError('ASANA', 503);
    expect(r.category).toBe('NETWORK_TIMEOUT');
  });

  it('404 → SCHEMA_MISMATCH (the configured project/board is gone)', () => {
    const r = classifyHttpError('MONDAY', 404);
    expect(r.category).toBe('SCHEMA_MISMATCH');
  });

  it('an unrecognized status → UNKNOWN', () => {
    const r = classifyHttpError('KANTATA', 418);
    expect(r.category).toBe('UNKNOWN');
  });

  it('a thrown timeout/AbortError → NETWORK_TIMEOUT', () => {
    const r = classifyThrown('OPENAIR', new Error('The operation was aborted (AbortError)'));
    expect(r.category).toBe('NETWORK_TIMEOUT');
  });

  it('a thrown DNS/connection error → NETWORK_TIMEOUT with the "couldn\'t reach" framing', () => {
    const r = classifyThrown('CERTINIA', new Error('getaddrinfo ENOTFOUND acme.my.salesforce.com'));
    expect(r.category).toBe('NETWORK_TIMEOUT');
    expect(r.humanMessage).toMatch(/couldn.t reach/i);
  });

  it('Node/undici\'s wrapped "fetch failed" (real cause nested in .cause) still classifies correctly', () => {
    const cause = new Error('getaddrinfo ENOTFOUND bogus.invalid');
    const wrapped = new TypeError('fetch failed', { cause });
    const r = classifyThrown('NETSUITE', wrapped);
    expect(r.category).toBe('NETWORK_TIMEOUT');
  });

  it('an unrecognized thrown error → UNKNOWN, with the message included', () => {
    const r = classifyThrown('JIRA', new Error('something truly unexpected'));
    expect(r.category).toBe('UNKNOWN');
    expect(r.humanMessage).toContain('something truly unexpected');
  });

  it('classifySchemaMismatch always categorizes SCHEMA_MISMATCH', () => {
    expect(classifySchemaMismatch('JIRA', 'missing field foo').category).toBe('SCHEMA_MISMATCH');
  });

  it('notConfiguredError tells the operator what to do next', () => {
    const r = notConfiguredError('SALESFORCE');
    expect(r.humanMessage).toMatch(/no api credential/i);
    expect(r.humanMessage).toMatch(/retry sync/i);
  });
});

describe('registry.ts — every provider has a real, distinct adapter', () => {
  it('ADAPTERS covers exactly the 8 providers', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...ALL_PROVIDERS].sort());
  });

  it('every adapter\'s own `provider` field matches its registry key', () => {
    for (const p of ALL_PROVIDERS) {
      expect(adapterFor(p).provider).toBe(p);
    }
  });

  it('every adapter exposes exactly testConnection + pull — no write method', () => {
    for (const p of ALL_PROVIDERS) {
      const adapter = adapterFor(p);
      expect(typeof adapter.testConnection).toBe('function');
      expect(typeof adapter.pull).toBe('function');
      // read-only by construction: no push/write/update/create/mutate/delete method
      const forbidden = ['push', 'write', 'update', 'create', 'mutate', 'delete', 'post', 'put'];
      for (const key of forbidden) {
        expect(key in adapter, `${p} adapter must not expose "${key}"`).toBe(false);
      }
    }
  });

  it('PROVIDER_LABEL has a name for every provider', () => {
    for (const p of ALL_PROVIDERS) expect(PROVIDER_LABEL[p]).toBeTruthy();
  });

  it('with no credential configured, every adapter refuses cleanly (no network call)', async () => {
    for (const p of ALL_PROVIDERS) {
      const adapter = adapterFor(p);
      const testResult = await adapter.testConnection({ config: {}, credential: null });
      expect(testResult.ok).toBe(false);
      const pullResult = await adapter.pull({ config: {}, credential: null });
      expect(pullResult.ok).toBe(false);
    }
  });
});

describe('provider-meta.ts stays in sync with the real adapters (registry.ts)', () => {
  it('has a client-safe entry for every provider, matching the real adapter', () => {
    expect(PROVIDER_META.map((m) => m.provider).sort()).toEqual([...ALL_PROVIDERS].sort());
    for (const p of ALL_PROVIDERS) {
      const real = adapterFor(p);
      const meta = PROVIDER_META_BY_KEY[p];
      expect(meta.label).toBe(real.displayName);
      expect(meta.dataKind).toBe(real.dataKind);
      expect(meta.configFields.map((f) => f.key)).toEqual(real.configFields.map((f) => f.key));
    }
  });
});
