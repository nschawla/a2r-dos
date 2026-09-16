/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Display names only — split out from registry.ts so errors.ts (which
 * needs a human name for a provider) doesn't have to import the adapter
 * instances themselves and their HTTP client code.
 */
import type { IntegrationProvider } from '@prisma/client';

export const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  JIRA: 'Jira',
  ASANA: 'Asana',
  MONDAY: 'Monday.com',
  NETSUITE: 'NetSuite',
  CERTINIA: 'Certinia',
  KANTATA: 'Kantata',
  OPENAIR: 'OpenAir',
  SALESFORCE: 'Salesforce',
};
