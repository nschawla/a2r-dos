/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Client-safe provider metadata — the display label, data kind, and
 * non-secret config field list for the Ops Console "add a connection"
 * form. Deliberately separate from registry.ts, which wires up the real
 * adapters (HTTP clients, node-only bits like Buffer in the Jira driver) —
 * a client component only ever needs this plain data, never the adapters
 * themselves.
 */
import type { IntegrationDataKind, IntegrationProvider } from './types';

export interface ProviderMeta {
  provider: IntegrationProvider;
  label: string;
  dataKind: IntegrationDataKind;
  configFields: ReadonlyArray<{ key: string; label: string; placeholder: string }>;
}

export const PROVIDER_META: readonly ProviderMeta[] = [
  {
    provider: 'JIRA',
    label: 'Jira',
    dataKind: 'DELIVERY_METRIC',
    configFields: [
      { key: 'baseUrl', label: 'Site URL', placeholder: 'https://acme.atlassian.net' },
      { key: 'email', label: 'Account email', placeholder: 'integrations@acme.com' },
      { key: 'projectKey', label: 'Project key', placeholder: 'DEL' },
    ],
  },
  {
    provider: 'ASANA',
    label: 'Asana',
    dataKind: 'DELIVERY_METRIC',
    configFields: [{ key: 'projectGid', label: 'Project GID', placeholder: '1206...' }],
  },
  {
    provider: 'MONDAY',
    label: 'Monday.com',
    dataKind: 'DELIVERY_METRIC',
    configFields: [{ key: 'boardId', label: 'Board ID', placeholder: '1234567890' }],
  },
  {
    provider: 'NETSUITE',
    label: 'NetSuite',
    dataKind: 'FINANCIAL_METRIC',
    configFields: [{ key: 'accountId', label: 'NetSuite account ID', placeholder: '1234567' }],
  },
  {
    provider: 'CERTINIA',
    label: 'Certinia',
    dataKind: 'FINANCIAL_METRIC',
    configFields: [
      { key: 'instanceUrl', label: 'Salesforce instance URL', placeholder: 'https://acme.my.salesforce.com' },
      { key: 'apiVersion', label: 'API version', placeholder: 'v59.0' },
    ],
  },
  {
    provider: 'KANTATA',
    label: 'Kantata',
    dataKind: 'FINANCIAL_METRIC',
    configFields: [],
  },
  {
    provider: 'OPENAIR',
    label: 'OpenAir',
    dataKind: 'FINANCIAL_METRIC',
    configFields: [{ key: 'companyId', label: 'Company ID', placeholder: '1' }],
  },
  {
    provider: 'SALESFORCE',
    label: 'Salesforce',
    dataKind: 'PIPELINE_RECORD',
    configFields: [
      { key: 'instanceUrl', label: 'Salesforce instance URL', placeholder: 'https://acme.my.salesforce.com' },
      { key: 'apiVersion', label: 'API version', placeholder: 'v59.0' },
    ],
  },
];

export const PROVIDER_META_BY_KEY: Record<IntegrationProvider, ProviderMeta> = Object.fromEntries(
  PROVIDER_META.map((m) => [m.provider, m]),
) as Record<IntegrationProvider, ProviderMeta>;
