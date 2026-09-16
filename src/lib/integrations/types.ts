/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Read-Only External Integration Adapters — the shared types every
 * provider driver (src/lib/integrations/adapters/*.ts) implements against.
 *
 * STRICTLY READ-ONLY BY CONSTRUCTION: `BaseAdapter` exposes exactly two
 * methods, `testConnection` and `pull` — there is no `push`, `update`, or
 * `write` in this interface, and nothing in this directory ever imports an
 * external SDK's write/mutate client. Protecting the external system's
 * data integrity isn't a convention callers have to remember; it's a
 * capability the interface simply never grants. src/lib/integrations/normalize.ts
 * is likewise a one-way street: external shape in, PS-DOS's own normalized
 * shape out, never the reverse.
 *
 * Pure types + a couple of dependency-light pure helpers, same testability
 * contract as src/lib/auth/rbac.ts and src/lib/governance/rbacMatrix.ts —
 * importable from server actions, the sync runner, and the cron route
 * without dragging in `node:http`/Prisma.
 */
import type { IntegrationErrorCategory, IntegrationProvider } from '@prisma/client';

export type { IntegrationErrorCategory, IntegrationProvider };

/** What kind of data a provider's `pull` returns — determines which
 * normalizer (src/lib/integrations/normalize.ts) and which staging area a
 * record lands in. A provider can return more than one kind in principle;
 * every current adapter returns exactly one. */
export type IntegrationDataKind = 'DELIVERY_METRIC' | 'FINANCIAL_METRIC' | 'PIPELINE_RECORD';

export const PROVIDER_DATA_KIND: Record<IntegrationProvider, IntegrationDataKind> = {
  JIRA: 'DELIVERY_METRIC',
  ASANA: 'DELIVERY_METRIC',
  MONDAY: 'DELIVERY_METRIC',
  NETSUITE: 'FINANCIAL_METRIC',
  CERTINIA: 'FINANCIAL_METRIC',
  KANTATA: 'FINANCIAL_METRIC',
  OPENAIR: 'FINANCIAL_METRIC',
  SALESFORCE: 'PIPELINE_RECORD',
};

/** Sprint velocity / issue counts / milestone status — Jira, Asana, Monday. */
export interface RawDeliveryMetric {
  kind: 'DELIVERY_METRIC';
  externalId: string;
  sourceLabel: string; // e.g. the Jira project key, the Asana project name
  sprintOrPeriod: string | null;
  velocityPoints: number | null;
  issuesOpen: number;
  issuesClosed: number;
  milestoneStatus: 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'UNKNOWN';
  observedAt: string; // ISO
}

/** Baseline margins / financial actuals / resource allocation — NetSuite,
 * Certinia, Kantata, OpenAir. */
export interface RawFinancialMetric {
  kind: 'FINANCIAL_METRIC';
  externalId: string;
  sourceLabel: string; // e.g. the NetSuite project/customer name
  baselineMarginPct: number | null;
  actualCost: number | null;
  actualRevenue: number | null;
  allocatedHours: number | null;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
}

/** Pipeline book of business / deal stages — Salesforce. */
export interface RawPipelineRecord {
  kind: 'PIPELINE_RECORD';
  externalId: string;
  accountName: string;
  stage: string;
  amount: number | null;
  closeDate: string | null; // ISO date
  probability: number | null; // 0-100
}

export type RawExternalRecord = RawDeliveryMetric | RawFinancialMetric | RawPipelineRecord;

/** Non-secret, provider-specific connection settings — shape varies per
 * provider (a Jira connection needs a base URL + project key; a Salesforce
 * connection needs an instance URL). Stored as `IntegrationConnection.config`
 * (JSON). Never includes the credential itself — that's sealed separately
 * (`credentialCiphertext`, src/lib/identity/crypto.ts). */
export type AdapterConfig = Record<string, string>;

export interface AdapterAuthInput {
  config: AdapterConfig;
  /** The decrypted credential (API token / key / secret) — held in memory
   * only for the duration of one `testConnection`/`pull` call, never
   * logged, never returned. */
  credential: string | null;
}

export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; category: IntegrationErrorCategory; humanMessage: string; rawDetail?: string };

export interface PullResult {
  records: RawExternalRecord[];
  /** Opaque pagination cursor for the next pull, if the provider paginates
   * and more records remain. `null` means this pull reached the end. */
  nextCursor: string | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null; // ISO
}

/**
 * One provider driver. Every method is a pure READ against the external
 * system — see the file-level doc comment. `pull` and `testConnection` are
 * both expected to make a real HTTP call when `credential` is present;
 * with no credential configured yet, an adapter returns a clear
 * `NOT_CONFIGURED`-flavored `AdapterResult` rather than fabricating data.
 */
export interface BaseAdapter {
  readonly provider: IntegrationProvider;
  readonly displayName: string;
  readonly dataKind: IntegrationDataKind;
  /** Non-secret config fields this provider needs, for the Ops Console
   * "add a connection" form — key, label, placeholder. */
  readonly configFields: ReadonlyArray<{ key: string; label: string; placeholder: string }>;

  /** A cheap, read-only call that proves the credential + config actually
   * authenticate (e.g. Jira's `/rest/api/3/myself`) — no records pulled. */
  testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>>;

  /** Pull one page of records. `cursor` is whatever this adapter returned
   * as `nextCursor` on the previous call, or `undefined` for the first
   * page of a fresh sync. */
  pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>>;
}
