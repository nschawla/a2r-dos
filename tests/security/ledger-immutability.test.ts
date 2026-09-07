import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import { withLedgerAdmin } from '../helpers/ledger';

/**
 * WP1 (v1.13.0) — `immutable_audit_ledger` is immutable at the PostgreSQL
 * engine, not just by convention (migration 00000000000021):
 *
 *   - `a2r_app` (the tenant runtime role) holds SELECT + INSERT only — the
 *     `REVOKE UPDATE, DELETE` means a mutation fails at the privilege check.
 *   - a BEFORE UPDATE/DELETE trigger rejects the operation for EVERY role,
 *     except inside a transaction that has deliberately opted in with
 *     `SET LOCAL "a2r.ledger_admin" = 'on'` (GDPR/CCPA erasure; `a2r_app`
 *     can never use the opt-in).
 *
 * Live DB, self-cleaning. The `a2r_app`-role checks auto-skip where the role
 * is absent (production before the RLS cutover flip).
 */
const raw = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
let roleExists = false;
let orgId = '';
let rowId = '';

beforeAll(async () => {
  const r = await raw.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM pg_roles WHERE rolname = 'a2r_app'`,
  );
  roleExists = r[0]!.n > 0n;

  const org = await db.organization.create({
    data: {
      name: 'Ledger Immutability Test',
      slug: `ledger-immut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  });
  orgId = org.id;
  // recordLedgerEvent runs through withTenantTx — on staging this INSERT
  // executes as `a2r_app`, so a green suite there is itself the proof that
  // `a2r_app` retains INSERT on the ledger.
  const ev = await recordLedgerEvent(db, {
    organizationId: orgId,
    actorId: 'seed',
    actionType: 'BASELINE_OVERRIDE',
    targetResource: 'Project:x',
  });
  rowId = ev!.id;
});

afterAll(async () => {
  await withLedgerAdmin((tx) =>
    tx.immutableAuditLedger.deleteMany({ where: { organizationId: orgId } }),
  );
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await raw.$disconnect();
});

/** Run `body` as the restricted `a2r_app` role, scoped to the test org. */
async function asA2rApp<T>(body: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return raw.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('role', 'a2r_app', true)`);
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, orgId);
    return body(tx);
  });
}

const REJECTED = /permission denied|append-only|row-level security|42501|restrict/i;

describe('immutable_audit_ledger — engine-level immutability (WP1)', () => {
  it('a2r_app: UPDATE is rejected', async () => {
    if (!roleExists) return;
    await expect(
      asA2rApp((tx) =>
        tx.$executeRawUnsafe(
          `UPDATE "immutable_audit_ledger" SET "actorId" = 'x' WHERE "id" = $1`,
          rowId,
        ),
      ),
    ).rejects.toThrow(REJECTED);
  });

  it('a2r_app: DELETE is rejected', async () => {
    if (!roleExists) return;
    await expect(
      asA2rApp((tx) =>
        tx.$executeRawUnsafe(`DELETE FROM "immutable_audit_ledger" WHERE "id" = $1`, rowId),
      ),
    ).rejects.toThrow(REJECTED);
  });

  it('a2r_app: SELECT still works (append-only, not read-denied)', async () => {
    if (!roleExists) return;
    const rows = await asA2rApp((tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "immutable_audit_ledger" WHERE "id" = $1`,
        rowId,
      ),
    );
    expect(rows[0]!.n).toBe(1n);
  });

  it('owner without the opt-in: UPDATE is rejected by the trigger', async () => {
    await expect(
      db.$executeRawUnsafe(
        `UPDATE "immutable_audit_ledger" SET "actorId" = 'x' WHERE "id" = $1`,
        rowId,
      ),
    ).rejects.toThrow(/append-only|restrict/i);
  });

  it('owner WITH the deliberate opt-in: UPDATE succeeds', async () => {
    await withLedgerAdmin((tx) =>
      tx.$executeRawUnsafe(
        `UPDATE "immutable_audit_ledger" SET "actorId" = 'erasure' WHERE "id" = $1`,
        rowId,
      ),
    );
    const row = await db.immutableAuditLedger.findUnique({
      where: { id: rowId },
      select: { actorId: true },
    });
    expect(row?.actorId).toBe('erasure');
  });
});
