import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { runWithOrgScope } from '@/lib/db/org-scope';

/**
 * Phase 1 (v1.11.0) — the monetary / rate / margin columns are Postgres
 * NUMERIC (migration 00000000000018). This checks the two properties a
 * float column can't give: an exact round-trip at the column scale, and an
 * exact SQL SUM() with no accumulated representation error.
 * Live DB, self-cleaning.
 */
describe('financial precision — NUMERIC columns', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const orgIds: string[] = [];

  afterAll(async () => {
    for (const id of orgIds) {
      await runWithOrgScope(id, async () => {
        await db.financialActual.deleteMany({ where: { organizationId: id } });
        await db.project.deleteMany({ where: { organizationId: id } });
        await db.deliveryRole.deleteMany({ where: { organizationId: id } });
      });
    }
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  let seq = 0;
  async function makeOrg() {
    const s = `${stamp}-${seq++}`;
    const o = await db.organization.create({ data: { name: `fin-prec ${s}`, slug: `fin-prec-${s}` } });
    orgIds.push(o.id);
    return o.id;
  }

  it('a rate round-trips exactly at 4 dp; a margin at 4 dp', async () => {
    const orgId = await makeOrg();
    await runWithOrgScope(orgId, async () => {
      const role = await db.deliveryRole.create({
        data: { organizationId: orgId, name: 'Precise', billRate: 210.5, costRate: 152.3399 },
      });
      const read = await db.deliveryRole.findUniqueOrThrow({ where: { id: role.id } });
      expect(read.billRate.toString()).toBe('210.5');
      expect(read.costRate.toString()).toBe('152.3399');

      const pol = await db.orgPolicy.create({ data: { organizationId: orgId, marginCritPct: 7.125 } });
      const polRead = await db.orgPolicy.findUniqueOrThrow({ where: { id: pol.id } });
      expect(polRead.marginCritPct.toString()).toBe('7.125');
    });
  });

  it('SUM(cost) over many rows is exact — no float drift', async () => {
    const orgId = await makeOrg();
    await runWithOrgScope(orgId, async () => {
      const project = await db.project.create({ data: { organizationId: orgId, name: `p-${stamp}` } });
      // 0.10 + 0.20 + 0.30 is the classic float-drift trio; at NUMERIC(14,2)
      // the individual values and the SQL SUM are exact.
      const costs = ['0.10', '0.20', '0.30'];
      for (const [i, c] of costs.entries()) {
        await db.financialActual.create({
          data: { organizationId: orgId, projectId: project.id, roleKey: `r${i}`, cost: c },
        });
      }
      const agg = await db.financialActual.aggregate({
        where: { projectId: project.id },
        _sum: { cost: true },
      });
      expect(agg._sum.cost?.toNumber()).toBe(0.6);
      // the naive JS float sum of the same three values DOES drift:
      expect(costs.reduce((s, c) => s + Number(c), 0)).not.toBe(0.6);
    });
  });
});
