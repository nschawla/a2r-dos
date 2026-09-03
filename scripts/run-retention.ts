/**
 * CMP-2 (GA-readiness audit) — data retention sweep, CLI trigger.
 *
 *   npm run retention:sweep            # dry run — counts only, deletes nothing
 *   npm run retention:sweep -- --apply # actually delete expired rows
 *
 * Prints the structured sweep report as JSON. Safe to wire into a cron
 * job. Never touches the immutable compliance ledger — see
 * src/server/services/data-retention.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRetentionSweep } from '@/server/services/data-retention';

/** tsx doesn't auto-load .env the way `next` / `prisma` do. */
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
    /* no .env — the sweep will surface its own connection error */
  }
}

async function main(): Promise<void> {
  loadEnv();
  const apply = process.argv.includes('--apply');

  const result = await runRetentionSweep({ dryRun: !apply });
  console.log(JSON.stringify(result, null, 2));

  if (!apply) {
    console.log('\nDry run — no rows deleted. Re-run with `-- --apply` to purge.');
  } else {
    console.log(`\nDeleted ${result.totalDeleted} row(s) across ${result.entries.length} record classes.`);
  }
  const failures = result.entries.filter((e) => e.error);
  if (failures.length > 0) {
    console.error(`\n${failures.length} target(s) failed:`, failures.map((f) => `${f.label}: ${f.error}`));
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[retention] sweep crashed', err);
    process.exit(1);
  }
);
