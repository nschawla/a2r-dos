/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Kantata (formerly Mavenlink) adapter — read-only baseline margins,
 * financial actuals, and resource allocation via the REST API
 * (`api.mavenlink.com/api/v1`). Auth: a Bearer OAuth2 access token.
 *
 * `config`: none required beyond the credential itself (Kantata scopes a
 * token to a single workspace at issuance).
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawFinancialMetric } from '../types';

const BASE_URL = 'https://api.mavenlink.com/api/v1';

interface KantataMe {
  results: { id: string }[];
  workspaces: Record<string, { name: string }>;
}

interface KantataWorkspace {
  id: string;
  title: string;
  budget_at_risk: boolean;
  margin_target: number | null;
  actual_cost: number | null;
  billable_amount_earned: number | null;
  original_estimated_hours: number | null;
  start_date: string;
  due_date: string;
}

interface KantataWorkspacesResponse {
  results: { id: string }[];
  workspaces: Record<string, KantataWorkspace>;
  meta: { page_offset: number; page_size: number; count: number };
}

export const kantataAdapter: BaseAdapter = {
  provider: 'KANTATA',
  displayName: 'Kantata',
  dataKind: 'FINANCIAL_METRIC',
  configFields: [],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    if (!auth.credential) return { ok: false, ...notConfiguredError('KANTATA') };
    const result = await getJson<KantataMe>('KANTATA', `${BASE_URL}/users/me.json`, {
      headers: { Authorization: `Bearer ${auth.credential}` },
    });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: 'Kantata workspace' } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    if (!auth.credential) return { ok: false, ...notConfiguredError('KANTATA') };
    const offset = cursor ? Number(cursor) || 0 : 0;
    const url = `${BASE_URL}/workspaces.json?page_size=50&page_offset=${offset}`;
    const result = await getJson<KantataWorkspacesResponse>('KANTATA', url, {
      headers: { Authorization: `Bearer ${auth.credential}` },
    });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    const records: RawFinancialMetric[] = body.results.map(({ id }) => {
      const w = body.workspaces[id]!;
      return {
        kind: 'FINANCIAL_METRIC',
        externalId: w.id,
        sourceLabel: w.title,
        baselineMarginPct: w.margin_target,
        actualCost: w.actual_cost,
        actualRevenue: w.billable_amount_earned,
        allocatedHours: w.original_estimated_hours,
        periodStart: w.start_date,
        periodEnd: w.due_date,
      };
    });
    const nextOffset = body.meta.page_offset + body.results.length;
    const nextCursor = nextOffset < body.meta.count ? String(nextOffset) : null;
    return { ok: true, value: { records, nextCursor, rateLimitRemaining, rateLimitResetAt } };
  },
};
