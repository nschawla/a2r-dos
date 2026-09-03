'use client';

/**
 * Live system-health hook for the Platform Pulse — polls the real
 * `/api/health/ready` probe (which runs a bounded `SELECT 1`) every 15s
 * from the browser, so "is the app + database up" stays current without a
 * page refresh. A failed fetch means the app itself is unreachable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { relativeTime } from '@/lib/relative-time';

type Health =
  | { state: 'ok'; latencyMs: number | null; at: string }
  | { state: 'degraded'; reason: string; at: string }
  | { state: 'down'; at: string };

const POLL_MS = 15_000;

export function PlatformHealthPoller({
  initialLatencyMs,
  initialOk,
}: {
  initialLatencyMs: number | null;
  initialOk: boolean;
}) {
  const [health, setHealth] = useState<Health>(
    initialOk
      ? { state: 'ok', latencyMs: initialLatencyMs, at: new Date().toISOString() }
      : { state: 'down', at: new Date().toISOString() }
  );
  const timer = useRef<ReturnType<typeof setInterval>>();

  const poll = useCallback(async () => {
    const at = new Date().toISOString();
    try {
      const res = await fetch('/api/health/ready', { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { database?: string; latencyMs?: number };
      if (res.ok && body.database === 'ok') {
        setHealth({ state: 'ok', latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : null, at });
      } else {
        setHealth({ state: 'degraded', reason: body.database ?? `HTTP ${res.status}`, at });
      }
    } catch {
      setHealth({ state: 'down', at });
    }
  }, []);

  useEffect(() => {
    void poll();
    timer.current = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer.current);
  }, [poll]);

  const meta =
    health.state === 'ok'
      ? { dot: 'bg-success', text: 'text-success', label: `App + database up${health.latencyMs != null ? ` · ${health.latencyMs}ms` : ''}` }
      : health.state === 'degraded'
        ? { dot: 'bg-warning', text: 'text-warning', label: `Degraded · ${health.reason}` }
        : { dot: 'bg-critical', text: 'text-critical', label: 'Unreachable' };

  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-none', meta.dot)} aria-hidden />
      <span className={clsx('font-semibold', meta.text)}>{meta.label}</span>
      <span className="text-ink-faint tabular-nums">checked {relativeTime(health.at)}</span>
    </div>
  );
}
