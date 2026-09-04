'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDashboardUI, PERSONAS_WITH_WRITE_ACCESS } from '@/components/layout/dashboard-ui-context';
import { toggleProjectLock } from '@/server/actions/projects';
import { AuditTrailDrawer } from '@/components/projects/AuditTrailDrawer';
import { isModuleAllowedForPersona } from '@/lib/governance/rbacMatrix';
import type { HealthCode } from '@/lib/calculations/types';

const HEALTH_META: Record<HealthCode, { label: string; dot: string; text: string }> = {
  G: { label: 'Green', dot: 'bg-success', text: 'text-success' },
  Y: { label: 'Yellow', dot: 'bg-warning', text: 'text-warning' },
  R: { label: 'Red', dot: 'bg-critical', text: 'text-critical' },
};

const HIERARCHY_LABEL: Record<string, string> = {
  STANDALONE: 'Standalone',
  PARENT: 'Parent Program',
  CHILD: 'Child Wave',
};

export interface ProjectHeaderProps {
  projectId: string;
  name: string;
  client: string | null;
  hierarchyLevel: string;
  waveTag: string | null;
  locked: boolean;
  healthCode: HealthCode;
  /** Computed server-side via src/lib/auth/rbac.ts#canEditProject against
   * the signed-in user's real, effective DeliveryRole — never the cosmetic
   * Persona. Used here only to decide whether to *show* the lock control;
   * toggleProjectLock re-checks the real authority itself server-side, so
   * this is a UX convenience, never the security boundary. */
  canEdit: boolean;
}

/**
 * Shared action bar mounted at the top of every per-module project route
 * (/commercial-baseline/[id], /audit/[id], /raid/[id], /financials/[id],
 * /schedule/[id]). The app has no unified /projects/[id] workspace (per-
 * module routing is the locked-in architecture decision), so this component
 * is how each module page gets a consistent project identity + baseline +
 * export surface without duplicating the markup five times.
 */
