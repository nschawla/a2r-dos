/**
 * Immutable Audit Logging — the SOC 2 Compliance Ledger.
 *
 * `ImmutableAuditLedger` is a hash-chained, append-only record of the
 * highest-consequence governance actions in a tenant. Each row's
 * `currentHash` = SHA-256 over its own canonical payload **plus the
 * previous row's `currentHash`**, so any after-the-fact edit or deletion
 * of a row breaks every hash downstream of it — `verifyLedgerIntegrity`
 * walks the chain and reports the first break.
 *
 * `recordLedgerEvent` is the ONLY writer. There is no update or delete
 * path anywhere in the app. Pass the same Prisma client you're already
 * using for the state change (a `tx` inside `$transaction`, or the `db`
 * singleton) so the ledger entry commits or rolls back with the mutation
 * it describes — same contract as src/lib/audit/logger.ts.
 */
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type LedgerDbClient = typeof db | Prisma.TransactionClient;

/**
 * High-consequence action vocabulary. Free-text column (like AuditLog.action)
 * so new entries are just a string literal — no migration.
 */
export type LedgerActionType =
  | 'BASELINE_OVERRIDE'
  | 'STAGE_GATE_OVERRIDE'
  | 'SECURITY_CONFIG_CHANGE'
  | 'GOVERNANCE_CONFIG_CHANGE'
  | 'SSO_CONFIG_CHANGE'
  | 'SSO_JIT_PROVISION'
  | 'ROLE_POLICY_CHANGE'
  | 'TENANT_LIFECYCLE_CHANGE'
  | 'WORKSPACE_RESTORE'
  | 'HOLIDAY_CALENDAR_CHANGE'
  | 'ADMIN_IMPERSONATION_ACCESS'
  | 'TENANT_DATA_EXPORT'
  | 'TENANT_PURGE_EXECUTED'
  | 'API_KEY_ISSUED'
  | 'API_KEY_REVOKED'
  | 'API_BULK_INGEST';

export const LEDGER_ACTION_LABEL: Record<string, string> = {
  BASELINE_OVERRIDE: 'Baseline override',
  STAGE_GATE_OVERRIDE: 'Stage-gate override',
  SECURITY_CONFIG_CHANGE: 'Security config change',
  GOVERNANCE_CONFIG_CHANGE: 'Governance config change',
  SSO_CONFIG_CHANGE: 'Identity federation change',
  SSO_JIT_PROVISION: 'SSO just-in-time provisioning',
  ROLE_POLICY_CHANGE: 'Role policy change',
  TENANT_LIFECYCLE_CHANGE: 'Tenant lifecycle change',
  WORKSPACE_RESTORE: 'Workspace restore',
  HOLIDAY_CALENDAR_CHANGE: 'Holiday calendar change',
  ADMIN_IMPERSONATION_ACCESS: 'Admin impersonation access',
  TENANT_DATA_EXPORT: 'Tenant data export',
  TENANT_PURGE_EXECUTED: 'Tenant purge executed',
  API_KEY_ISSUED: 'API key issued',
  API_KEY_REVOKED: 'API key revoked',
  API_BULK_INGEST: 'API bulk ingest',
};

export interface RecordLedgerEventInput {
  organizationId: string;
  /** User id of the actor. */
  actorId: string;
  actionType: LedgerActionType | string;
  /** `"<Model>:<id>"`, e.g. `"Project:abc123"`, `"RoleUtilizationPolicy:xyz"`. */
  targetResource: string;
  /** Structured change details — kept small; JSON-serializable only. */
  metadata?: Record<string, unknown> | null;
}

/** Deterministic JSON: object keys sorted recursively so the hash is stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

/** The exact string a row's `currentHash` is computed over. */
export function ledgerRecordDigestInput(row: {
  organizationId: string;
  actorId: string;
  actionType: string;
  targetResource: string;
  metadata: unknown;
  createdAt: Date | string;
  previousHash: string | null;
}): string {
  return canonicalJson({
    organizationId: row.organizationId,
    actorId: row.actorId,
    actionType: row.actionType,
    targetResource: row.targetResource,
    metadata: row.metadata ?? null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString(),
    previousHash: row.previousHash ?? null,
  });
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface LedgerEventResult {
  id: string;
  currentHash: string;
  previousHash: string | null;
  sequence: number;
}

/**
 * Appends one event to the org's compliance ledger, chaining its hash onto
 * the current head.
 *
 * Concurrency (REL-3): the read-head → compute-hash → insert sequence runs
 * inside a transaction that first takes a **per-tenant Postgres advisory
 * lock** (`pg_advisory_xact_lock`), so two appends for the same org can
 * never both chain off the same predecessor and fork the chain. The
 * `@@unique([organizationId, previousHash])` constraint is the durable
 * backstop, and a short retry covers the vanishing race where an append
 * still collides. `createdAt` is forced strictly-increasing per chain so
 * ordering by it (in verifyLedgerIntegrity) is never ambiguous.
 *
 * Best-effort: a ledger write must never block the governance action it
 * records, so failures are logged and swallowed (the classic AuditLog
 * trail in src/lib/audit/logger.ts still captures the underlying mutation).
 */
export async function recordLedgerEvent(
  client: LedgerDbClient,
  input: RecordLedgerEventInput
): Promise<LedgerEventResult | null> {
  const metadata = input.metadata ?? null;

  const appendOnce = async (tx: Prisma.TransactionClient): Promise<LedgerEventResult> => {
    // Serialize appends for this tenant. Released automatically at tx end.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}))`;

    const head = await tx.immutableAuditLedger.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { currentHash: true, createdAt: true },
    });
    const previousHash = head?.currentHash ?? null;
    const createdAt = new Date(Math.max(Date.now(), (head?.createdAt?.getTime() ?? 0) + 1));

    const currentHash = sha256(
      ledgerRecordDigestInput({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actionType: input.actionType,
        targetResource: input.targetResource,
        metadata,
        createdAt,
        previousHash,
      })
    );

    const created = await tx.immutableAuditLedger.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actionType: input.actionType,
        targetResource: input.targetResource,
        previousHash,
        currentHash,
        metadata: toJsonInput(metadata),
        createdAt,
      },
      select: { id: true },
    });

    const sequence = await tx.immutableAuditLedger.count({ where: { organizationId: input.organizationId } });
    return { id: created.id, currentHash, previousHash, sequence };
  };

  // When handed a full client we open our own transaction (and can retry a
  // rare chain collision); when handed a caller's transaction client we run
  // in it directly (the advisory lock still applies, held until they commit).
  const ownsTransaction = typeof (client as { $transaction?: unknown }).$transaction === 'function';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return ownsTransaction
        ? await (client as typeof db).$transaction(appendOnce)
        : await appendOnce(client as Prisma.TransactionClient);
    } catch (err) {
      const chainCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (chainCollision && ownsTransaction && attempt < 2) continue;
      // eslint-disable-next-line no-console
      console.error('[audit-ledger] recordLedgerEvent failed', err);
      return null;
    }
  }
  return null;
}

