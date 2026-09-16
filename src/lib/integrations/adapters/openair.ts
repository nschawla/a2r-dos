/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * NetSuite OpenAir adapter — read-only baseline margins, financial
 * actuals, and resource allocation via OpenAir's REST API
 * (`www.openair.com/api/v1`). OpenAir's REST surface is still maturing
 * alongside its legacy XML API; this stub targets the REST endpoints with
 * a Bearer access token, matching the same shape as the other financial
 * adapters — swap in the XML API client here if a tenant's OpenAir
 * instance predates REST support.
 *
 * `config`: { companyId }. `credential`: an access token.
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawFinancialMetric } from '../types';

const BASE_URL = 'https://www.openair.com/api/v1';

interface OpenAirProject {
  id: string;
  name: string;
  margin_percent: number | null;
  actual_cost: number | null;
  actual_billable_amount: number | null;
  budget_hours: number | null;
  start_date: string;
  end_date: string;
}

interface OpenAirProjectsResponse {
  data: OpenAirProject[];
  meta: { next_cursor: string | null };
}

export const openairAdapter: BaseAdapter = {
  provider: 'OPENAIR',
  displayName: 'OpenAir',
  dataKind: 'FINANCIAL_METRIC',
  configFields: [{ key: 'companyId', label: 'Company ID', placeholder: '1' }],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    const { config, credential } = auth;
    if (!credential || !config.companyId) return { ok: false, ...notConfiguredError('OPENAIR') };
    const result = await getJson<{ data: unknown }>('OPENAIR', `${BASE_URL}/companies/${config.companyId}`, {
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: `OpenAir company ${config.companyId}` } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.companyId) return { ok: false, ...notConfiguredError('OPENAIR') };
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const url = `${BASE_URL}/companies/${config.companyId}/projects?limit=50${cursorParam}`;
    const result = await getJson<OpenAirProjectsResponse>('OPENAIR', url, {
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    const records: RawFinancialMetric[] = body.data.map((p) => ({
      kind: 'FINANCIAL_METRIC',
      externalId: p.id,
      sourceLabel: p.name,
      baselineMarginPct: p.margin_percent,
      actualCost: p.actual_cost,
      actualRevenue: p.actual_billable_amount,
      allocatedHours: p.budget_hours,
      periodStart: p.start_date,
      periodEnd: p.end_date,
    }));
    return { ok: true, value: { records, nextCursor: body.meta.next_cursor, rateLimitRemaining, rateLimitResetAt } };
  },
};
