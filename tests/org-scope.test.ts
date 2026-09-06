import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import {
  isTenantModel,
  orgWhereFragment,
  mergeOrgWhere,
  mergeOrgWhereUnique,
  flattenUniqueWhere,
  applyOrgToCreateData,
  runUnscoped,
  runWithOrgScope,
  OrgScopeError,
} from '@/lib/db/org-scope';

/**
 * ORM-level tenant scoping (src/lib/db/org-scope.ts + the db.ts extension).
 *
 * Two halves: pure unit tests on the where-rewriting helpers, then a
 * live-DB proof that a scoped `db` call cannot see another tenant's rows
 * even when the caller writes no `where` of their own.
 */
describe('org-scope — pure helpers', () => {
  it('classifies models', () => {
    expect(isTenantModel('Project')).toBe(true); // direct org column
    expect(isTenantModel('RaidEntry')).toBe(true); // own org column (P1 migration 12)
    expect(isTenantModel('DataImportRow')).toBe(true); // own org column (P1 migration 12)
    expect(isTenantModel('User')).toBe(false);
    expect(isTenantModel('Membership')).toBe(false);
  });

  it('builds the right where fragment per scoping style', () => {
    // P1 — the formerly project/batch-scoped models now carry their own
    // organizationId, so every tenant model resolves to the scalar fragment.
    expect(orgWhereFragment('Project', 'org1')).toEqual({ organizationId: 'org1' });
    expect(orgWhereFragment('RaidEntry', 'org1')).toEqual({ organizationId: 'org1' });
    expect(orgWhereFragment('DataImportRow', 'org1')).toEqual({ organizationId: 'org1' });
  });

  it('mergeOrgWhere ANDs the fragment into a filter where', () => {
    expect(mergeOrgWhere('Project', undefined, 'org1')).toEqual({ organizationId: 'org1' });
    expect(mergeOrgWhere('Project', {}, 'org1')).toEqual({ organizationId: 'org1' });
    expect(mergeOrgWhere('Project', { name: 'X' }, 'org1')).toEqual({
      AND: [{ name: 'X' }, { organizationId: 'org1' }],
    });
  });

  it('mergeOrgWhereUnique keeps the unique selector at the top level', () => {
    // own-column model → scalar beside the id
    expect(mergeOrgWhereUnique('Project', { id: 'p1' }, 'org1')).toEqual({
      id: 'p1',
      organizationId: 'org1',
    });
    // a where that already names another org is forced back to the scope
    expect(mergeOrgWhereUnique('Project', { id: 'p1', organizationId: 'other' }, 'org1')).toEqual({
      id: 'p1',
      organizationId: 'org1',
    });
    // P1 — FinancialActual now has its own organizationId column, so the
    // scope is a scalar beside the compound-key selector.
    expect(
      mergeOrgWhereUnique('FinancialActual', { projectId_roleKey: { projectId: 'p1', roleKey: 'r' } }, 'org1'),
    ).toEqual({
      projectId_roleKey: { projectId: 'p1', roleKey: 'r' },
      organizationId: 'org1',
    });
  });

  it('flattenUniqueWhere expands a compound key into scalar components', () => {
    expect(flattenUniqueWhere({ projectId_roleKey: { projectId: 'p1', roleKey: 'r' } })).toEqual({
      projectId: 'p1',
      roleKey: 'r',
    });
    expect(flattenUniqueWhere({ id: 'p1' })).toEqual({ id: 'p1' });
    // a relation object is NOT treated as a compound key
    expect(flattenUniqueWhere({ organizationId_date: { organizationId: 'o', date: new Date(0) } })).toEqual({
      organizationId: 'o',
      date: new Date(0),
    });
  });

  it('applyOrgToCreateData injects the FK on create and rejects a cross-tenant one', () => {
    expect(applyOrgToCreateData('Project', { name: 'X' }, 'org1')).toEqual({
      name: 'X',
      organizationId: 'org1',
    });
    expect(() => applyOrgToCreateData('Project', { name: 'X', organizationId: 'evil' }, 'org1')).toThrow(
      OrgScopeError,
    );
    // relation form is left untouched (Prisma rejects scalar + relation together)
    expect(applyOrgToCreateData('Project', { name: 'X', organization: { connect: { id: 'org1' } } }, 'org1')).toEqual({
      name: 'X',
      organization: { connect: { id: 'org1' } },
    });
    // update-side: validate only, don't inject
    expect(applyOrgToCreateData('Project', { name: 'X' }, 'org1', { inject: false })).toEqual({ name: 'X' });
    // P1 — RaidEntry now has its own organizationId column, so the create
    // path injects it just like any other DIRECT_ORG model.
    expect(applyOrgToCreateData('RaidEntry', { title: 'X' }, 'org1')).toEqual({
      title: 'X',
      organizationId: 'org1',
    });
  });
});

