/**
 * CMP-2 (GA-readiness audit) — data retention service.
 *
 * Enforces time-based retention on the high-volume, non-authoritative
 * records that otherwise grow forever. It deletes whole rows once they
 * fall past a configurable window — it never edits a row, and it never
 * touches:
 *
 *   • ImmutableAuditLedger — the hash-chained SOC 2 compliance ledger
 *     (append-only, tamper-evident; see src/lib/audit-ledger.ts).
 *   • TimesheetEntry — feeds financial actuals; retention there is
 *     contract-specific and out of scope for this sweep.
 *
 * Swept models:
 *   • ActivityLogEntry              — PS Control Tower "recent activity" feed
 *   • AuditLog                      — governance audit trail (long window)
 *   • ImpersonationGrant (ended or long-expired)
 *   • ApiKey             (revoked or long-expired)
 *
 * Run it from `scripts/run-retention.ts` (defaults to a dry run) or
 * `POST /api/internal/retention` (a cron scheduler / an A2R staff session).
 */
import { db } from '@/lib/db';

const DAY_MS = 86_400_000;

export interface RetentionPolicy {
  /** PS Control Tower activity feed. */
  activityLogDays: number;
  /** Governance audit trail — kept long for compliance/financial review. */
  auditLogDays: number;
  /** Ended or long-expired impersonation grants. */
  impersonationGrantDays: number;
  /** Revoked or long-expired API keys. */
  apiKeyDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  activityLogDays: 730, // 24 months
  auditLogDays: 2555, // ~7 years
  impersonationGrantDays: 545, // 18 months
  apiKeyDays: 365, // 12 months
};

const ENV_KEYS: Record<keyof RetentionPolicy, string> = {
  activityLogDays: 'RETENTION_ACTIVITY_LOG_DAYS',
  auditLogDays: 'RETENTION_AUDIT_LOG_DAYS',
  impersonationGrantDays: 'RETENTION_IMPERSONATION_GRANT_DAYS',
  apiKeyDays: 'RETENTION_API_KEY_DAYS',
};

/** Minimum a window can be set to — a guard against a typo wiping recent
 * data (`RETENTION_AUDIT_LOG_DAYS=7`). */
const MIN_RETENTION_DAYS = 30;

/**
 * Build the effective policy: env overrides on top of
 * `DEFAULT_RETENTION_POLICY`, then any explicit `overrides`. Non-numeric,
 * non-positive, or sub-`MIN_RETENTION_DAYS` values are ignored (the
 * default stands) so a bad config can never shorten a window dangerously.
 */
export function resolveRetentionPolicy(
  overrides: Partial<RetentionPolicy> = {},
  env: Record<string, string | undefined> = process.env
): RetentionPolicy {
  const resolved = { ...DEFAULT_RETENTION_POLICY };
  for (const key of Object.keys(resolved) as (keyof RetentionPolicy)[]) {
    const raw = env[ENV_KEYS[key]];
    if (raw !== undefined) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= MIN_RETENTION_DAYS) {
        resolved[key] = Math.floor(parsed);
      }
    }
    const override = overrides[key];
    if (override !== undefined && Number.isFinite(override) && override >= MIN_RETENTION_DAYS) {
      resolved[key] = Math.floor(override);
    }
  }
  return resolved;
}

// ── Minimal structural client so the sweep is unit-testable without a DB.
interface DeletableModel {
  count(args: { where: unknown }): Promise<number>;
  findMany(args: { where: unknown; select: { id: true }; take: number }): Promise<{ id: string }[]>;
  deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
}

export interface RetentionClient {
  activityLogEntry: DeletableModel;
  auditLog: DeletableModel;
  impersonationGrant: DeletableModel;
  apiKey: DeletableModel;
}

export interface RetentionSweepEntry {
  /** Which record class. */
  label: string;
  /** Rows older than this ISO timestamp are in scope. */
  cutoff: string;
  /** Rows in scope (dry run: counted; apply: actually deleted). */
  matched: number;
  /** Rows deleted (0 on a dry run). */
  deleted: number;
  /** Present only if this target failed — the others still ran. */
  error?: string;
}

