/**
 * A2R — account password CLI (break-glass; direct DB access).
 *
 *   npm run user:password:status -- <email>
 *   npm run user:password:set    -- <email> [--generate] [--password-stdin]
 *                                           [--no-force-change] [--yes-prod]
 *
 * There is no self-service "forgot password" flow in this build
 * (`changePasswordAction` needs the *current* password). This is the
 * recovery path for a locked-out account — mirroring `scripts/grant-staff.ts`
 * and `scripts/ops-mfa.ts`.
 *
 * The new password is NEVER taken as a command-line argument (visible in
 * `ps` / shell history). It is read from a masked interactive prompt, or
 * from stdin with `--password-stdin`, or generated with `--generate`.
 *
 * `set` semantics (an admin forcing a reset):
 *   - `mustChangePassword = true` by default — the recipient must pick their
 *     own on next sign-in (`src/middleware.ts` -> /change-password).
 *     `--no-force-change` clears it (you are resetting your OWN password).
 *   - `passwordChangedAt` is stamped and `sessionVersion` is bumped, so
 *     every existing session for that account is revoked immediately.
 *   - a production database requires `--yes-prod` or a typed confirmation.
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

async function findUser(email: string) {
  const u = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, email: true, name: true, passwordHash: true, mustChangePassword: true, passwordChangedAt: true, sessionVersion: true },
  });
  if (!u) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }
  return u;
}

async function main(): Promise<void> {
  const [cmd, email, extra] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (extra) {
    console.error(
      'A password on the command line is not accepted (it leaks into `ps` and shell history).\n' +
        'Run without it — you will be prompted — or use --password-stdin / --generate.',
    );
    process.exit(1);
  }

  if (cmd === 'status') {
    if (!email) {
      console.error('Usage: npm run user:password:status -- <email>');
      process.exit(1);
    }
    const u = await findUser(email);
    const grant = await db.staffGrant.findFirst({ where: { userId: u.id, revokedAt: null }, select: { id: true } });
    console.log(`${u.email}${u.name ? ` (${u.name})` : ''}`);
    console.log(`  password set:        ${u.passwordHash ? 'yes' : 'no (SSO-only)'}`);
    console.log(`  mustChangePassword:  ${u.mustChangePassword}`);
    console.log(`  passwordChangedAt:   ${u.passwordChangedAt ? u.passwordChangedAt.toISOString() : '(never)'}`);
    console.log(`  sessionVersion:      ${u.sessionVersion}`);
    console.log(`  operator grant:      ${grant ? 'ACTIVE (can reach /ops)' : 'none'}`);
    return;
  }

  if (cmd === 'set') {
    if (!email) {
      console.error('Usage: npm run user:password:set -- <email> [--generate|--password-stdin] [--no-force-change]');
      process.exit(1);
    }
    const u = await findUser(email);
    await assertProdWriteAllowed(process.env.DATABASE_URL, `reset the password for ${u.email}`);

    const { password, generated } = await resolvePassword();
    const weak = validatePasswordStrength(password);
    if (weak) {
      console.error(`That password does not meet the policy: ${weak}`);
      process.exit(1);
    }

    // Admin-forced reset: force a change on next login unless explicitly
    // opted out (you resetting your own known password).
    const forceChange = generated || !hasFlag('no-force-change');

    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: u.id },
      data: {
        passwordHash,
        mustChangePassword: forceChange,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    console.log(`\nPassword updated for ${u.email}.`);
    console.log(`  every existing session revoked (sessionVersion ${u.sessionVersion} -> ${u.sessionVersion + 1}).`);
    console.log(`  mustChangePassword: ${forceChange} ${forceChange ? '(forced to /change-password on next sign-in)' : '(sign in with this password directly)'}`);
    if (generated) console.log(`\n  temporary password:  ${password}\n`);
    return;
  }

  console.error('Commands: status <email> | set <email> [--generate|--password-stdin] [--no-force-change]');
  process.exit(1);
}

main()
  .catch((err) => {
    console.error(`[reset-password] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
