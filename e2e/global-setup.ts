import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertNonProductionTestDb } from '../tests/helpers/db-target';
import { seal } from '../src/lib/crypto/secret-box';
import { E2E_OPERATOR_MFA_SECRET } from './helpers/ops-mfa';

/** Operators the Playwright suite elevates — each needs an activated
 * `operator_mfa` row (Batch 2) so `elevateOps` can pass a live TOTP code. */
const OPERATOR_EMAILS = ['ops@a2rventures.com', 'master.e2e@a2rventures.com'];

/** v1.16.0 — the family guest (viewer) accounts, for Suite Q. */
const GUEST_PASSWORD = 'a2r-DOS-233444';
const GUESTS = [
  { name: 'Abha', email: 'abha@a2rventures.local' },
  { name: 'Janvi', email: 'janvi@a2rventures.local' },
  { name: 'Honey', email: 'honey@a2rventures.local' },
  { name: 'Griffin', email: 'griffin@a2rventures.local' },
  { name: 'Chan', email: 'chan@a2rventures.local' },
];

async function seedGuestViewers(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = (await import('bcryptjs')).default;
  const db = new PrismaClient();
  try {
    const org = await db.organization.findUnique({ where: { slug: 'a2r-ventures-demo' }, select: { id: true } });
    if (!org) return;
    const passwordHash = await bcrypt.hash(GUEST_PASSWORD, 10);
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
    }
  } finally {
    await db.$disconnect();
  }
}

async function seedOperatorMfa(): Promise<void> {
  const db = new PrismaClient();
  try {
    for (const email of OPERATOR_EMAILS) {
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) continue;
      await db.operatorMfa.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          secretCiphertext: seal(E2E_OPERATOR_MFA_SECRET),
          activatedAt: new Date(),
          recoveryCodeHashes: [],
        },
        update: {
          secretCiphertext: seal(E2E_OPERATOR_MFA_SECRET),
          pendingSecretCiphertext: null,
          activatedAt: new Date(),
          lastStepCounter: null,
        },
      });
    }
  } finally {
    await db.$disconnect();
  }
}

/**
 * WP2 — the Playwright suite provisions and purges tenants and creates /
 * deletes rows through the running dev server. Refuse to start if that
 * server's database is production, and pin the dev server (spawned next by
 * Playwright's `webServer`) to the resolved TEST database — Next.js `dev`
 * only loads `.env` / `.env.local`, not `.env.test`, so we push the value
 * into `process.env` here where the webServer child inherits it.
 *
 * Resolution order:  TEST_DATABASE_URL → .env.test → .env
 */
function loadEnvFile(file: string): void {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent */
  }
}

export default async function globalSetup(): Promise<void> {
  // `.env.test` wins over `.env` (first-write-wins above).
  loadEnvFile('.env.test');
  loadEnvFile('.env');

  const url = assertNonProductionTestDb('playwright');

  // Pin the dev server to the test DB regardless of what `.env` holds.
  process.env.DATABASE_URL = url;
  const testDirect = process.env.TEST_DIRECT_URL || readVar('.env.test', 'DIRECT_URL');
  if (testDirect) process.env.DIRECT_URL = testDirect;

  // eslint-disable-next-line no-console
  console.log(`[e2e] target DB pinned to non-production (${url.replace(/:[^:@/]+@/, ':****@')})`);

  await seedOperatorMfa();
  await seedGuestViewers();
  // eslint-disable-next-line no-console
  console.log('[e2e] operator MFA + guest viewer accounts seeded');
}

function readVar(file: string, key: string): string | undefined {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
      if (m && m[1] !== undefined) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent */
  }
  return undefined;
}
