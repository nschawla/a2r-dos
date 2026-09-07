/**
 * A2R Delivery OS — WP2: READ-ONLY production RLS / security posture check.
 *
 *   npx tsx scripts/rls-prod-verify.ts        (or: npm run db:rls:verify)
 *
 * Pure `pg_catalog` / `information_schema` SELECTs — issues ZERO DML, so it
 * is safe to run against the production database as a post-migration
 * acceptance gate. (The behavioural test `scripts/rls-smoke.ts` writes
 * throwaway rows and is staging/local only.)
 *
 * Asserts, structurally:
 *   - the `a2r_app` role exists and is NOBYPASSRLS / NOLOGIN / NOSUPERUSER;
 *   - `tenant_isolation` is present on all 28 tenant tables;
 *   - `rls_deny_app` is present on the 9 identity/routing tables;
 *   - the two `immutable_audit_ledger` triggers exist and `a2r_app` has no
 *     UPDATE/DELETE grant on it;
 *   - every WP1 intra-tenant FK is composite (conkey length >= 2).
 *
 * Exit 0 = posture verified.  Exit 1 = a gap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

function loadEnvFile(file: string): void {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent */
  }
}

const TENANT_TABLES = [
  'activity_log_entries', 'api_keys', 'audit_entries', 'audit_logs', 'control_labels',
  'custom_kpis', 'data_import_batches', 'data_import_rows', 'delivery_roles', 'effort_cells',
  'financial_actuals', 'governance_configs', 'identity_providers', 'immutable_audit_ledger',
  'organization_holidays', 'org_policies', 'practices', 'projects', 'project_contributors',
  'raid_entries', 'resources', 'role_utilization_policies', 'schedule_phases', 'scope_items',
  'sso_group_mappings', 'steerco_decisions', 'timesheet_entries', 'weekly_assignment_slots',
];
const IDENTITY_TABLES = [
  'users', 'accounts', 'sessions', 'verification_tokens', 'memberships',
  'organizations', 'staff_grants', 'staff_elevations', 'impersonation_grants',
];
const COMPOSITE_FKS = [
  'resources_organizationId_roleId_fkey', 'resources_organizationId_practiceId_fkey',
  'resources_organizationId_managerId_fkey', 'resources_organizationId_rolePolicyId_fkey',
  'projects_organizationId_practiceDirectorId_fkey', 'projects_organizationId_deliveryManagerId_fkey',
  'projects_organizationId_projectManagerId_fkey', 'projects_organizationId_practiceId_fkey',
  'projects_organizationId_parentId_fkey', 'delivery_roles_organizationId_practiceId_fkey',
  'raid_entries_organizationId_ownerId_fkey', 'financial_actuals_organizationId_roleId_fkey',
  'steerco_decisions_organizationId_decisionOwnerId_fkey', 'activity_log_entries_organizationId_projectId_fkey',
  'audit_logs_organizationId_projectId_fkey', 'weekly_assignment_slots_organizationId_resourceId_fkey',
  'timesheet_entries_organizationId_resourceId_fkey', 'project_contributors_organizationId_resourceId_fkey',
  'effort_cells_organizationId_roleId_fkey', 'sso_group_mappings_organizationId_identityProviderId_fkey',
];

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    loadEnvFile('.env');
    loadEnvFile('.env.test');
  }
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const fail: string[] = [];
  const ok = (label: string) => console.log(`  ✓ ${label}`);

  try {
    // 1 — a2r_app role attributes
    const role = await db.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean; rolcreaterole: boolean }[]
    >(`SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreaterole FROM pg_roles WHERE rolname = 'a2r_app'`);
    if (role.length === 0) {
      fail.push('a2r_app role does not exist (migration 16 not applied)');
    } else {
      const r = role[0]!;
      if (r.rolsuper) fail.push('a2r_app is SUPERUSER');
      if (r.rolbypassrls) fail.push('a2r_app has BYPASSRLS');
      if (r.rolcanlogin) fail.push('a2r_app has LOGIN (expected NOLOGIN since migration 20)');
      if (r.rolcreaterole) fail.push('a2r_app has CREATEROLE');
      if (!fail.length) ok('a2r_app: NOSUPERUSER / NOBYPASSRLS / NOLOGIN / NOCREATEROLE');
    }

    // 2 — tenant_isolation on the 28 tenant tables
    const ti = await db.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' AND schemaname = 'public'`,
    );
    const tiSet = new Set(ti.map((x) => x.tablename));
    const tiMissing = TENANT_TABLES.filter((t) => !tiSet.has(t));
    if (tiMissing.length) fail.push(`tenant_isolation missing on: ${tiMissing.join(', ')}`);
    else ok(`tenant_isolation present on all ${TENANT_TABLES.length} tenant tables`);

    // 3 — rls_deny_app on the 9 identity tables
    const deny = await db.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_policies WHERE policyname = 'rls_deny_app' AND schemaname = 'public'`,
    );
    const denySet = new Set(deny.map((x) => x.tablename));
    const denyMissing = IDENTITY_TABLES.filter((t) => !denySet.has(t));
    if (denyMissing.length) fail.push(`rls_deny_app missing on: ${denyMissing.join(', ')}`);
    else ok(`rls_deny_app present on all ${IDENTITY_TABLES.length} identity/routing tables`);

    // 4 — ledger immutability: triggers + no UPDATE/DELETE grant for a2r_app
    const trg = await db.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = '"immutable_audit_ledger"'::regclass AND NOT tgisinternal`,
    );
    const trgSet = new Set(trg.map((x) => x.tgname));
    for (const name of ['trg_ledger_no_mutate', 'trg_ledger_no_truncate']) {
      if (!trgSet.has(name)) fail.push(`ledger trigger "${name}" is missing`);
    }
    const grants = await db.$queryRawUnsafe<{ privilege_type: string }[]>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'a2r_app' AND table_name = 'immutable_audit_ledger'`,
    );
    const g = new Set(grants.map((x) => x.privilege_type));
    if (g.has('UPDATE')) fail.push('a2r_app still has UPDATE on immutable_audit_ledger');
    if (g.has('DELETE')) fail.push('a2r_app still has DELETE on immutable_audit_ledger');
    if (!g.has('SELECT') || !g.has('INSERT')) fail.push('a2r_app lost SELECT/INSERT on immutable_audit_ledger');
    if (trgSet.has('trg_ledger_no_mutate') && !g.has('UPDATE') && !g.has('DELETE')) {
      ok('immutable_audit_ledger: triggers present, a2r_app is SELECT+INSERT only');
    }

    // 5 — WP1 composite FKs
    const fks = await db.$queryRawUnsafe<{ conname: string; n: number }[]>(
      `SELECT conname, array_length(conkey, 1) AS n FROM pg_constraint
        WHERE contype = 'f' AND conname = ANY($1::text[])`,
      COMPOSITE_FKS,
    );
    const fkMap = new Map(fks.map((x) => [x.conname, Number(x.n)]));
    const fkBad = COMPOSITE_FKS.filter((c) => (fkMap.get(c) ?? 0) < 2);
    if (fkBad.length) fail.push(`composite FK not 2-column (or missing): ${fkBad.join(', ')}`);
    else ok(`all ${COMPOSITE_FKS.length} WP1 intra-tenant FKs are composite`);

    console.log(`\n  RLS_ENFORCE = ${process.env.RLS_ENFORCE ?? '(unset)'} (informational)`);
  } finally {
    await db.$disconnect();
  }

  if (fail.length) {
    console.error('\n[rls-prod-verify] FAIL:\n  ' + fail.join('\n  '));
    return 1;
  }
  console.log('\n[rls-prod-verify] OK — security posture verified (read-only).');
  return 0;
}

main().then((code) => process.exit(code));
