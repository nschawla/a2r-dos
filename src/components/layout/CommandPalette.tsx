'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDashboardUI } from './dashboard-ui-context';
import { getCommandPaletteIndex, type CommandPaletteIndex } from '@/server/actions/command-palette';
import { fuzzyFilter } from '@/lib/fuzzy-match';

const HEALTH_DOT: Record<string, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };
const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-critical',
  HIGH: 'bg-warning',
  MED: 'bg-brand-hi',
  LOW: 'bg-na',
};

type ResultRow =
  | { kind: 'project'; id: string; label: string; sub: string; href: string; healthCode: string }
  | { kind: 'resource'; id: string; label: string; sub: string; href: string }
  | { kind: 'raid'; id: string; label: string; sub: string; href: string; severity: string };

/**
 * Global Cmd+K / Ctrl+K search across registered projects & parent
 * programs, the resource directory, and open SteerCo-escalated RAID
 * items. Loads its index once per open (see getCommandPaletteIndex) and
 * fuzzy-filters client-side on every keystroke.
 *
 * Every project result routes to /commercial-baseline/[id] — the app has
 * no unified /projects/[id] workspace (each module is its own route), so
 * the Commercial Baseline page serves as the project's canonical "open"
 * destination. RAID results route straight to that project's RAID Cockpit
 * instead.
 */
export function CommandPalette() {
  const { commandPaletteOpen, closeCommandPalette } = useDashboardUI();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<CommandPaletteIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    setQuery('');
    setActiveIdx(0);
    setLoading(true);
    getCommandPaletteIndex()
      .then(setIndex)
      .finally(() => setLoading(false));
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [commandPaletteOpen]);

  const results = useMemo<ResultRow[]>(() => {
    if (!index) return [];
    const projectRows: ResultRow[] = fuzzyFilter(
      query,
      index.projects,
      (p) => `${p.name} ${p.client ?? ''}`,
      6
    ).map((p) => ({
      kind: 'project',
      id: p.id,
      label: p.name,
      sub: [p.client, p.hierarchyLevel === 'parent' ? 'Parent Program' : null].filter(Boolean).join(' · ') || '—',
      href: `/commercial-baseline/${p.id}`,
      healthCode: p.healthCode,
    }));

    const resourceRows: ResultRow[] = fuzzyFilter(
      query,
      index.resources,
      (r) => `${r.name} ${r.roleName ?? ''} ${r.practiceName ?? ''}`,
      6
    ).map((r) => ({
      kind: 'resource',
      id: r.id,
      label: r.name,
      sub: [r.roleName, r.practiceName].filter(Boolean).join(' · ') || 'No role assigned',
      href: `/admin`,
    }));

    const raidRows: ResultRow[] = fuzzyFilter(
      query,
      index.raidAlerts,
      (a) => `${a.description} ${a.projectName}`,
      6
    ).map((a) => ({
      kind: 'raid',
      id: a.id,
      label: a.description,
      sub: `${a.projectName} · SteerCo escalated`,
      href: `/raid/${a.projectId}`,
      severity: a.severity,
    }));

    return [...projectRows, ...raidRows, ...resourceRows];
  }, [index, query]);

  useEffect(() => setActiveIdx(0), [query]);

  function go(row: ResultRow | undefined) {
    if (!row) return;
    closeCommandPalette();
    router.push(row.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[activeIdx]);
    }
  }

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={closeCommandPalette} />
      <div className="relative w-full max-w-xl bg-surface-1 border border-border-soft rounded-lg shadow-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <span className="text-ink-faint">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search projects, people, escalated RAID items…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-faint"
          />
          <kbd className="text-[10px] text-ink-faint border border-border-soft rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {loading && <div className="px-4 py-6 text-sm text-ink-muted text-center">Loading…</div>}
          {!loading && results.length === 0 && (
            <div className="px-4 py-6 text-sm text-ink-muted text-center">No matches.</div>
          )}
          {!loading &&
            results.map((row, i) => (
              <button
                key={`${row.kind}-${row.id}`}
                type="button"
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => go(row)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                  i === activeIdx ? 'bg-surface-2' : 'hover:bg-surface-2'
                )}
              >
                {row.kind === 'project' && <span className={clsx('status-dot', HEALTH_DOT[row.healthCode])} />}
                {row.kind === 'raid' && <span className={clsx('status-dot', SEVERITY_DOT[row.severity])} />}
                {row.kind === 'resource' && <span className="status-dot bg-na" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{row.label}</div>
                  <div className="truncate text-xs text-ink-faint">{row.sub}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-ink-faint flex-none">
                  {row.kind === 'project' ? 'Project' : row.kind === 'resource' ? 'Person' : 'RAID'}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
