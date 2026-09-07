/**
 * A2R — provision the family guest (viewer) accounts.
 *
 *   npm run guests:seed [-- --org <slug>] [--yes-prod]
 *
 * Creates 5 read-only observer accounts as `MembershipRole.VIEWER` members
 * of a demo organization (default: `a2r-ventures-demo`), with
 * `deliveryRole = VIEWER` — the strict read-only tenant tier added in
 * v1.16.0 (portfolio + SteerCo view, zero edit, financials scrubbed).
 *
 * Idempotent: re-running upserts the users + memberships and re-hashes the
 * shared password. Direct DB; a production run needs --yes-prod / a typed
 * confirmation (scripts/lib/cli-io.ts).
 *
 * The shared password `a2r-DOS-233444` satisfies the strength policy
 * (>= 12, upper + lower + digit). `mustChangePassword` is false so the
 * guests can sign in and browse immediately.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '../src/lib/auth/password-policy';
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

const SHARED_PASSWORD = 'a2r-DOS-233444';
const GUESTS = [
  { name: 'Abha', email: 'abha@a2rventures.local' },
  { name: 'Janvi', email: 'janvi@a2rventures.local' },
  { name: 'Honey', email: 'honey@a2rventures.local' },
  { name: 'Griffin', email: 'griffin@a2rventures.local' },
  { name: 'Chan', email: 'chan@a2rventures.local' },
];

function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const weak = validatePasswordStrength(SHARED_PASSWORD);
  if (weak) {
    console.error(`The shared guest password no longer meets the policy: ${weak}`);
    process.exit(1);
  }

  const orgSlug = (argFlag('org') ?? 'a2r-ventures-demo').toLowerCase().trim();
  const org = await db.organization.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true } });
  if (!org) {
    console.error(`No organization with slug "${orgSlug}". Pass --org <slug>.`);
    process.exit(1);
  }

  await assertProdWriteAllowed(process.env.DATABASE_URL, `seed 5 guest viewer accounts into "${org.name}"`);

  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);

  for (const g of GUESTS) {
    const email = g.email.toLowerCase();
    const user = await db.user.upsert({
      where: { email },
      create: { email, name: g.name, passwordHash, mustChangePassword: false },
      update: { name: g.name, passwordHash, mustChangePassword: false },
      select: { id: true },
    });
    await db.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      create: { userId: user.id, organizationId: org.id, role: 'VIEWER', deliveryRole: 'VIEWER' },
      update: { role: 'VIEWER', deliveryRole: 'VIEWER' },
    });
    console.log(`  ✓ ${g.name.padEnd(8)} ${email.padEnd(30)} → VIEWER of ${org.name}`);
  }

  console.log(`\n5 guest viewer accounts ready. Shared password: ${SHARED_PASSWORD}`);
  console.log(`They land in "${org.name}" read-only (control tower · SteerCo · reports; no edit, financials scrubbed).`);
}

main()
  .catch((err) => {
    console.error(`[seed-guests] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
