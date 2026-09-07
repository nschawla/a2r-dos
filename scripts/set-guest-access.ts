/**
 * A2R — set the access tier for the 5 family guest accounts.
 *
 *   npm run guests:access -- --tier full   [--yes-prod]
 *   npm run guests:access -- --tier viewer [--yes-prod]
 *
 * The guest accounts (see scripts/seed-guests.ts) are normally the strict
 * read-only `VIEWER` tier. Pre-launch, while the product is still being
 * built and the family is giving feedback, `--tier full` promotes them to
 * see everything:
 *
 *   full   → Membership OWNER / deliveryRole ADMIN in EVERY organization
 *            + an active SUPER_ADMIN `staff_grants` entitlement (the /ops
 *            operator console, cross-tenant, read access to every surface).
 *            Mutating operator actions still require the operator to enroll
 *            a second factor and take a JIT elevation — the promotion does
 *            not bypass that.
 *
 *   viewer → back to the launch posture: Membership VIEWER / VIEWER in the
 *            primary demo org, memberships in every other org removed, and
 *            every active staff grant revoked. Run this before go-live.
 *
 * Idempotent. Direct DB; a production run needs --yes-prod / a typed
 * confirmation (scripts/lib/cli-io.ts). The shared password is unchanged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertProdWriteAllowed } from './lib/cli-io';

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* the client surfaces its own error */
  }
}

loadEnv();
const db = new PrismaClient();

const PRIMARY_ORG_SLUG = 'a2r-ventures-demo';
const GUEST_EMAILS = [
  'abha@a2rventures.local',
  'janvi@a2rventures.local',
  'honey@a2rventures.local',
  'griffin@a2rventures.local',
  'chan@a2rventures.local',
];

function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function promoteFull(): Promise<void> {
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  if (orgs.length === 0) {
    console.error('No organizations found.');
    process.exit(1);
  }

  for (const email of GUEST_EMAILS) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!user) {
      console.log(`  – ${email.padEnd(30)} no account — skipped (they must sign in once first)`);
      continue;
    }

    for (const org of orgs) {
      await db.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
        create: { userId: user.id, organizationId: org.id, role: 'OWNER', deliveryRole: 'ADMIN' },
        update: { role: 'OWNER', deliveryRole: 'ADMIN' },
      });
    }

    const grant = await db.staffGrant.findFirst({ where: { userId: user.id, revokedAt: null }, select: { id: true, role: true } });
    if (!grant) {
      await db.staffGrant.create({
        data: { userId: user.id, reason: 'Pre-launch — family tester, full access for build feedback', role: 'SUPER_ADMIN' },
      });
    } else if (grant.role !== 'SUPER_ADMIN') {
      await db.staffGrant.update({ where: { id: grant.id }, data: { role: 'SUPER_ADMIN' } });
    }

    console.log(`  ✓ ${(user.name ?? email).padEnd(10)} ${email.padEnd(30)} → OWNER/ADMIN in ${orgs.length} org(s) + SUPER_ADMIN operator`);
  }
}

async function demoteViewer(): Promise<void> {
  const primary = await db.organization.findUnique({ where: { slug: PRIMARY_ORG_SLUG }, select: { id: true, name: true } });
  if (!primary) {
    console.error(`No organization with slug "${PRIMARY_ORG_SLUG}".`);
    process.exit(1);
  }

  for (const email of GUEST_EMAILS) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!user) {
      console.log(`  – ${email.padEnd(30)} no account — skipped`);
      continue;
    }

    await db.membership.deleteMany({ where: { userId: user.id, organizationId: { not: primary.id } } });
    await db.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: primary.id } },
      create: { userId: user.id, organizationId: primary.id, role: 'VIEWER', deliveryRole: 'VIEWER' },
      update: { role: 'VIEWER', deliveryRole: 'VIEWER' },
    });
    const revoked = await db.staffGrant.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    console.log(`  ✓ ${(user.name ?? email).padEnd(10)} ${email.padEnd(30)} → VIEWER of ${primary.name}${revoked.count ? ` (revoked ${revoked.count} grant)` : ''}`);
  }
}

async function main(): Promise<void> {
  const tier = (argFlag('tier') ?? '').toLowerCase();
  if (tier !== 'full' && tier !== 'viewer') {
    console.error('Usage: npm run guests:access -- --tier <full|viewer> [--yes-prod]');
    process.exit(1);
  }

  await assertProdWriteAllowed(process.env.DATABASE_URL, `set the 5 family guest accounts to "${tier}" access`);

  if (tier === 'full') {
    console.log('Promoting the family guest accounts to full access (build-feedback mode):');
    await promoteFull();
    console.log('\nDone. They now see every workspace as OWNER/ADMIN and can browse the /ops operator console.');
    console.log('Run `npm run guests:access -- --tier viewer` to put them back to strict read-only before go-live.');
  } else {
    console.log('Restoring the family guest accounts to the strict read-only launch posture:');
    await demoteViewer();
    console.log('\nDone. Back to VIEWER: portfolio + SteerCo view only, no edit, financials scrubbed, no operator access.');
  }
}

main()
  .catch((err) => {
    console.error(`[set-guest-access] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
