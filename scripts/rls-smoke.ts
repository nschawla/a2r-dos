/**
 * A2R Delivery OS — P0-2 (Phase C): direct-SQL RLS enforcement smoke test.
 *
 *   npx tsx scripts/rls-smoke.ts
 *
 * Proves the DATABASE enforces tenant isolation for the restricted
 * `a2r_app` role (NOBYPASSRLS) — WITHOUT going through the Prisma model
 * layer or the org-scope extension. Every check is raw SQL run inside a
 * transaction that first does `SET LOCAL ROLE a2r_app` + `SET LOCAL
 * app.current_org`, exactly as `src/lib/db/with-tenant-tx.ts` does at
 * runtime:
 *
 *   1. scoped to tenant A, `SELECT count(*)` on each of the 28 tenant tables
 *      returns ONLY A's rows (vs. the ground truth read as `postgres`);
 *   2. with the GUC set to '' every tenant table returns 0 rows (fail-closed);
 *   3. a cross-tenant `INSERT` (org B row while scoped to A) is rejected by
 *      the policy `WITH CHECK` (SQLSTATE 42501 / "row-level security");
 *   4. a cross-tenant `UPDATE` touches 0 rows;
 *   5. a cross-tenant `DELETE` touches 0 rows;
 *   6. an `UPSERT` (INSERT … ON CONFLICT) keyed on a B-owned unique row,
 *      while scoped to A, never mutates B's row;
 *   7. a cross-tenant FK — inserting a child row that points at a B-owned
 *      parent while scoped to A — is rejected (parent invisible under RLS);
 *   8. the ingestion path — scoped INSERT into weekly_assignment_slots +
 *      activity_log_entries — succeeds for A and is invisible to B.
 *
 * Exit 0 = all enforced, OR the `a2r_app` role does not exist yet (dormant —
 * expected on production and any environment before migrations 16+17).
 * Exit 1 = a leak or a missing policy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* none */
  }
}

const TENANT_TABLES = [
  'activity_log_entries', 'api_keys', 'audit_entries', 'audit_logs', 'control_labels',
  'custom_kpis', 'data_import_batches', 'data_import_rows', 'delivery_roles', 'effort_cells',
  'financial_actuals', 'governance_configs', 'identity_providers', 'immutable_audit_ledger',
  'organization_holidays', 'org_policies', 'practices', 'projects', 'project_contributors',
  'raid_entries', 'resources', 'role_utilization_policies', 'schedule_phases', 'scope_items',
  'sso_group_mappings', 'steerco_decisions', 'timesheet_entries', 'weekly_assignment_slots',
] as const;

