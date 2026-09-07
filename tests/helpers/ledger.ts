import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Run `fn` inside a transaction that has set the deliberate, transaction-local
 * ledger-admin opt-in (`SET LOCAL "a2r.ledger_admin" = 'on'`), so an
 * `UPDATE` / `DELETE` against `immutable_audit_ledger` is not rejected by the
 * engine trigger from migration `00000000000021`.
 *
 * Production use is limited to lawful GDPR/CCPA data-subject erasure done by
 * an operator over `DIRECT_URL`. The application itself never mutates the
 * ledger; tests use this only for cleanup and the tamper-detection case.
 */
export function withLedgerAdmin<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL "a2r.ledger_admin" = 'on'`);
    return fn(tx);
  });
}
