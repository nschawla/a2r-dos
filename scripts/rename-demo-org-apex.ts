/**
 * One-time data fix: the flagship demo organization's display name is
 * being renamed off "PS-DOS Demo" to "Apex Global Services" — the old name
 * duplicated the word "Demo" already used by the Ops Console's Auto Demo
 * launcher (src/components/demo/AutoDemoLaunchModal.tsx), which read as
 * confusing in walkthroughs. `prisma/seed.ts`'s `if (!org) create(...)`
 * guard never touches an already-existing row, so a code change alone
 * doesn't rename it on an already-seeded environment — same gap
 * `rebrand-demo-org-name.ts` (the prior A2R-DOS→PS-DOS rename) called out.
 *
 *   npm run demo:org:rename:apex -- [--slug <slug>] [--yes-prod]
 *
 * Idempotent (no-op if already renamed). Direct DB; a production run needs
 * --yes-prod / a typed confirmation (scripts/lib/cli-io.ts). The `slug`
 * (`a2r-ventures-demo`) is left unchanged — it's infrastructure (routes,
 * `?org=` params, the family guest accounts' org membership), same as the
 * a2rventures.com domain and the guest accounts' @a2rventures.local emails.
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

const OLD_NAME = 'PS-DOS Demo';
const NEW_NAME = 'Apex Global Services';

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
    console.error(`[rename-demo-org-apex] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
