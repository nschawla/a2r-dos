/**
 * A2R Operator Control Plane — operator second-factor CLI (Batch 2).
 *
 *   npm run ops:mfa:status                        # list operators + MFA state
 *   npm run ops:mfa:reset  -- <email> [--yes-prod]  # remove an operator's factor
 *
 * `reset` is the break-glass for a fully locked-out operator (lost device
 * AND out of recovery codes). It only DELETES the enrollment — the operator
 * must re-enroll at /ops/security before they can elevate again. Direct DB
 * access, like the initial `staff:grant` bootstrap; there is no runtime
 * (web) path that can strip an operator's MFA, by design.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertProdWriteAllowed } from './lib/cli-io';

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* the client will surface its own connection error */
  }
}

loadEnv();
const db = new PrismaClient();

async function main(): Promise<void> {
  const [cmd, email] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (cmd === 'status') {
    const grants = await db.staffGrant.findMany({
      where: { revokedAt: null },
      include: { user: { select: { id: true, email: true } } },
    });
    if (grants.length === 0) {
      console.log('No accounts currently hold Operator Control Plane access.');
      return;
    }
    const mfa = await db.operatorMfa.findMany({
      where: { userId: { in: grants.map((g) => g.user.id) } },
    });
    const byUser = new Map(mfa.map((m) => [m.userId, m]));
    console.log(`${grants.length} operator(s):`);
    for (const g of grants) {
      const m = byUser.get(g.user.id);
      const state = !m
        ? 'NOT ENROLLED'
        : m.secretCiphertext && m.activatedAt
          ? `active (since ${m.activatedAt.toISOString().slice(0, 10)})`
          : 'pending enrollment';
      console.log(`  ${g.user.email.padEnd(34)} ${state}`);
    }
    return;
  }

  if (cmd === 'reset') {
    if (!email) {
      console.error('Usage: npm run ops:mfa:reset -- <email>');
      process.exit(1);
    }
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true },
    });
    if (!user) {
      console.error(`No account for ${email}.`);
      process.exit(1);
    }
    await assertProdWriteAllowed(process.env.DATABASE_URL, `remove the second factor for ${user.email}`);
    const res = await db.operatorMfa.deleteMany({ where: { userId: user.id } });
    if (res.count === 0) {
      console.log(`${user.email} had no second factor enrolled — nothing to do.`);
      return;
    }
    console.log(
      `Removed the second factor for ${user.email}. They must re-enroll at /ops/security before they can elevate.`,
    );
    return;
  }

  console.error('Commands: status | reset <email>');
  process.exit(1);
}

main()
  .catch((err) => {
    console.error('[ops-mfa-cli] failed', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
