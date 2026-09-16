/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The provider → adapter lookup. Every driver in src/lib/integrations/
 * adapters/*.ts is registered here exactly once; the sync runner and the
 * Ops Console "add a connection" form both read from this instead of
 * switching on `IntegrationProvider` themselves.
 */
import type { IntegrationProvider } from '@prisma/client';
import type { BaseAdapter } from './types';
import { jiraAdapter } from './adapters/jira';
import { asanaAdapter } from './adapters/asana';
import { mondayAdapter } from './adapters/monday';
import { netsuiteAdapter } from './adapters/netsuite';
import { certiniaAdapter } from './adapters/certinia';
import { kantataAdapter } from './adapters/kantata';
import { openairAdapter } from './adapters/openair';
import { salesforceAdapter } from './adapters/salesforce';

export const ADAPTERS: Record<IntegrationProvider, BaseAdapter> = {
  JIRA: jiraAdapter,
  ASANA: asanaAdapter,
  MONDAY: mondayAdapter,
  NETSUITE: netsuiteAdapter,
  CERTINIA: certiniaAdapter,
  KANTATA: kantataAdapter,
  OPENAIR: openairAdapter,
  SALESFORCE: salesforceAdapter,
};

export function adapterFor(provider: IntegrationProvider): BaseAdapter {
  return ADAPTERS[provider];
}

export { PROVIDER_LABEL } from './registry-labels';
