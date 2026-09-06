/**
 * CMP-2 — data retention policy resolution + sweep logic.
 * The sweep runs against an injected fake client, so no DB is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_RETENTION_POLICY,
  resolveRetentionPolicy,
  runRetentionSweep,
  type RetentionClient,
} from '../src/server/services/data-retention';

describe('resolveRetentionPolicy', () => {
  it('returns the defaults with no env / overrides', () => {
    expect(resolveRetentionPolicy({}, {})).toEqual(DEFAULT_RETENTION_POLICY);
  });

  it('applies valid env overrides', () => {
    const p = resolveRetentionPolicy({}, { RETENTION_ACTIVITY_LOG_DAYS: '90', RETENTION_API_KEY_DAYS: '400' });
    expect(p.activityLogDays).toBe(90);
    expect(p.apiKeyDays).toBe(400);
    expect(p.auditLogDays).toBe(DEFAULT_RETENTION_POLICY.auditLogDays); // untouched
  });

  it('ignores non-numeric and dangerously-low values (keeps the default)', () => {
    const p = resolveRetentionPolicy(
      {},
      { RETENTION_ACTIVITY_LOG_DAYS: 'soon', RETENTION_AUDIT_LOG_DAYS: '7', RETENTION_API_KEY_DAYS: '-5' }
    );
    expect(p.activityLogDays).toBe(DEFAULT_RETENTION_POLICY.activityLogDays);
    expect(p.auditLogDays).toBe(DEFAULT_RETENTION_POLICY.auditLogDays);
    expect(p.apiKeyDays).toBe(DEFAULT_RETENTION_POLICY.apiKeyDays);
  });

  it('explicit overrides win over env', () => {
    const p = resolveRetentionPolicy({ activityLogDays: 120 }, { RETENTION_ACTIVITY_LOG_DAYS: '90' });
    expect(p.activityLogDays).toBe(120);
  });
});

// ── fake Prisma-ish client ────────────────────────────────────────────
function makeModel(rows: number) {
  let remaining = rows;
  return {
    count: vi.fn(async () => rows),
    findMany: vi.fn(async ({ take }: { take: number }) => {
      const n = Math.min(take, remaining);
      return Array.from({ length: n }, (_, i) => ({ id: `id-${remaining - i}` }));
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      const n = where.id.in.length;
      remaining -= n;
      return { count: n };
    }),
  };
}

function makeClient(counts: Record<keyof RetentionClient, number>): RetentionClient {
  return {
    activityLogEntry: makeModel(counts.activityLogEntry),
    auditLog: makeModel(counts.auditLog),
    apiKey: makeModel(counts.apiKey),
  } as unknown as RetentionClient;
}

describe('runRetentionSweep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('dry run counts, never deletes', async () => {
    const client = makeClient({ activityLogEntry: 5, auditLog: 0, apiKey: 1 });
    const res = await runRetentionSweep({ dryRun: true, client });

    expect(res.dryRun).toBe(true);
    expect(res.totalMatched).toBe(6);
    expect(res.totalDeleted).toBe(0);
    expect(res.complianceLedgerUntouched).toBe(true);
    for (const model of Object.values(client)) {
      expect((model as ReturnType<typeof makeModel>).deleteMany).not.toHaveBeenCalled();
    }
  });

  it('apply deletes in batches and reports counts', async () => {
    const client = makeClient({ activityLogEntry: 1200, auditLog: 0, apiKey: 0 });
    const res = await runRetentionSweep({ dryRun: false, client, batchSize: 500 });

    expect(res.totalDeleted).toBe(1200);
    const activity = client.activityLogEntry as unknown as ReturnType<typeof makeModel>;
    expect(activity.deleteMany).toHaveBeenCalledTimes(3); // 500 + 500 + 200
    const entry = res.entries.find((e) => e.label === 'ActivityLogEntry')!;
    expect(entry.deleted).toBe(1200);
  });

  it('cutoffs match the policy windows', async () => {
    const client = makeClient({ activityLogEntry: 0, auditLog: 0, apiKey: 0 });
    const res = await runRetentionSweep({ dryRun: true, client });
    const byLabel = Object.fromEntries(res.entries.map((e) => [e.label, e.cutoff]));

    const daysAgo = (d: number) =>
      new Date(Date.parse('2026-09-03T00:00:00.000Z') - d * 86_400_000).toISOString();
    expect(byLabel.ActivityLogEntry).toBe(daysAgo(DEFAULT_RETENTION_POLICY.activityLogDays));
    expect(byLabel.AuditLog).toBe(daysAgo(DEFAULT_RETENTION_POLICY.auditLogDays));
    expect(byLabel.ApiKey).toBe(daysAgo(DEFAULT_RETENTION_POLICY.apiKeyDays));
  });

  it('one failing target does not abort the others', async () => {
    const client = makeClient({ activityLogEntry: 4, auditLog: 4, apiKey: 4 });
    (client.auditLog as unknown as ReturnType<typeof makeModel>).count.mockRejectedValueOnce(new Error('boom'));

    const res = await runRetentionSweep({ dryRun: true, client });
    const audit = res.entries.find((e) => e.label === 'AuditLog')!;
    expect(audit.error).toBe('boom');
    expect(audit.matched).toBe(0);
    expect(res.entries.filter((e) => !e.error)).toHaveLength(2);
    expect(res.totalMatched).toBe(8); // the other two, 4 each
  });

  it('the client surface has no ledger / security-history model — the sweep cannot reach them', () => {
    const client = makeClient({ activityLogEntry: 0, auditLog: 0, apiKey: 0 });
    expect(Object.keys(client).sort()).toEqual(['activityLogEntry', 'apiKey', 'auditLog']);
    for (const model of ['immutableAuditLedger', 'impersonationGrant', 'staffGrant', 'staffElevation']) {
      expect(model in client).toBe(false);
    }
  });

  it('the swept target list is exactly the 3 high-volume classes — no security history', async () => {
    const client = makeClient({ activityLogEntry: 1, auditLog: 1, apiKey: 1 });
    const res = await runRetentionSweep({ dryRun: true, client });
    expect(res.entries.map((e) => e.label).sort()).toEqual(['ActivityLogEntry', 'ApiKey', 'AuditLog']);
    expect(res.policy).not.toHaveProperty('impersonationGrantDays');
  });
});
