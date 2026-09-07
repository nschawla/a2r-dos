import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { getPlatformPulse, getPlatformStream } from '@/server/queries/platform-pulse';
import { relativeTime } from '@/lib/relative-time';
import { PulseStrip, type PulseVital } from '@/components/command-center/PulseStrip';
import { ActiveStream } from '@/components/command-center/ActiveStream';
import { PlatformHealthPoller } from '@/components/ops/PlatformHealthPoller';

export const metadata: Metadata = { title: 'Platform Pulse · A2R Ops' };
export const dynamic = 'force-dynamic';

/**
 * Platform Pulse — the engineering health of A2R Delivery OS itself,
 * ingested automatically: the running build, the last `npm test` result,
 * recent commits, and a live database probe. Staff-only; no tenant data.
 */
export default async function OpsPulsePage() {
  await requireOpsCapability('pulse:view');

  const pulse = await getPlatformPulse();
  const stream = getPlatformStream(pulse);

  const { build, database, tests, git } = pulse;

  const vitals: PulseVital[] = [
    {
      label: 'Running Build',
      value: `v${build.version}`,
      sub: build.commit ? `commit ${build.commit}` : git ? `${git.branch} (dev)` : 'local dev',
    },
    {
      label: 'Database',
      value: database.ok ? `${database.latencyMs}ms` : 'down',
      sub: database.ok ? 'SELECT 1 · reachable' : 'SELECT 1 · unreachable',
      tone: !database.ok ? 'critical' : database.latencyMs > 800 ? 'warn' : 'good',
    },
    tests
      ? {
          label: 'Test Suite',
          value: tests.green ? `${tests.passed}/${tests.total}` : `${tests.failed} failed`,
          sub: `vitest · ${relativeTime(tests.at)}`,
          tone: tests.green ? 'good' : 'critical',
        }
      : { label: 'Test Suite', value: '—', sub: 'run `npm test` to record' },
    {
      label: 'Last Build',
      value: build.buildTime ? relativeTime(build.buildTime) : 'dev',
      sub: `latest release v${build.latestRelease.version}`,
    },
  ];

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Platform Pulse</h1>
          <p className="text-ink-muted text-sm mt-1">
            Engineering health of A2R Delivery OS itself — build, tests, commits, database. Ingested
            automatically; not tenant data.
          </p>
        </div>
        <PlatformHealthPoller initialOk={database.ok} initialLatencyMs={database.latencyMs} />
      </div>

      <PulseStrip vitals={vitals} />

      <ActiveStream
        events={stream}
        eyebrow="Engineering Stream"
        heading="Build · test · commit activity"
        emptyText="No signals yet. Commits, test runs, releases, and database probes land here."
      />

      {!git && (
        <p className="text-[11px] text-ink-faint">
          Git activity shows only in local development with a working tree present.
        </p>
      )}
    </>
  );
}
