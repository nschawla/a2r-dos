/**
 * A2R Delivery OS — Phase 2 (v1.12.0): RLS break-glass CLI.
 *
 *   npx tsx scripts/rls-break-glass.ts status
 *   npx tsx scripts/rls-break-glass.ts engage --minutes 30 --reason "SEV1: cross-tenant 500s"
 *   npx tsx scripts/rls-break-glass.ts disengage
 *
 * Writes the `_rls_control` row directly over `DIRECT_URL` (no app imports —
 * usable when the app is down). While the window is open, `withTenantTx`
 * runs as `postgres` and DB-level RLS is inert; app-tier tenant scoping
 * (src/lib/db/org-scope.ts) still applies. The window auto-expires — nothing
 * to clean up if you forget to disengage.
 *
 * See docs/RLS_ENFORCEMENT_RUNBOOK.md § "Break-glass".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const MAX_WINDOW_MINUTES = 60;

function loadEnv(): void {
  if (process.env.DIRECT_URL || process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* none */
  }
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function actor(): string {
  return (
    flag('actor') ||
    process.env.A2R_BREAK_GLASS_ACTOR ||
    process.env.USER ||
    process.env.LOGNAME ||
    'cli'
  );
}

async function main(): Promise<number> {
  loadEnv();
  const cmd = process.argv[2];
  // DDL/control writes go through the session pooler (5432), like the migrations.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const db = new PrismaClient({ datasourceUrl: url });

  try {
    const [row] = await db.$queryRawUnsafe<
      { breakGlassUntil: Date | null; reason: string | null; actorEmail: string | null; engagedAt: Date | null }[]
    >(`SELECT "breakGlassUntil","reason","actorEmail","engagedAt" FROM "_rls_control" WHERE "id" = 'singleton'`);

    const now = Date.now();
    const activeUntil = row?.breakGlassUntil ? new Date(row.breakGlassUntil).getTime() : null;
    const active = activeUntil != null && activeUntil > now;

    if (!cmd || cmd === 'status') {
      console.log(
        JSON.stringify(
          {
            active,
            breakGlassUntil: row?.breakGlassUntil ?? null,
            minutesRemaining: active ? Math.ceil((activeUntil! - now) / 60_000) : 0,
            reason: row?.reason ?? null,
            actorEmail: row?.actorEmail ?? null,
            engagedAt: row?.engagedAt ?? null,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    if (cmd === 'engage') {
      const minutes = Math.max(1, Math.min(MAX_WINDOW_MINUTES, Number(flag('minutes') ?? '15')));
      const reason = flag('reason') ?? '';
      if (reason.trim().length < 8) {
        console.error('engage: --reason is required (min 8 chars) — this is audited.');
        return 1;
      }
      const until = new Date(now + minutes * 60_000);
      await db.$executeRawUnsafe(
        `UPDATE "_rls_control"
            SET "breakGlassUntil" = $1, "reason" = $2, "actorEmail" = $3,
                "engagedAt" = now(), "updatedAt" = now()
          WHERE "id" = 'singleton'`,
        until,
        reason,
        actor(),
      );
      console.error(
        `\n⚠️  RLS BREAK-GLASS ENGAGED until ${until.toISOString()} (${minutes} min)\n` +
          `    by ${actor()} — "${reason}"\n` +
          `    DB-level tenant isolation is now INERT. App-tier scoping still applies.\n` +
          `    Auto-expires; run \`disengage\` to close it sooner.\n`,
      );
      return 0;
    }

    if (cmd === 'disengage') {
      await db.$executeRawUnsafe(
        `UPDATE "_rls_control"
            SET "breakGlassUntil" = NULL, "reason" = NULL, "engagedAt" = NULL,
                "actorEmail" = $1, "updatedAt" = now()
          WHERE "id" = 'singleton'`,
        actor(),
      );
      console.error('\n✅  RLS break-glass DISENGAGED — enforcement resumes within ~10s (cache TTL).\n');
      return 0;
    }

    console.error(`unknown command: ${cmd}\nUsage: status | engage --minutes N --reason "…" | disengage`);
    return 1;
  } finally {
    await db.$disconnect();
  }
}

main().then((code) => process.exit(code));
