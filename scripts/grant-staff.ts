/**
 * A2R Operator Control Plane — staff-access CLI (P0 #2).
 *
 *   npm run staff:list
 *   npm run staff:grant  -- <email> "<reason>"   [--by <granter-email>]
 *   npm run staff:revoke -- <email>              [--by <revoker-email>]
 *
 * Staff access is an explicit `staff_grants` row — there is no
 * `User.isA2rStaff` boolean and no `@a2rventures.com` email shortcut. Use
 * this for the initial bootstrap grant on a fresh deployment; day-to-day
 * granting is done in the Ops Console at /ops/staff.
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
      if (!m) continue;
      const [, key, rawVal] = m;
      if (key && rawVal !== undefined && !process.env[key]) {
        process.env[key] = rawVal.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* the client will surface its own connection error */
  }
}

loadEnv();
const db = new PrismaClient();

function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function userIdForEmail(email: string): Promise<string> {
  const u = await db.user.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true } });
  if (!u) {
    console.error(`No account for ${email}. They must sign in once before they can be granted access.`);
    process.exit(1);
  }
  return u.id;
}

async function main(): Promise<void> {
  const [cmd, positional] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (cmd === 'list') {
    const rows = await db.staffGrant.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    });
    if (rows.length === 0) {
      console.log('No accounts currently hold Operator Control Plane access.');
      return;
    }
    console.log(`${rows.length} operator(s):`);
    for (const r of rows) {
      console.log(`  ${r.user.email.padEnd(34)} granted ${r.createdAt.toISOString().slice(0, 10)}  — ${r.reason}`);
    }
    return;
  }

  if (cmd === 'grant') {
    const email = positional;
    const reason = process.argv.slice(2).find((a) => a !== 'grant' && a !== email && !a.startsWith('--'));
    if (!email || !reason) {
      console.error('Usage: npm run staff:grant -- <email> "<reason>" [--by <granter-email>]');
      process.exit(1);
    }
    const userId = await userIdForEmail(email);
    await assertProdWriteAllowed(process.env.DATABASE_URL, `grant operator access to ${email}`);
    const grantedByUserId = argFlag('by') ? await userIdForEmail(argFlag('by')!) : null;
    const existing = await db.staffGrant.findFirst({ where: { userId, revokedAt: null }, select: { id: true } });
    if (existing) {
      console.log(`${email} already holds an active grant — nothing to do.`);
      return;
    }
    const roleArg = (argFlag('role') ?? 'SUPER_ADMIN').toUpperCase();
    const OPERATOR_ROLES = ['SUPER_ADMIN', 'PROVISIONING', 'SUPPORT', 'AUDITOR', 'BILLING', 'VIEWER'];
    if (!OPERATOR_ROLES.includes(roleArg)) {
      console.error(`--role must be one of: ${OPERATOR_ROLES.join(', ')}`);
      process.exit(1);
    }
    await db.staffGrant.create({ data: { userId, grantedByUserId, reason, role: roleArg as never } });
    console.log(`Granted Operator Control Plane access (${roleArg}) to ${email}.`);
    return;
  }

  if (cmd === 'revoke') {
    const email = positional;
    if (!email) {
      console.error('Usage: npm run staff:revoke -- <email> [--by <revoker-email>]');
      process.exit(1);
    }
    const userId = await userIdForEmail(email);
    await assertProdWriteAllowed(process.env.DATABASE_URL, `revoke operator access for ${email}`);
    const revokedByUserId = argFlag('by') ? await userIdForEmail(argFlag('by')!) : null;
    const res = await db.staffGrant.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId },
    });
    if (res.count === 0) {
      console.log(`${email} does not currently hold access.`);
      return;
    }
    console.log(`Revoked Operator Control Plane access for ${email} (${res.count} grant row(s)).`);
    return;
  }

  console.error('Commands: list | grant <email> "<reason>" | revoke <email>');
  process.exit(1);
}

main()
  .catch((err) => {
    console.error('[staff-cli] failed', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