describe('org-scope — live DB enforcement', () => {
  const createdOrgIds: string[] = [];
  let orgAId: string;
  let orgBId: string;
  let projAId: string;
  let projBId: string;

  afterAll(async () => {
    const ids = createdOrgIds.splice(0);
    if (ids.length > 0) {
      await db.organization.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('sets up two tenants', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [orgA, orgB] = await Promise.all([
      db.organization.create({ data: { name: 'Scope A', slug: `scope-a-${stamp}` } }),
      db.organization.create({ data: { name: 'Scope B', slug: `scope-b-${stamp}` } }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgA.id, orgB.id);

    // Created under an explicit scope — proves the create path both injects
    // the FK (orgA, implicit) and honours an explicit matching one (orgB).
    const projA = await runWithOrgScope(orgAId, async () =>
      // organizationId omitted on purpose — the extension injects it. TS
      // types `db` as the un-extended client, so it still wants the field.
      // @ts-expect-error - see above
      db.project.create({ data: { name: 'A-proj', externalId: `A-${stamp}` } }),
    );
    const projB = await runWithOrgScope(orgBId, async () =>
      db.project.create({ data: { name: 'B-proj', externalId: `B-${stamp}`, organizationId: orgBId } }),
    );
    projAId = projA.id;
    projBId = projB.id;
    expect(projA.organizationId).toBe(orgAId);
    expect(projB.organizationId).toBe(orgBId);
  });

  it('a scoped findMany with no where sees only its own tenant', async () => {
    const rows = await runWithOrgScope(orgAId, async () => db.project.findMany());
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(projAId);
    expect(ids).not.toContain(projBId);
  });

  it('a scoped findFirst cannot reach across tenants by id', async () => {
    const hit = await runWithOrgScope(orgAId, async () => db.project.findFirst({ where: { id: projBId } }));
    expect(hit).toBeNull();
  });

  it('a scoped findUnique (rerouted to findFirst) cannot reach across tenants', async () => {
    const hit = await runWithOrgScope(orgAId, async () => db.project.findUnique({ where: { id: projBId } }));
    expect(hit).toBeNull();
    const own = await runWithOrgScope(orgAId, async () => db.project.findUnique({ where: { id: projAId } }));
    expect(own?.id).toBe(projAId);
  });

  it('a scoped update cannot touch another tenant row (P2025)', async () => {
    await expect(
      runWithOrgScope(orgAId, async () => db.project.update({ where: { id: projBId }, data: { name: 'hacked' } })),
    ).rejects.toMatchObject({ code: 'P2025' });
    const b = await runWithOrgScope(orgBId, async () => db.project.findUnique({ where: { id: projBId } }));
    expect(b?.name).toBe('B-proj');
  });

  it('a create that names another tenant is refused', async () => {
    await expect(
      runWithOrgScope(orgAId, async () =>
        db.project.create({ data: { name: 'x', externalId: 'x', organizationId: orgBId } }),
      ),
    ).rejects.toBeInstanceOf(OrgScopeError);
  });

  it('runUnscoped sees every tenant', async () => {
    const rows = await runUnscoped('test', async () =>
      db.project.findMany({ where: { id: { in: [projAId, projBId] } } }),
    );
    expect(rows.map((r) => r.id).sort()).toEqual([projAId, projBId].sort());
  });
});
