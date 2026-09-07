import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 2 (v1.12.0) — schema-drift guard for docs/TENANT_MODEL_INVENTORY.md.
 *
 * Parses prisma/schema.prisma and asserts the tenant-model classification
 * still holds: 9 identity/routing models, 28 tenant-owned models, and the
 * three independent lists of tenant tables (rls-smoke, migration 17,
 * schema) agree exactly. A new model with an `organizationId` field that
 * isn't wired into RLS fails this test.
 */
const root = process.cwd();
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const smoke = readFileSync(join(root, 'scripts/rls-smoke.ts'), 'utf8');
const mig17 = readFileSync(
  join(root, 'prisma/migrations/00000000000017_rls_tenant_policies/migration.sql'),
  'utf8',
);

/** Identity / routing models — never tenant-isolated (see the inventory doc). */
const IDENTITY_MODELS = new Set([
  'User',
  'Account',
  'Session',
  'VerificationToken',
  'Membership',
  'Organization',
  'StaffGrant',
  'StaffElevation',
  'ImpersonationGrant',
]);

/** Platform-operator tables added AFTER the RLS baseline (migrations 16/17).
 * Not tenant data (no organizationId, in UNSCOPED_MODELS) and not part of
 * the migration-17 plumbing group — the app never reaches them under the
 * `a2r_app` runtime role. */
const POST_RLS_PLATFORM_MODELS = new Set(['OperatorMfa']);

interface Model {
  name: string;
  body: string;
  table: string;
  hasOrgId: boolean;
}

function parseModels(src: string): Model[] {
  const out: Model[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [, name, body] = m;
    const mapMatch = body!.match(/@@map\("([^"]+)"\)/);
    out.push({
      name: name!,
      body: body!,
      table: mapMatch?.[1] ?? name!,
      hasOrgId: /\n\s*organizationId\s+String/.test(body!),
    });
  }
  return out;
}

function smokeTenantTables(): string[] {
  const block = smoke.match(/const TENANT_TABLES = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error('could not find TENANT_TABLES in scripts/rls-smoke.ts');
  return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
}

describe('tenant-model inventory', () => {
  const models = parseModels(schema);
  const tenantTables = smokeTenantTables();

  it('the schema has 38 models: 9 identity + 28 tenant-owned + 1 post-RLS platform', () => {
    expect(models.length).toBe(38);
    const identity = models.filter((x) => IDENTITY_MODELS.has(x.name));
    expect(identity.length).toBe(9);
    const platform = models.filter((x) => POST_RLS_PLATFORM_MODELS.has(x.name));
    expect(platform.length).toBe(1);
    // the post-RLS platform tables carry no organizationId
    expect(platform.every((x) => !x.hasOrgId)).toBe(true);
  });

  it('every model with an organizationId is either identity/routing or a known tenant table', () => {
    const unclassified = models
      .filter((x) => x.hasOrgId && !IDENTITY_MODELS.has(x.name))
      .filter((x) => !tenantTables.includes(x.table))
      .map((x) => `${x.name} (${x.table})`);
    expect(unclassified).toEqual([]);
  });

  it('rls-smoke TENANT_TABLES has exactly 28 entries and matches the schema', () => {
    expect(tenantTables.length).toBe(28);
    const schemaTenantTables = models
      .filter((x) => x.hasOrgId && !IDENTITY_MODELS.has(x.name))
      .map((x) => x.table)
      .sort();
    expect([...tenantTables].sort()).toEqual(schemaTenantTables);
  });

  it('migration 17 defines tenant_isolation for every tenant table', () => {
    for (const t of tenantTables) {
      expect(mig17, `migration 17 is missing '${t}'`).toContain(`'${t}'`);
    }
  });

  it('all 9 identity/routing tables are named in migration 17 (plumbing group)', () => {
    const identityTables = models
      .filter((x) => IDENTITY_MODELS.has(x.name))
      .map((x) => x.table);
    for (const t of identityTables) {
      expect(mig17, `migration 17 is missing identity table '${t}'`).toContain(`'${t}'`);
    }
  });
});
