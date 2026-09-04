/**
 * WP6 — Audit Trail Engine: the one place any code in this app is allowed
 * to write an AuditLog row. No update or delete path exists for this
 * model anywhere else — that's what makes the trail "immutable" in
 * practice, not a database-level constraint.
 *
 * Every call site is expected to pass the same Prisma client it's already
 * using for the state-changing write itself (`db`, or a `tx` inside a
 * `db.$transaction(...)` callback) — see AuditDbClient below. Passing the
 * transaction client when one is available means the audit record can
 * never desync from the mutation it's describing: either both commit or
 * both roll back together. A caller with no natural transaction of its
 * own (there currently isn't one) can still pass the bare `db` singleton.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type AuditDbClient = typeof db | Prisma.TransactionClient;

/**
 * The action vocabulary this WP actually wires up (see each server
 * action's doc comment for exactly where). Deliberately scoped to the
 * "critical state changes" the WP6 spec names — baseline lock/unlock, EAC
 * actual/forecast updates, RAID SteerCo escalation, audit control status
 * changes — plus this WP's own two new bulk-mutation surfaces. A free-text
 * column backs this (see the schema comment on AuditLog.action), so adding
 * a new action later is just a new string literal here, no migration.
 */
export type AuditAction =
  | 'BASELINE_LOCKED'
  | 'BASELINE_UNLOCKED'
  | 'EAC_ACTUAL_UPDATED'
  | 'RAID_ESCALATED'
  | 'RAID_UNESCALATED'
  | 'AUDIT_SCORE_CHANGED'
  | 'CSV_IMPORT_COMMITTED'
  | 'WORKSPACE_EXPORTED'
  | 'WORKSPACE_RESTORED'
  // WP7 — Self-Service Batch Import Engine (weekly BAU uploads). Staging
  // is logged too, not just commit/discard, since a stuck-in-quarantine
  // batch is itself an operational signal worth having in the trail.
  | 'BATCH_IMPORT_STAGED'
  | 'BATCH_IMPORT_COMMITTED'
  | 'BATCH_IMPORT_DISCARDED';

export type AuditEntityType = 'PROJECT' | 'FINANCIAL_ACTUAL' | 'RAID_ENTRY' | 'AUDIT_ENTRY' | 'INGESTION' | 'WORKSPACE' | 'DATA_IMPORT_BATCH';

export interface LogAuditEventInput {
  organizationId: string;
  projectId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  /** Plain JSON-serializable data — pass the relevant row (or a subset of
   * its fields) as it stood immediately before the mutation. Omit/null for
   * actions with no meaningful "before" (e.g. a bulk import's summary). */
  previousState?: unknown;
  /** Same shape as previousState, after the mutation. */
  newState?: unknown;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  // JSON round-trip strips undefined/function/Date-as-object-shape
  // surprises before Prisma ever sees the value — cheap insurance against
  // "works until someone passes a Date field straight through" bugs,
  // since Date serializes fine via JSON.stringify but Prisma's Json input
  // type doesn't accept it directly.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function logAuditEvent(client: AuditDbClient, input: LogAuditEventInput): Promise<void> {
  await client.auditLog.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousState: toJsonInput(input.previousState),
      newState: toJsonInput(input.newState),
    },
  });
}
