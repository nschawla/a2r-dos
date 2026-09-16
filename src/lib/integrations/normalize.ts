/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The Normalization Layer. Each adapter's `pull()` (src/lib/integrations/
 * adapters/*.ts) already maps its provider's own response shape into one
 * of PS-DOS's three canonical record shapes (RawDeliveryMetric /
 * RawFinancialMetric / RawPipelineRecord, src/lib/integrations/types.ts) —
 * that mapping is what makes Jira, Asana, and Monday all speak the same
 * "delivery metric" shape to the rest of the app.
 *
 * This module is the second half of normalization: a runtime shape-guard
 * every pulled record passes through in src/lib/integrations/sync-runner.ts
 * BEFORE it's counted as ingested. An external API silently changing its
 * response shape is exactly the kind of failure a TypeScript type alone
 * can't catch (the adapter's own type annotations are a compile-time
 * promise about what the code SHOULD produce, not a runtime check on what
 * an external HTTP call actually returned) — this is what turns that class
 * of drift into a clean `SCHEMA_MISMATCH` error instead of a downstream
 * crash or, worse, silently-wrong data reaching a Prisma write.
 */
import { z } from 'zod';
import type { RawDeliveryMetric, RawExternalRecord, RawFinancialMetric, RawPipelineRecord } from './types';

const isoString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a valid ISO timestamp');

const deliveryMetricSchema = z.strictObject({
  kind: z.literal('DELIVERY_METRIC'),
  externalId: z.string().min(1),
  sourceLabel: z.string().min(1),
  sprintOrPeriod: z.string().nullable(),
  velocityPoints: z.number().nullable(),
  issuesOpen: z.number().int().min(0),
  issuesClosed: z.number().int().min(0),
  milestoneStatus: z.enum(['ON_TRACK', 'AT_RISK', 'BLOCKED', 'UNKNOWN']),
  observedAt: isoString,
}) satisfies z.ZodType<RawDeliveryMetric>;

const financialMetricSchema = z.strictObject({
  kind: z.literal('FINANCIAL_METRIC'),
  externalId: z.string().min(1),
  sourceLabel: z.string().min(1),
  baselineMarginPct: z.number().nullable(),
  actualCost: z.number().nullable(),
  actualRevenue: z.number().nullable(),
  allocatedHours: z.number().nullable(),
  periodStart: isoString,
  periodEnd: isoString,
}) satisfies z.ZodType<RawFinancialMetric>;

const pipelineRecordSchema = z.strictObject({
  kind: z.literal('PIPELINE_RECORD'),
  externalId: z.string().min(1),
  accountName: z.string().min(1),
  stage: z.string().min(1),
  amount: z.number().nullable(),
  closeDate: z.string().nullable(),
  probability: z.number().min(0).max(100).nullable(),
}) satisfies z.ZodType<RawPipelineRecord>;

const rawExternalRecordSchema = z.discriminatedUnion('kind', [
  deliveryMetricSchema,
  financialMetricSchema,
  pipelineRecordSchema,
]);

export type NormalizeResult =
  | { ok: true; records: RawExternalRecord[] }
  | { ok: false; detail: string; badIndex: number };

/** Validate every record an adapter's `pull()` returned. Fails on the
 * FIRST bad record — one malformed row is treated as "the shape changed,"
 * not "skip that one and keep going," since a partial schema drift is
 * usually a sign the whole page is suspect. */
export function normalizeRecords(records: unknown[]): NormalizeResult {
  for (let i = 0; i < records.length; i++) {
    const parsed = rawExternalRecordSchema.safeParse(records[i]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.') || '(root)';
      return { ok: false, detail: `record[${i}].${path}: ${issue?.message ?? 'invalid'}`, badIndex: i };
    }
  }
  return { ok: true, records: records as RawExternalRecord[] };
}
