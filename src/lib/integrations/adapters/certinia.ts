/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Certinia (formerly FinancialForce PSA) adapter — read-only baseline
 * margins, financial actuals, and resource allocation. Certinia runs on
 * the Salesforce platform, so its REST surface IS the Salesforce REST API
 * (`/services/data/vXX.0/query`) against Certinia's own PSA objects
 * (`pse__Proj__c`, etc.) via SOQL — read-only by construction, since this
 * only ever issues `query`, never a DML `sobjects` write call.
 *
 * `config`: { instanceUrl, apiVersion } — e.g. instanceUrl
 * "https://acme.my.salesforce.com", apiVersion "v59.0". `credential`: a
 * Salesforce OAuth access token.
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawFinancialMetric } from '../types';

interface SoqlProjectRow {
  Id: string;
  Name: string;
  pse__Gross_Margin_Percent__c: number | null;
  pse__Actual_Cost__c: number | null;
  pse__Actual_Revenue__c: number | null;
  pse__Estimated_Hours__c: number | null;
  pse__Start_Date__c: string;
  pse__End_Date__c: string;
}

interface SoqlResponse {
  records: SoqlProjectRow[];
  nextRecordsUrl?: string;
  done: boolean;
}

const SOQL =
  'SELECT Id, Name, pse__Gross_Margin_Percent__c, pse__Actual_Cost__c, pse__Actual_Revenue__c, ' +
  'pse__Estimated_Hours__c, pse__Start_Date__c, pse__End_Date__c FROM pse__Proj__c';

export const certiniaAdapter: BaseAdapter = {
  provider: 'CERTINIA',
  displayName: 'Certinia',
  dataKind: 'FINANCIAL_METRIC',
  configFields: [
    { key: 'instanceUrl', label: 'Salesforce instance URL', placeholder: 'https://acme.my.salesforce.com' },
    { key: 'apiVersion', label: 'API version', placeholder: 'v59.0' },
  ],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    const { config, credential } = auth;
    if (!credential || !config.instanceUrl || !config.apiVersion) return { ok: false, ...notConfiguredError('CERTINIA') };
    const url = `${config.instanceUrl}/services/data/${config.apiVersion}/query?q=${encodeURIComponent('SELECT Id FROM pse__Proj__c LIMIT 1')}`;
    const result = await getJson<SoqlResponse>('CERTINIA', url, { headers: { Authorization: `Bearer ${credential}` } });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: config.instanceUrl } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.instanceUrl || !config.apiVersion) return { ok: false, ...notConfiguredError('CERTINIA') };
    const url = cursor
      ? `${config.instanceUrl}${cursor}`
      : `${config.instanceUrl}/services/data/${config.apiVersion}/query?q=${encodeURIComponent(SOQL)}`;
    const result = await getJson<SoqlResponse>('CERTINIA', url, { headers: { Authorization: `Bearer ${credential}` } });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    const records: RawFinancialMetric[] = body.records.map((r) => ({
      kind: 'FINANCIAL_METRIC',
      externalId: r.Id,
      sourceLabel: r.Name,
      baselineMarginPct: r.pse__Gross_Margin_Percent__c,
      actualCost: r.pse__Actual_Cost__c,
      actualRevenue: r.pse__Actual_Revenue__c,
      allocatedHours: r.pse__Estimated_Hours__c,
      periodStart: r.pse__Start_Date__c,
      periodEnd: r.pse__End_Date__c,
    }));
    return {
      ok: true,
      value: { records, nextCursor: body.done ? null : (body.nextRecordsUrl ?? null), rateLimitRemaining, rateLimitResetAt },
    };
  },
};
