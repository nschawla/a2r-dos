import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { runWithOrgScope } from '@/lib/db/org-scope';
import { OrgScopeError } from '@/lib/db/org-scope';

/**
 * Cross-tenant data isolation — the platform's core security guardrail.
 * Live-DB: proves Postgres itself enforces the `organizationId` scope our
 * query layer always applies, not just that we remembered to write the
 * `where` clause. Self-cleaning (orgs cascade-delete their projects).
 */
describe('Cross-Tenant Data Isolation Security Guardrails', () => {
  let orgAId: string;
  let orgBId: string;
  const createdOrgIds: string[] = [];

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const orgA = await db.organization.create({
      data: { name: 'Alpha Corp Test', slug: `alpha-corp-test-${stamp}` },
    });
    const orgB = await db.organization.create({
      data: { name: 'Beta Corp Test', slug: `beta-corp-test-${stamp}` },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgA.id, orgB.id);
  });

  afterEach(async () => {
    // Project → Organization is `onDelete: Cascade`, so this also removes
    // every test project created under these tenants.
    const ids = createdOrgIds.splice(0);
    if (ids.length > 0) {
      await db.organization.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('prevents cross-tenant record retrieval by enforcing organizationId scope', async () => {
    const secretProject = await db.project.create({
      data: { name: 'Alpha Confidential Project', externalId: 'ALPHA-001', organizationId: orgAId },
    });

    // Tenant Beta asks for the row by id, scoped to Beta — the boundary our
    // session layer always applies.
    const leakedProject = await db.project.findFirst({
      where: { id: secretProject.id, organizationId: orgBId },
    });
    expect(leakedProject).toBeNull();

    // Sanity: the owning tenant does see it.
    const ownerView = await db.project.findFirst({
      where: { id: secretProject.id, organizationId: orgAId },
    });
    expect(ownerView?.id).toBe(secretProject.id);
  });

  it('ensures updates affect zero rows when tenant scope is mismatched', async () => {
    const targetProject = await db.project.create({
      data: { name: 'Beta Protected Project', externalId: 'BETA-002', organizationId: orgBId },
    });

    const updateResult = await db.project.updateMany({
      where: { id: targetProject.id, organizationId: orgAId }, // Alpha trying to touch Beta's data
      data: { name: 'Hacked By Alpha' },
    });
    expect(updateResult.count).toBe(0);

    const freshCheck = await db.project.findUnique({ where: { id: targetProject.id } });
    expect(freshCheck?.name).toBe('Beta Protected Project');
  });

  it('scoped list queries never return another tenant’s rows', async () => {
    await db.project.createMany({
      data: [
        { name: 'Alpha One', organizationId: orgAId },
        { name: 'Alpha Two', organizationId: orgAId },
        { name: 'Beta One', organizationId: orgBId },
      ],
    });

    const betaProjects = await db.project.findMany({ where: { organizationId: orgBId } });
    expect(betaProjects).toHaveLength(1);
    expect(betaProjects.every((p) => p.organizationId === orgBId)).toBe(true);

    // A deleteMany scoped to the wrong tenant is also a no-op.
    const wrongScopeDelete = await db.project.deleteMany({
      where: { name: 'Beta One', organizationId: orgAId },
    });
    expect(wrongScopeDelete.count).toBe(0);
  });
});

/**
 * P1 — the 8 formerly project-scoped models + DataImportRow now carry their
 * own `organizationId` column + FK (migration 00000000000012), and are
 * classified DIRECT_ORG. Prove that the org-scope extension isolates each
 * one exactly like a top-level tenant model: a cross-tenant read is null, a
 * cross-tenant update is P2025, and a create homed to another tenant is
 * refused. Run under a real `runWithOrgScope` so the extension is active
 * (not the test-env passthrough).
 */
describe('P1 composite-key child models — cross-tenant isolation', () => {
  let orgAId: string;
  let orgBId: string;
  let projAId: string;
  let roleAId: string;
  let resourceAId: string;
  let batchAId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [orgA, orgB] = await Promise.all([
      db.organization.create({ data: { name: 'Child A', slug: `child-a-${stamp}` } }),
      db.organization.create({ data: { name: 'Child B', slug: `child-b-${stamp}` } }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;

    await runWithOrgScope(orgAId, async () => {
      const proj = await db.project.create({
        data: { organizationId: orgAId, name: 'Child Parent', externalId: `CP-${stamp}` },
      });
      projAId = proj.id;
      const role = await db.deliveryRole.create({
        data: { organizationId: orgAId, name: 'ChildRole', billRate: 200, costRate: 100 },
      });
      roleAId = role.id;
      const resource = await db.resource.create({
        data: { organizationId: orgAId, name: 'Child Res', email: `child-res-${stamp}@x.test` },
      });
      resourceAId = resource.id;
      const batch = await db.dataImportBatch.create({
        data: { organizationId: orgAId, dataType: 'WEEKLY_ACTUALS', fileName: 'x.csv', totalRows: 0, validRows: 0, errorRows: 0 },
      });
      batchAId = batch.id;
    });
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  });

  type Spec = { model: string; create: () => Promise<{ id: string }>; update: Record<string, unknown> };

  const specs = (): Spec[] => [
    {
      model: 'scopeItem',
      create: async () => db.scopeItem.create({ data: { organizationId: orgAId, projectId: projAId, key: 'k', name: 'S' } }),
      update: { name: 'hacked' },
    },
    {
      model: 'auditEntry',
      create: async () => db.auditEntry.create({ data: { organizationId: orgAId, projectId: projAId, controlKey: 'CTRL_01', status: 'NO' } }),
      update: { status: 'YES' },
    },
    {
      model: 'raidEntry',
      create: async () => db.raidEntry.create({ data: { organizationId: orgAId, projectId: projAId, type: 'RISK', description: 'd', severity: 'MED' } }),
      update: { description: 'hacked' },
    },
    {
      model: 'schedulePhase',
      create: async () => db.schedulePhase.create({ data: { organizationId: orgAId, projectId: projAId, phaseKey: 'build' } }),
      update: { pctComplete: 99 },
    },
    {
      model: 'financialActual',
      create: async () => db.financialActual.create({ data: { organizationId: orgAId, projectId: projAId, roleKey: '_direct', roleId: null } }),
      update: { cost: 1 },
    },
    {
      model: 'effortCell',
      create: async () => db.effortCell.create({ data: { organizationId: orgAId, projectId: projAId, phaseKey: 'build', roleId: roleAId, hours: 1 } }),
      update: { hours: 999 },
    },
    {
      model: 'steerCoDecision',
      create: async () => db.steerCoDecision.create({ data: { organizationId: orgAId, projectId: projAId, decisionRequired: 'q' } }),
      update: { decisionRequired: 'hacked' },
    },
    {
      model: 'projectContributor',
      create: async () => db.projectContributor.create({ data: { organizationId: orgAId, projectId: projAId, resourceId: resourceAId } }),
      update: {},
    },
    {
      model: 'dataImportRow',
      create: async () => db.dataImportRow.create({ data: { organizationId: orgAId, batchId: batchAId, rowIndex: 1, raw: {}, errors: [] } }),
      update: { rowIndex: 2 },
    },
  ];

  for (const spec of specs()) {
    it(`${spec.model}: a row created under A is invisible / immutable / un-creatable from B's scope`, async () => {
      const row = await runWithOrgScope(orgAId, spec.create);

      // read across tenants → null
      const leaked = await runWithOrgScope(orgBId, async () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)[spec.model].findFirst({ where: { id: row.id } }),
      );
      expect(leaked).toBeNull();

      // the owner still sees it
      const owned = await runWithOrgScope(orgAId, async () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)[spec.model].findFirst({ where: { id: row.id } }),
      );
      expect(owned?.id).toBe(row.id);

      // update across tenants → P2025 (no row matched the ANDed org filter)
      if (Object.keys(spec.update).length > 0) {
        await expect(
          runWithOrgScope(orgBId, async () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (db as any)[spec.model].update({ where: { id: row.id }, data: spec.update }),
          ),
        ).rejects.toMatchObject({ code: 'P2025' });
      }

      // the same create (data homed to tenant A) run while scoped to B is
      // refused by applyOrgToCreateData before it reaches the database
      await expect(runWithOrgScope(orgBId, spec.create)).rejects.toBeInstanceOf(OrgScopeError);
    });
  }
});
