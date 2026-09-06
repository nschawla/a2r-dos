import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * P0-2 (Phase C) — direct-SQL RLS enforcement, bypassing the Prisma model
 * layer and the org-scope extension entirely.
 *
 * DORMANT: this whole suite is skipped unless `RLS_APP_DATABASE_URL` is set
 * (the restricted `a2r_app` role's connection string). It only runs once
 * migrations 16 + 17 are applied and the role exists — see
 * docs/RLS_ENFORCEMENT_RUNBOOK.md. `scripts/rls-smoke.ts` is the full
 * parametrised check across all 29 tables; this is the CI gate for the
 * two highest-value invariants.
 */
const APP_URL = process.env.RLS_APP_DATABASE_URL;

describe.skipIf(!APP_URL)('DB-level RLS — a2r_app restricted role', () => {
  const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const app = new PrismaClient({ datasourceUrl: APP_URL });

  afterAll(async () => {
    await owner.$disconnect();
    await app.$disconnect();
  });

  it('an unscoped connection is fail-closed (0 rows on projects)', async () => {
    const rows = await app.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*)::bigint AS n FROM "projects"');
    expect(rows[0]!.n).toBe(0n);
  });

  it('a GUC-scoped connection sees exactly its tenant and no other', async () => {
    const orgs = await owner.$queryRawUnsafe<{ id: string }[]>(
      'SELECT id FROM organizations WHERE "purgedAt" IS NULL ORDER BY "createdAt" LIMIT 2',
    );
    if (orgs.length < 2) return; // not enough tenants seeded
    const a = orgs[0]!.id;

    const truth = await owner.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT count(*)::bigint AS n FROM "projects" WHERE "organizationId" = $1', a,
    );
    const scoped = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", a);
      return tx.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*)::bigint AS n FROM "projects"');
    });
    expect(scoped[0]!.n).toBe(truth[0]!.n);
  });

  it('a cross-tenant INSERT is rejected (42501 / row-level security)', async () => {
    const orgs = await owner.$queryRawUnsafe<{ id: string }[]>(
      'SELECT id FROM organizations WHERE "purgedAt" IS NULL ORDER BY "createdAt" LIMIT 2',
    );
    if (orgs.length < 2) return;
    const [a, b] = [orgs[0]!.id, orgs[1]!.id];

    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", a);
        await tx.$executeRawUnsafe(
          'INSERT INTO "practices" ("id","organizationId","name","createdAt") VALUES ($1,$2,$3,now())',
          `rls-test-${Date.now()}`, b, 'rls-test',
        );
      }),
    ).rejects.toThrow();
  });
});
