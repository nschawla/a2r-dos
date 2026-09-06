/**
 * A2R Delivery OS — P0-2 (Phase C): direct-SQL RLS enforcement smoke test.
 *
 *   RLS_APP_DATABASE_URL="postgresql://a2r_app.<ref>:<pwd>@...pooler...:6543/postgres?pgbouncer=true&sslmode=require" \
 *     npx tsx scripts/rls-smoke.ts
 *
 * Proves the DATABASE enforces tenant isolation for the restricted
 * `a2r_app` role (NOBYPASSRLS) — WITHOUT going through the Prisma model
 * layer or the org-scope extension. Every check is raw SQL:
 *
 *   1. With `SET LOCAL app.current_org = <A>`, `SELECT count(*)` on each of
 *      the 29 tenant tables returns ONLY tenant A's rows (compared against
 *      the ground truth read as `postgres` via DATABASE_URL).
 *   2. With the GUC unset, every table returns 0 rows (fail-closed).
 *   3. A cross-tenant `INSERT` (org B row while scoped to A) raises SQLSTATE
 *      42501 (`WITH CHECK` violation).
 *   4. A cross-tenant `UPDATE` touches 0 rows.
 *
 * Exit 0 = all enforced, OR not configured (dormant — expected in CI /
 * local today). Exit 1 = a leak or a missing policy.
 *
 * This script is the "verify direct SQL tests enforce RLS bypassing the
 * ORM" deliverable. It is inert until migrations 16 + 17 are applied and
 * `RLS_APP_DATABASE_URL` points at the restricted role.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

function loadEnv(): void {
  if (process.env.DATABASE_URL && process.env.RLS_APP_DATABASE_URL) return;
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
  'impersonation_grants', 'organization_holidays', 'org_policies', 'practices', 'projects',
  'project_contributors', 'raid_entries', 'resources', 'role_utilization_policies',
  'schedule_phases', 'scope_items', 'sso_group_mappings', 'steerco_decisions',
  'timesheet_entries', 'weekly_assignment_slots',
] as const;

async function main(): Promise<number> {
  loadEnv();
  const appUrl = process.env.RLS_APP_DATABASE_URL;
  if (!appUrl) {
    console.log('[rls-smoke] RLS_APP_DATABASE_URL not set — RLS is DORMANT (migrations 16/17 not applied). Nothing to verify. See docs/RLS_ENFORCEMENT_RUNBOOK.md.');
    return 0;
  }

  const asOwner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const asApp = new PrismaClient({ datasourceUrl: appUrl });
  const failures: string[] = [];

  try {
    const orgs = await asOwner.$queryRawUnsafe<{ id: string }[]>(
      'SELECT id FROM organizations WHERE "purgedAt" IS NULL ORDER BY "createdAt" LIMIT 2',
    );
    if (orgs.length < 2) {
      console.log('[rls-smoke] need at least 2 live tenants to test isolation — seed more first.');
      return 0;
    }
    const [a, b] = [orgs[0]!.id, orgs[1]!.id];

    // 1 + 2 — scoped counts vs ground truth, and fail-closed when unset.
    for (const table of TENANT_TABLES) {
      const truth = await asOwner.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${table}" WHERE "organizationId" = $1`, a,
      );
      const scoped = await asApp.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, a);
        return tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`);
      });
      const unscoped = await asApp.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${table}"`,
      );
      if (scoped[0]!.n !== truth[0]!.n) {
        failures.push(`${table}: scoped count ${scoped[0]!.n} != tenant-A truth ${truth[0]!.n} (LEAK or missing policy)`);
      }
      if (unscoped[0]!.n !== 0n) {
        failures.push(`${table}: unscoped connection saw ${unscoped[0]!.n} rows — not fail-closed`);
      }
    }

    // 3 — cross-tenant INSERT is rejected by WITH CHECK.
    try {
      await asApp.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, a);
        await tx.$executeRawUnsafe(
          `INSERT INTO "practices" ("id","organizationId","name","createdAt") VALUES ($1,$2,'rls-smoke',now())`,
          `rls-smoke-${Date.now()}`, b,
        );
      });
      failures.push('cross-tenant INSERT into practices SUCCEEDED — WITH CHECK not enforced');
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as { meta?: { code?: string } }).meta?.code;
      if (code !== '42501' && !String(err).includes('row-level security')) {
        failures.push(`cross-tenant INSERT failed with an unexpected error (${code ?? err})`);
      }
    }

    // 4 — cross-tenant UPDATE touches nothing.
    const updated = await asApp.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, a);
      return tx.$executeRawUnsafe(`UPDATE "practices" SET "name" = "name" WHERE "organizationId" = $1`, b);
    });
    if (typeof updated === 'number' && updated > 0) {
      failures.push(`cross-tenant UPDATE modified ${updated} rows`);
    }
  } finally {
    await asOwner.$disconnect();
    await asApp.$disconnect();
  }

  if (failures.length) {
    console.error('[rls-smoke] FAIL:\n  ' + failures.join('\n  '));
    return 1;
  }
  console.log(`[rls-smoke] OK — all ${TENANT_TABLES.length} tenant tables enforce isolation for a2r_app.`);
  return 0;
}

main().then((code) => process.exit(code));
