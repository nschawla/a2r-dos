/**
 * A2R Operator Control Plane — bootstrap a new operator account.
 *
 *   npm run operator:create -- <email> "<name>" [--by <granter-email>] [--reason "<why>"]
 *                                              [--generate|--password-stdin] [--no-force-change] [--yes-prod]
 *
 * There is no self-serve invite flow: `/register` only creates new
 * organizations and `staff:grant` needs the account to exist first. This
 * does the whole bootstrap in one shot — the `User` row, its password, and
 * an active `staff_grants` entitlement.
 *
 * The password is NEVER a command-line argument. It is read from a masked
 * prompt, from stdin (`--password-stdin`), or generated (`--generate`).
 * `mustChangePassword = true` by default (the operator picks their own on
 * first sign-in); `--no-force-change` opts out. A production database
 * requires `--yes-prod` or a typed confirmation.
 *
 * Refuses if the account already exists — use `user:password:set` +
 * `staff:grant` for an existing one. The new operator still enrolls a
 * second factor at /ops/security before they can elevate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '../src/lib/auth/password-policy';
import { resolvePassword, assertProdWriteAllowed, hasFlag } from './lib/cli-io';

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

function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const positional = process.argv.slice(2).filter((a, i, arr) => {
    if (a.startsWith('--')) return false;
    return !(i > 0 && arr[i - 1]?.startsWith('--')); // drop a --flag's value
  });
  const [email, name, extra] = positional;

  if (!email || !name) {
    console.error('Usage: npm run operator:create -- <email> "<name>" [--by <granter-email>] [--reason "<why>"] [--generate|--password-stdin]');
    process.exit(1);
  }
  if (extra) {
    console.error(
      'A password on the command line is not accepted. Run without it (you will be prompted), or use --password-stdin / --generate.',
    );
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) {
    console.error(
      `${normalizedEmail} already exists. Use:\n` +
        `  npm run user:password:set -- ${normalizedEmail}\n` +
        `  npm run staff:grant       -- ${normalizedEmail} "<reason>"`,
    );
    process.exit(1);
  }

  await assertProdWriteAllowed(process.env.DATABASE_URL, `create operator ${normalizedEmail}`);

  const { password, generated } = await resolvePassword();
  const weak = validatePasswordStrength(password);
  if (weak) {
    console.error(`That password does not meet the policy: ${weak}`);
    process.exit(1);
  }
  const forceChange = generated || !hasFlag('no-force-change');

  const reason = argFlag('reason') ?? 'CLI bootstrap — new operator';
  const roleArg = (argFlag('role') ?? 'SUPER_ADMIN').toUpperCase();
  const OPERATOR_ROLES = ['SUPER_ADMIN', 'PROVISIONING', 'SUPPORT', 'AUDITOR', 'BILLING', 'VIEWER'];
  if (!OPERATOR_ROLES.includes(roleArg)) {
    console.error(`--role must be one of: ${OPERATOR_ROLES.join(', ')}`);
    process.exit(1);
  }
  const byEmail = argFlag('by');
  let grantedByUserId: string | null = null;
  if (byEmail) {
    const granter = await db.user.findUnique({ where: { email: byEmail.toLowerCase().trim() }, select: { id: true } });
    if (!granter) {
      console.error(`--by ${byEmail}: no such account.`);
      process.exit(1);
    }
    grantedByUserId = granter.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: { email: normalizedEmail, name: name.trim(), passwordHash, mustChangePassword: forceChange },
  });
  await db.staffGrant.create({ data: { userId: user.id, grantedByUserId, reason, role: roleArg as never } });

  console.log(`\nCreated operator ${normalizedEmail} (${name.trim()}).`);
  console.log(`  operator grant:      ACTIVE (${roleArg}) — can reach /ops`);
  console.log(`  mustChangePassword:  ${forceChange} ${forceChange ? '(forced to /change-password on first sign-in)' : ''}`);
  if (generated) console.log(`\n  temporary password:  ${password}`);
  console.log(`\n  Next: they sign in, then enroll a second factor at /ops/security before they can elevate.`);
}

main()
  .catch((err) => {
    console.error(`[create-operator] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
