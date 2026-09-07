/**
 * A2R — account password CLI (break-glass; direct DB access).
 *
 *   npm run user:password:status -- <email>
 *   npm run user:password:set    -- <email> ["<new password>"]
 *
 * There is no self-service "forgot password" flow in this build
 * (`changePasswordAction` needs the *current* password). This is the
 * recovery path for a locked-out account — including the bootstrap
 * operator — mirroring `scripts/grant-staff.ts` and `scripts/ops-mfa.ts`.
 *
 * `set`:
 *   - password given  → set it verbatim (must pass the strength policy),
 *     `mustChangePassword = false` (you chose it, it is yours).
 *   - password omitted → generate a strong temporary one, print it once,
 *     `mustChangePassword = true` (recipient must pick their own on first
 *     sign-in — `src/middleware.ts` → /change-password).
 * Either way `passwordChangedAt` is stamped and `sessionVersion` is bumped,
 * so every existing session for that account is revoked immediately.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '../src/lib/auth/password-policy';

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

/** A 20-char temp password that always satisfies the strength policy. */
function generatePassword(): string {
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[randomBytes(1)[0]! % set.length]).join('');
  const raw =
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4) +
    pick('abcdefghijkmnpqrstuvwxyz', 10) +
    pick('23456789', 4) +
    '-';
  return raw
    .split('')
    .sort(() => (randomBytes(1)[0]! < 128 ? -1 : 1))
    .join('');
}

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
  const [cmd, email, maybePassword] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

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
      console.error('Usage: npm run user:password:set -- <email> ["<new password>"]');
      process.exit(1);
    }
    const u = await findUser(email);

    const generated = !maybePassword;
    const password = maybePassword ?? generatePassword();
    const weak = validatePasswordStrength(password);
    if (weak) {
      console.error(`That password does not meet the policy: ${weak}`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: u.id },
      data: {
        passwordHash,
        mustChangePassword: generated,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    console.log(`Password updated for ${u.email}.`);
    console.log(`  every existing session for this account is now revoked (sessionVersion ${u.sessionVersion} → ${u.sessionVersion + 1}).`);
    if (generated) {
      console.log(`\n  temporary password:  ${password}`);
      console.log(`  the account will be forced to /change-password on next sign-in.`);
    } else {
      console.log(`  mustChangePassword is cleared — sign in with the new password directly.`);
    }
    return;
  }

  console.error('Commands: status <email> | set <email> ["<new password>"]');
  process.exit(1);
}

main()
  .catch((err) => {
    console.error('[reset-password] failed', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
