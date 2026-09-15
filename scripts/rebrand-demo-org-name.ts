/**
 * One-time data fix for the PS-DOS rebrand (A2R-DOS / A2R Delivery OS →
 * PS-DOS): the demo organization's *display name* was seeded as
 * "A2R DOS Demo" before this rebrand and `prisma/seed.ts`'s
 * `if (!org) create(...)` guard never touches an already-existing row, so
 * a code change alone doesn't rename it on an already-seeded environment.
 * This updates the live row's `name` only — the `slug`
 * (`a2r-ventures-demo`) is infrastructure (URLs, scripts, `?org=` params,
 * the family guest accounts' org membership) and is deliberately left
 * unchanged, same as the a2rventures.com domain and the guest accounts'
 * @a2rventures.local emails.
 *
 *   npm run rebrand:org-name -- [--slug <slug>] [--yes-prod]
 *
 * Idempotent (no-op if already renamed). Direct DB; a production run
 * needs --yes-prod / a typed confirmation (scripts/lib/cli-io.ts).
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

const OLD_NAME = 'A2R DOS Demo';
const NEW_NAME = 'PS-DOS Demo';

function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const slug = (argFlag('slug') ?? 'a2r-ventures-demo').toLowerCase().trim();

  const org = await db.organization.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!org) {
    console.error(`No organization with slug "${slug}".`);
    process.exit(1);
  }
  if (org.name !== OLD_NAME) {
    console.log(`"${slug}" is already named "${org.name}" — nothing to do.`);
    return;
  }

  await assertProdWriteAllowed(process.env.DATABASE_URL, `rename "${slug}"'s display name to "${NEW_NAME}"`);

  await db.organization.update({ where: { id: org.id }, data: { name: NEW_NAME } });
  console.log(`✓ Renamed "${slug}": "${OLD_NAME}" → "${NEW_NAME}". Slug unchanged (infrastructure).`);
}

main()
  .catch((err) => {
    console.error(`[rebrand-demo-org-name] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
