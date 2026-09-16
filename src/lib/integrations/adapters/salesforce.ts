/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Salesforce adapter — read-only pipeline book of business and deal
 * stages via the REST API's SOQL query endpoint
 * (`/services/data/vXX.0/query`). Strictly a `query`, never `sobjects`
 * DML — the read/write boundary this whole framework enforces.
 *
 * `config`: { instanceUrl, apiVersion }. `credential`: an OAuth access
 * token (from a Connected App's client-credentials or refresh-token flow —
 * out of scope here; this adapter takes an already-issued token).
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawPipelineRecord } from '../types';

interface SoqlOpportunityRow {
  Id: string;
  Account: { Name: string } | null;
  StageName: string;
  Amount: number | null;
  CloseDate: string | null;
  Probability: number | null;
}

interface SoqlResponse {
  records: SoqlOpportunityRow[];
  nextRecordsUrl?: string;
  done: boolean;
}

const SOQL = 'SELECT Id, Account.Name, StageName, Amount, CloseDate, Probability FROM Opportunity WHERE IsClosed = false';

export const salesforceAdapter: BaseAdapter = {
  provider: 'SALESFORCE',
  displayName: 'Salesforce',
  dataKind: 'PIPELINE_RECORD',
  configFields: [
    { key: 'instanceUrl', label: 'Salesforce instance URL', placeholder: 'https://acme.my.salesforce.com' },
    { key: 'apiVersion', label: 'API version', placeholder: 'v59.0' },
  ],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    const { config, credential } = auth;
    if (!credential || !config.instanceUrl || !config.apiVersion) return { ok: false, ...notConfiguredError('SALESFORCE') };
    const url = `${config.instanceUrl}/services/data/${config.apiVersion}/query?q=${encodeURIComponent('SELECT Id FROM Opportunity LIMIT 1')}`;
    const result = await getJson<SoqlResponse>('SALESFORCE', url, { headers: { Authorization: `Bearer ${credential}` } });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: config.instanceUrl } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.instanceUrl || !config.apiVersion) return { ok: false, ...notConfiguredError('SALESFORCE') };
    const url = cursor
      ? `${config.instanceUrl}${cursor}`
      : `${config.instanceUrl}/services/data/${config.apiVersion}/query?q=${encodeURIComponent(SOQL)}`;
    const result = await getJson<SoqlResponse>('SALESFORCE', url, { headers: { Authorization: `Bearer ${credential}` } });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    const records: RawPipelineRecord[] = body.records.map((r) => ({
      kind: 'PIPELINE_RECORD',
      externalId: r.Id,
      accountName: r.Account?.Name ?? 'Unknown account',
      stage: r.StageName,
      amount: r.Amount,
      closeDate: r.CloseDate,
      probability: r.Probability,
    }));
    return {
      ok: true,
      value: { records, nextCursor: body.done ? null : (body.nextRecordsUrl ?? null), rateLimitRemaining, rateLimitResetAt },
    };
  },
};
