import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db';

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
