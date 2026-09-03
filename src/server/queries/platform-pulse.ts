/**
 * Platform Pulse — the Ops Console's live view of the platform's own
 * engineering health (distinct from tenant delivery data). Feeds a
 * PulseStrip + an ActiveStream of build / test / commit / database events,
 * all sourced automatically — no manual entry.
 *
 * Placement note: git activity, build metrics and process health are
 * platform-operator concerns, not tenant data, so this lives under the
 * staff-gated /ops surface and never touches a tenant's Active Stream.
 */
import { db } from '@/lib/db';
import { BUILD_INFO } from '@/lib/build-info';
import { CHANGELOG } from '@/lib/changelog';
import { readGitSignal, readTestSignal, type GitSignal, type TestSignal } from '@/lib/dev-signals';
import type { StreamEvent, StreamTone } from '@/server/queries/active-stream';

export interface DatabaseSignal {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
}

export interface PlatformPulse {
  build: {
    version: string;
    commit: string | null;
    buildTime: string | null;
    latestRelease: { version: string; date: string; headline: string };
  };
  database: DatabaseSignal;
  tests: TestSignal | null;
  git: GitSignal | null;
}

async function checkDatabase(): Promise<DatabaseSignal> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
  } catch {
    return { ok: false, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
  }
}

export async function getPlatformPulse(): Promise<PlatformPulse> {
  const [database] = await Promise.all([checkDatabase()]);
  const latest = CHANGELOG[0]!;

  return {
    build: {
      version: BUILD_INFO.version,
      commit: BUILD_INFO.commit,
      buildTime: BUILD_INFO.buildTime,
      latestRelease: { version: latest.version, date: latest.date, headline: latest.headline },
    },
    database,
    tests: readTestSignal(),
    git: readGitSignal(),
  };
}

/** Recent engineering events, newest first — commits, the last test run,
 * the latest release, and the current database probe. */
export function getPlatformStream(pulse: PlatformPulse, limit = 20): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (pulse.git) {
    for (const c of pulse.git.commits) {
      events.push({
        id: `git-${c.sha}`,
        kind: 'activity',
        title: c.subject || '(no message)',
        detail: `commit ${c.sha}`,
        context: `${pulse.git.branch} · ${c.author}`,
        at: c.at,
        tone: 'default',
      });
    }
  }

  if (pulse.tests) {
    events.push({
      id: `test-${pulse.tests.at}`,
      kind: 'governance',
      title: pulse.tests.green
        ? `Test suite green — ${pulse.tests.passed}/${pulse.tests.total} passed`
        : `Test suite failing — ${pulse.tests.failed} of ${pulse.tests.total} failed`,
      detail: 'vitest run',
      context: null,
      at: pulse.tests.at,
      tone: pulse.tests.green ? 'good' : 'critical',
    });
  }

  events.push({
    id: `release-${pulse.build.latestRelease.version}`,
    kind: 'governance',
    title: `Released v${pulse.build.latestRelease.version}`,
    detail: pulse.build.latestRelease.headline,
    context: null,
    at: `${pulse.build.latestRelease.date}T12:00:00.000Z`,
    tone: 'good',
  });

  events.push({
    id: `db-${pulse.database.checkedAt}`,
    kind: 'risk',
    title: pulse.database.ok
      ? `Database reachable — ${pulse.database.latencyMs}ms`
      : 'Database unreachable',
    detail: 'SELECT 1',
    context: null,
    at: pulse.database.checkedAt,
    tone: dbTone(pulse.database),
  });

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

function dbTone(d: DatabaseSignal): StreamTone {
  if (!d.ok) return 'critical';
  if (d.latencyMs > 800) return 'warn';
  return 'good';
}