export function ProjectHeader({
  projectId,
  name,
  client,
  hierarchyLevel,
  waveTag,
  locked,
  healthCode,
  canEdit,
}: ProjectHeaderProps) {
  const { persona } = useDashboardUI();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'json' | 'slide' | null>(null);
  // WP5 — Lock Baseline snapshot button with confirmation dialog. Both
  // directions get a confirmation, not just locking: unlocking is just as
  // consequential (it discards the baselineSnapshot the EAC engine's
  // margin-drift comparison depends on), so both routes through the same
  // dialog with direction-specific copy rather than only gating the lock.
  const [confirming, setConfirming] = useState(false);
  // WP6 — Audit Trail drawer. Available to anyone who can see this page at
  // all (no canEdit gate — see fetchAuditTrail's own read-access note).
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);

  const health = HEALTH_META[healthCode];
  const personaAllowsWrite = PERSONAS_WITH_WRITE_ACCESS.includes(persona);
  const canShowLockControl = personaAllowsWrite && canEdit;

  function handleToggleLock() {
    setConfirming(false);
    setError(null);
    startTransition(async () => {
      const result = await toggleProjectLock(projectId, !locked);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleExport(kind: 'json' | 'slide') {
    setExporting(kind);
    const path = kind === 'json' ? `/api/projects/${projectId}/export` : `/api/projects/${projectId}/status-report`;
    window.open(path, '_blank', 'noopener,noreferrer');
    // No await — this just opens the route in a new tab; reset the
    // transient "opening…" state on the next tick.
    setTimeout(() => setExporting(null), 600);
  }

  return (
    <div className="flex flex-col gap-2 pb-4 mb-1 border-b border-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-display font-bold truncate">{name}</h1>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-ink-faint border border-border-soft rounded-full px-2 py-0.5">
              {HIERARCHY_LABEL[hierarchyLevel] ?? hierarchyLevel}
            </span>
            {waveTag && (
              <span className="text-[10px] uppercase tracking-wide font-semibold text-ink-muted border border-border-soft rounded-full px-2 py-0.5">
                {waveTag}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            {client && <span className="truncate">{client}</span>}
            <span className={clsx('flex items-center gap-1.5 font-medium', health.text)}>
              <span className={clsx('status-dot', health.dot)} />
              {health.label}
            </span>
            {locked && <span className="text-[11px] text-ink-faint">· Baseline locked</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          {canShowLockControl && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className={clsx(
                'px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors disabled:opacity-50',
                locked
                  ? 'border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint'
                  : 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20'
              )}
            >
              {pending ? 'Working…' : locked ? 'Unlock Baseline' : 'Lock Baseline'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAuditTrailOpen(true)}
            className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint transition-colors"
          >
            Audit Trail
          </button>
          {/* WP7 — deep-links into the Executive Reporting Hub with this
             project preselected, rather than duplicating the Hub's own
             SteerCo Deck / Audit Certificate launcher buttons a third time
             across five module pages. */}
          <Link
            href={`/reports?project=${projectId}`}
            className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint transition-colors"
          >
            Reports Hub
          </Link>
          <button
            type="button"
            onClick={() => handleExport('slide')}
            disabled={exporting === 'slide'}
            className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint transition-colors disabled:opacity-50"
          >
            {exporting === 'slide' ? 'Opening…' : 'Export Status Report'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exporting === 'json'}
            className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint transition-colors disabled:opacity-50"
          >
            {exporting === 'json' ? 'Opening…' : 'Export JSON Package'}
          </button>
        </div>
      </div>

      <ModuleNav projectId={projectId} />

      {error && <p className="text-xs text-critical">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirming(false)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15.5px] font-bold mb-2">{locked ? 'Unlock this baseline?' : 'Lock this baseline?'}</h3>
            <p className="text-sm text-ink-muted mb-5">
              {locked
                ? 'This discards the locked baseline snapshot. The EAC engine’s margin-drift comparison will have nothing to compare against until it’s re-locked.'
                : 'This snapshots the current sizing totals as the deal’s baseline — the reference point every future margin-drift and EAC comparison is measured against.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-sm text-xs font-semibold text-ink-muted hover:text-ink"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={clsx(
                  'px-3 py-1.5 rounded-sm text-xs font-semibold border transition-colors',
                  locked
                    ? 'border-critical/40 bg-critical-soft text-critical hover:bg-critical/20'
                    : 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20'
                )}
                onClick={handleToggleLock}
              >
                {locked ? 'Unlock Baseline' : 'Lock Baseline'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AuditTrailDrawer projectId={projectId} open={auditTrailOpen} onClose={() => setAuditTrailOpen(false)} />
    </div>
  );
}

// Engagement Governance sub-navigation — jump between this project's five
// module workspaces without a round trip through the sidebar.
const ENGAGEMENT_MODULES = [
  { seg: 'commercial-baseline', label: 'Baseline' },
  { seg: 'financials', label: 'Financials' },
  { seg: 'schedule', label: 'Schedule' },
  { seg: 'raid', label: 'RAID' },
  { seg: 'audit', label: 'Control Audit' },
] as const;

function ModuleNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const currentSeg = (pathname ?? '').split('/')[1] ?? '';
  const { rbacPersona } = useDashboardUI();
  // Each `seg` is a GOVERNABLE_MODULES key — omit a pill entirely (not just
  // disable it) when the active RBAC persona can't reach that module.
  const visible = ENGAGEMENT_MODULES.filter((m) => isModuleAllowedForPersona(rbacPersona, m.seg));

  return (
    <nav className="-mb-1 flex gap-1 overflow-x-auto">
      {visible.map((m) => {
        const active = m.seg === currentSeg;
        return (
          <Link
            key={m.seg}
            href={`/${m.seg}/${projectId}`}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'rounded-md px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
              active
                ? 'bg-surface-2 text-ink'
                : 'text-ink-muted hover:text-ink hover:bg-surface-2'
            )}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