export interface RetentionSweepResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  dryRun: boolean;
  policy: RetentionPolicy;
  entries: RetentionSweepEntry[];
  totalMatched: number;
  totalDeleted: number;
  /** Explicit marker: this routine never reads or writes the ledger. */
  complianceLedgerUntouched: true;
}

export interface RunRetentionOptions {
  /** Count only, delete nothing. Default `true` — deletion is opt-in. */
  dryRun?: boolean;
  /** Policy overrides (still floored at MIN_RETENTION_DAYS). */
  policy?: Partial<RetentionPolicy>;
  /** Rows per delete batch, to cap lock duration on big tables. Default 500. */
  batchSize?: number;
  /** Injectable for tests; defaults to the app Prisma client. */
  client?: RetentionClient;
}

function cutoffFrom(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** Delete in bounded batches so a huge backlog doesn't become one lock. */
async function purgeInChunks(model: DeletableModel, where: unknown, batchSize: number): Promise<number> {
  let deleted = 0;
  for (;;) {
    const rows = await model.findMany({ where, select: { id: true }, take: batchSize });
    if (rows.length === 0) break;
    const res = await model.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    deleted += res.count;
    if (rows.length < batchSize) break;
  }
  return deleted;
}

/**
 * Run the retention sweep. Each target is handled independently — one
 * failure is recorded on its entry and the rest still run.
 */
export async function runRetentionSweep(options: RunRetentionOptions = {}): Promise<RetentionSweepResult> {
  const dryRun = options.dryRun ?? true;
  const batchSize = options.batchSize ?? 500;
  const policy = resolveRetentionPolicy(options.policy);
  const client = options.client ?? (db as unknown as RetentionClient);

  const activityCutoff = cutoffFrom(policy.activityLogDays);
  const auditCutoff = cutoffFrom(policy.auditLogDays);
  const grantCutoff = cutoffFrom(policy.impersonationGrantDays);
  const keyCutoff = cutoffFrom(policy.apiKeyDays);

  const targets: { label: string; model: DeletableModel; cutoff: Date; where: unknown }[] = [
    {
      label: 'ActivityLogEntry',
      model: client.activityLogEntry,
      cutoff: activityCutoff,
      where: { createdAt: { lt: activityCutoff } },
    },
    {
      label: 'AuditLog',
      model: client.auditLog,
      cutoff: auditCutoff,
      where: { createdAt: { lt: auditCutoff } },
    },
    {
      label: 'ImpersonationGrant',
      model: client.impersonationGrant,
      cutoff: grantCutoff,
      where: {
        OR: [
          { endedAt: { lt: grantCutoff } },
          { endedAt: null, expiresAt: { lt: grantCutoff } },
        ],
      },
    },
    {
      label: 'ApiKey',
      model: client.apiKey,
      cutoff: keyCutoff,
      where: {
        OR: [
          { revokedAt: { lt: keyCutoff } },
          { revokedAt: null, expiresAt: { lt: keyCutoff } },
        ],
      },
    },
  ];

  const startedAt = Date.now();
  const entries: RetentionSweepEntry[] = [];

  for (const target of targets) {
    try {
      if (dryRun) {
        const matched = await target.model.count({ where: target.where });
        entries.push({ label: target.label, cutoff: target.cutoff.toISOString(), matched, deleted: 0 });
      } else {
        const deleted = await purgeInChunks(target.model, target.where, batchSize);
        entries.push({
          label: target.label,
          cutoff: target.cutoff.toISOString(),
          matched: deleted,
          deleted,
        });
      }
    } catch (err) {
      entries.push({
        label: target.label,
        cutoff: target.cutoff.toISOString(),
        matched: 0,
        deleted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const finishedAt = Date.now();
  return {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    dryRun,
    policy,
    entries,
    totalMatched: entries.reduce((s, e) => s + e.matched, 0),
    totalDeleted: entries.reduce((s, e) => s + e.deleted, 0),
    complianceLedgerUntouched: true,
  };
}