export interface LedgerIntegrityResult {
  ok: boolean;
  /** Number of rows checked. */
  count: number;
  /** The head (most recent) hash — a short fingerprint of the whole chain. */
  headHash: string | null;
  /** 1-based position of the first bad row, when `ok` is false. */
  brokenAtSequence?: number;
  brokenRowId?: string;
  reason?: 'chain-link-mismatch' | 'hash-recompute-mismatch';
  checkedAt: string;
}

/**
 * Walks the org's ledger oldest→newest, re-deriving each row's hash and
 * confirming it links to the prior row. Returns `ok: false` with the first
 * break's position if anything has been tampered with, reordered, or
 * deleted.
 */
export async function verifyLedgerIntegrity(organizationId: string): Promise<LedgerIntegrityResult> {
  const rows = await db.immutableAuditLedger.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let expectedPrev: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if ((r.previousHash ?? null) !== expectedPrev) {
      return {
        ok: false,
        count: rows.length,
        headHash: expectedPrev,
        brokenAtSequence: i + 1,
        brokenRowId: r.id,
        reason: 'chain-link-mismatch',
        checkedAt: new Date().toISOString(),
      };
    }
    const recomputed = sha256(
      ledgerRecordDigestInput({
        organizationId: r.organizationId,
        actorId: r.actorId,
        actionType: r.actionType,
        targetResource: r.targetResource,
        metadata: r.metadata ?? null,
        createdAt: r.createdAt,
        previousHash: r.previousHash ?? null,
      })
    );
    if (recomputed !== r.currentHash) {
      return {
        ok: false,
        count: rows.length,
        headHash: expectedPrev,
        brokenAtSequence: i + 1,
        brokenRowId: r.id,
        reason: 'hash-recompute-mismatch',
        checkedAt: new Date().toISOString(),
      };
    }
    expectedPrev = r.currentHash;
  }

  return {
    ok: true,
    count: rows.length,
    headHash: expectedPrev,
    checkedAt: new Date().toISOString(),
  };
}

export interface LedgerEventView {
  id: string;
  sequence: number;
  actionType: string;
  actionLabel: string;
  targetResource: string;
  actorId: string;
  actorName: string;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  currentHash: string;
  previousHash: string | null;
  createdAt: string;
}

/**
 * Recent ledger events for the SOC 2 Compliance Ledger view, plus a live
 * integrity check of the whole chain.
 */
export async function getComplianceLedger(
  organizationId: string,
  limit = 100
): Promise<{ events: LedgerEventView[]; integrity: LedgerIntegrityResult }> {
  const [total, rows, integrity] = await Promise.all([
    db.immutableAuditLedger.count({ where: { organizationId } }),
    db.immutableAuditLedger.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    verifyLedgerIntegrity(organizationId),
  ]);

  const actorIds = [...new Set(rows.map((r) => r.actorId))];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const events: LedgerEventView[] = rows.map((r, idx) => {
    const actor = actorById.get(r.actorId);
    // Machine actors (Data Ingestion API Bridge) carry an `apikey:<id>`
    // pseudo-id, not a User row — label them from the event metadata.
    const machineActor =
      r.actorId.startsWith('apikey:') && r.metadata && typeof r.metadata === 'object'
        ? `API · ${(r.metadata as Record<string, unknown>).apiKeyName ?? 'ingestion key'}`
        : null;
    return {
      id: r.id,
      // newest row is sequence `total`, and rows are newest-first
      sequence: total - idx,
      actionType: r.actionType,
      actionLabel: LEDGER_ACTION_LABEL[r.actionType] ?? r.actionType,
      targetResource: r.targetResource,
      actorId: r.actorId,
      actorName: actor?.name ?? actor?.email ?? machineActor ?? 'Unknown actor',
      actorEmail: actor?.email ?? null,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      currentHash: r.currentHash,
      previousHash: r.previousHash,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return { events, integrity };
}
