import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Removes tenants the E2E suite provisions so it stays re-runnable and
 * doesn't leave junk orgs in the shared database — "Enterprise Sanity Inc"
 * (Suite D), "Purge Target Inc" (Suite I's purge test, which only
 * soft-deletes) and "JIT Elevation Test Inc" (Suite P) plus their
 * throwaway admin accounts.
 */
const TEST_TENANT_NAMES = ['Enterprise Sanity Inc', 'Purge Target Inc', 'JIT Elevation Test Inc'];
function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      const key = m?.[1];
      const rawVal = m?.[2];
      if (!key || rawVal === undefined) continue;
      if (!process.env[key]) process.env[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env not readable — Prisma will surface its own error below */
  }
}

export default async function globalTeardown() {
  loadDatabaseUrl();
  const db = new PrismaClient();
  try {
    const orgs = await db.organization.findMany({
      where: { name: { in: TEST_TENANT_NAMES } },
      include: { memberships: { select: { userId: true } } },
    });
    if (orgs.length === 0) return;

    const userIds = [...new Set(orgs.flatMap((o) => o.memberships.map((m) => m.userId)))];
    for (const org of orgs) {
      // The governance-history tables are onDelete: Restrict on Organization
      // (audit finding CMP-1 — a raw org delete must never wipe the SOC 2
      // ledger). The E2E suite's throwaway tenants have no compliance value,
      // so the teardown clears them explicitly before dropping the org;
      // everything else still cascades.
      await db.immutableAuditLedger.deleteMany({ where: { organizationId: org.id } });
      await db.auditLog.deleteMany({ where: { organizationId: org.id } });
      await db.activityLogEntry.deleteMany({ where: { organizationId: org.id } });
      await db.organization.delete({ where: { id: org.id } }); // cascades the remaining org-scoped rows
    }
    // delete the throwaway admin accounts that now hold no memberships
    for (const userId of userIds) {
      const remaining = await db.membership.count({ where: { userId } });
      if (remaining === 0) await db.user.delete({ where: { id: userId } });
    }
    // eslint-disable-next-line no-console
    console.log(`[e2e teardown] removed ${orgs.length} test tenant(s)`);
  } finally {
    await db.$disconnect();
  }
}
