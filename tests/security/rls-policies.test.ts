import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * P0-2 (Phase C) — direct-SQL RLS enforcement, bypassing the Prisma model
 * layer and the org-scope extension entirely.
 *
 * Auto-skips unless the restricted `a2r_app` role exists in the target
 * database (migrations 16 + 17 applied — staging today, production later).
 * Each check runs inside a transaction that does `SET LOCAL ROLE a2r_app` +
 * `SET LOCAL app.current_org`, exactly as `src/lib/db/with-tenant-tx.ts`
 * does at runtime. `scripts/rls-smoke.ts` is the full 29-table sweep; this
 * is the CI gate for the highest-value invariants.
 */
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
let roleExists = false;

async function scoped<T>(orgId: string, body: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('role', 'a2r_app', true)`);
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, orgId);
    return body(tx);
  });
}

beforeAll(async () => {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM pg_roles WHERE rolname = 'a2r_app'`,
  );
  roleExists = rows[0]!.n > 0n;
});

afterAll(async () => {
  await db.$disconnect();
});

describe('DB-level RLS — a2r_app restricted role', () => {
  it('an empty-GUC connection is fail-closed (0 rows on projects)', async () => {
    if (!roleExists) return;
    const rows = await scoped('', (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "projects"`),
    );
    expect(rows[0]!.n).toBe(0n);
  });

  it('a GUC-scoped connection sees exactly its tenant', async () => {
    if (!roleExists) return;
    const orgs = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM organizations WHERE "purgedAt" IS NULL ORDER BY "createdAt" LIMIT 2`,
    );
    if (orgs.length < 2) return;
    const a = orgs[0]!.id;
    const truth = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "projects" WHERE "organizationId" = $1`, a,
    );
    const scopedCount = await scoped(a, (tx) =>
      tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "projects"`),
    );
    expect(scopedCount[0]!.n).toBe(truth[0]!.n);
  });

  it('a cross-tenant INSERT is rejected by the policy WITH CHECK', async () => {
    if (!roleExists) return;
    const orgs = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM organizations WHERE "purgedAt" IS NULL ORDER BY "createdAt" LIMIT 2`,
    );
    if (orgs.length < 2) return;
    const [a, b] = [orgs[0]!.id, orgs[1]!.id];
    await expect(
      scoped(a, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "practices" ("id","organizationId","name","createdAt") VALUES ($1,$2,$3,now())`,
          `rls-test-${Date.now()}`, b, 'rls-test',
        ),
      ),
    ).rejects.toThrow(/row-level security|42501/);
  });
});