/** Run `body` in a tx scoped to `orgId` as the a2r_app role (RLS enforced). */
async function scoped<T>(
  db: PrismaClient,
  orgId: string,
  body: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('role', 'a2r_app', true)`);
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, orgId);
    return body(tx);
  });
}

async function main(): Promise<number> {
  loadEnv();
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const failures: string[] = [];

  try {
    const roleExists = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM pg_roles WHERE rolname = 'a2r_app'`,
    );
    if (roleExists[0]!.n === 0n) {
      console.log('[rls-smoke] the a2r_app role does not exist — RLS is DORMANT here (migrations 16/17 not applied). Nothing to verify. See docs/RLS_ENFORCEMENT_RUNBOOK.md.');
      return 0;
    }

    const orgs = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM organizations WHERE "purgedAt" IS NULL ORDER BY "createdAt" LIMIT 2`,
    );
    if (orgs.length < 2) {
      console.log('[rls-smoke] need at least 2 live tenants to test isolation — seed more first.');
      return 0;
    }
    const [a, b] = [orgs[0]!.id, orgs[1]!.id];

    // 1 + 2 — scoped counts vs. ground truth, and fail-closed on empty GUC.
    for (const table of TENANT_TABLES) {
      const truth = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${table}" WHERE "organizationId" = $1`, a,
      );
      const scopedCount = await scoped(db, a, (tx) =>
        tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`),
      );
      const emptyCount = await scoped(db, '', (tx) =>
        tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`),
      );
      if (scopedCount[0]!.n !== truth[0]!.n) {
        failures.push(`${table}: scoped count ${scopedCount[0]!.n} != tenant-A truth ${truth[0]!.n} (LEAK or missing policy)`);
      }
      if (emptyCount[0]!.n !== 0n) {
        failures.push(`${table}: empty-GUC connection saw ${emptyCount[0]!.n} rows — not fail-closed`);
      }
    }

    // 3 — cross-tenant INSERT rejected by WITH CHECK.
    try {
      await scoped(db, a, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "practices" ("id","organizationId","name","createdAt") VALUES ($1,$2,'rls-smoke',now())`,
          `rls-smoke-${Date.now()}`, b,
        ),
      );
      failures.push('cross-tenant INSERT into practices SUCCEEDED — WITH CHECK not enforced');
    } catch (err) {
      const msg = String(err);
      if (!msg.includes('row-level security') && !msg.includes('42501')) {
        failures.push(`cross-tenant INSERT failed with an unexpected error: ${msg.split('\n')[0]}`);
      }
    }

    // 4 — cross-tenant UPDATE touches nothing.
    const updated = await scoped(db, a, (tx) =>
      tx.$executeRawUnsafe(`UPDATE "practices" SET "name" = "name" WHERE "organizationId" = $1`, b),
    );
    if (typeof updated === 'number' && updated > 0) {
      failures.push(`cross-tenant UPDATE modified ${updated} rows`);
    }

    // 5 — cross-tenant DELETE touches nothing.
    const deleted = await scoped(db, a, (tx) =>
      tx.$executeRawUnsafe(`DELETE FROM "practices" WHERE "organizationId" = $1`, b),
    );
    if (typeof deleted === 'number' && deleted > 0) {
      failures.push(`cross-tenant DELETE removed ${deleted} of tenant B's rows`);
    }

    // 6 — UPSERT keyed on a B-owned control_labels row must not mutate it.
    const bLabel = await db.$queryRawUnsafe<{ controlKey: string; label: string }[]>(
      `SELECT "controlKey", "label" FROM "control_labels" WHERE "organizationId" = $1 LIMIT 1`, b,
    );
    if (bLabel[0]) {
      const { controlKey, label } = bLabel[0];
      try {
        await scoped(db, a, (tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "control_labels" ("id","organizationId","controlKey","label")
               VALUES ($1,$2,$3,'rls-smoke-upsert')
             ON CONFLICT ("organizationId","controlKey")
               DO UPDATE SET "label" = EXCLUDED."label"`,
            `rls-smoke-${Date.now()}`, b, controlKey,
          ),
        );
      } catch {
        /* rejected by WITH CHECK — also fine */
      }
      const after = await db.$queryRawUnsafe<{ label: string }[]>(
        `SELECT "label" FROM "control_labels" WHERE "organizationId" = $1 AND "controlKey" = $2`, b, controlKey,
      );
      if (after[0] && after[0].label !== label) {
        failures.push(`cross-tenant UPSERT mutated tenant B's control_labels row (${label} → ${after[0].label})`);
      }
      // clean any A-side row the insert branch may have created
      await db.$executeRawUnsafe(
        `DELETE FROM "control_labels" WHERE "organizationId" = $1 AND "label" = 'rls-smoke-upsert'`, a,
      );
    }

    // 7 — cross-tenant FK: a scope_items row pointing at a B project, scoped to A.
    const bProject = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "projects" WHERE "organizationId" = $1 LIMIT 1`, b,
    );
    if (bProject[0]) {
      try {
        await scoped(db, a, (tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "scope_items" ("id","organizationId","projectId","key","name")
               VALUES ($1,$2,$3,'rls-smoke','rls-smoke')`,
            `rls-smoke-${Date.now()}`, a, bProject[0]!.id,
          ),
        );
        failures.push('cross-tenant FK: inserted a scope_items row against a B-owned project while scoped to A');
        await db.$executeRawUnsafe(`DELETE FROM "scope_items" WHERE "key" = 'rls-smoke'`);
      } catch (err) {
        const msg = String(err);
        if (!/row-level security|42501|foreign key|23503/.test(msg)) {
          failures.push(`cross-tenant FK check failed with an unexpected error: ${msg.split('\n')[0]}`);
        }
      }
    }

    // 8 — ingestion path: a scoped INSERT (the shape /api/v1/ingest uses via
    //     withTenantTx) lands for A and is invisible to B's scope.
    const logId = `rls-smoke-log-${Date.now()}`;
    try {
      await scoped(db, a, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "activity_log_entries" ("id","organizationId","text","tab")
             VALUES ($1,$2,'rls-smoke ingest','home')`,
          logId, a,
        ),
      );
      const seenByB = await scoped(db, b, (tx) =>
        tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*)::bigint AS n FROM "activity_log_entries" WHERE "id" = $1`, logId,
        ),
      );
      if (seenByB[0]!.n !== 0n) {
        failures.push('ingestion path: tenant B can see an activity_log_entries row written for tenant A');
      }
    } finally {
      await db.$executeRawUnsafe(`DELETE FROM "activity_log_entries" WHERE "id" = $1`, logId);
    }
  } finally {
    await db.$disconnect();
  }

  if (failures.length) {
    console.error('[rls-smoke] FAIL:\n  ' + failures.join('\n  '));
    return 1;
  }
  console.log(`[rls-smoke] OK — all ${TENANT_TABLES.length} tenant tables enforce isolation for a2r_app.`);
  return 0;
}

main().then((code) => process.exit(code));
