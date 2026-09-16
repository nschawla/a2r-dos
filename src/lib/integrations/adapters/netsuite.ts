/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * NetSuite adapter — read-only baseline margins, financial actuals, and
 * resource allocation via SuiteTalk REST (`/services/rest/record/v1`).
 * Real NetSuite deployments authenticate via OAuth 1.0a (Token-Based
 * Authentication) or an OAuth2 client-credentials grant, not a bare
 * bearer token — this stub takes a pre-issued access token as `credential`
 * so the read shape is real and testable; wiring the full TBA/OAuth2
 * handshake is a follow-on once a real NetSuite sandbox is available.
 *
 * `config`: { accountId } — e.g. "1234567" (NetSuite account id, used to
 * build the SuiteTalk hostname). `credential`: an access token.
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawFinancialMetric } from '../types';

interface NetSuiteProjectSummary {
  items: {
    id: string;
    companyName: string;
    estimatedGrossProfitPercent: number | null;
    actualCost: number | null;
    actualRevenue: number | null;
    totalHours: number | null;
    startDate: string;
    endDate: string;
  }[];
  hasMore: boolean;
  offset: number;
  count: number;
}

function baseUrl(accountId: string): string {
  return `https://${accountId.replace('_', '-')}.suitetalk.api.netsuite.com/services/rest/record/v1`;
}

export const netsuiteAdapter: BaseAdapter = {
  provider: 'NETSUITE',
  displayName: 'NetSuite',
  dataKind: 'FINANCIAL_METRIC',
  configFields: [{ key: 'accountId', label: 'NetSuite account ID', placeholder: '1234567' }],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    const { config, credential } = auth;
    if (!credential || !config.accountId) return { ok: false, ...notConfiguredError('NETSUITE') };
    const result = await getJson<{ id: string }>('NETSUITE', `${baseUrl(config.accountId)}/-/metadata-catalog`, {
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: `NetSuite account ${config.accountId}` } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.accountId) return { ok: false, ...notConfiguredError('NETSUITE') };
    const offset = cursor ? Number(cursor) || 0 : 0;
    const url = `${baseUrl(config.accountId)}/job?limit=50&offset=${offset}`;
    const result = await getJson<NetSuiteProjectSummary>('NETSUITE', url, {
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    const records: RawFinancialMetric[] = body.items.map((p) => ({
      kind: 'FINANCIAL_METRIC',
      externalId: p.id,
      sourceLabel: p.companyName,
      baselineMarginPct: p.estimatedGrossProfitPercent,
      actualCost: p.actualCost,
      actualRevenue: p.actualRevenue,
      allocatedHours: p.totalHours,
      periodStart: p.startDate,
      periodEnd: p.endDate,
    }));
    const nextCursor = body.hasMore ? String(body.offset + body.count) : null;
    return { ok: true, value: { records, nextCursor, rateLimitRemaining, rateLimitResetAt } };
  },
};
