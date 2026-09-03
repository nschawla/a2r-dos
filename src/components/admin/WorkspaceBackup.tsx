'use client';

/**
 * WP6 — Workspace Backup & Restore UI, mounted on the Admin & Org Setup
 * page. Export triggers `exportWorkspaceSnapshot`, then serializes the
 * returned JSON to a browser download (no server-side file storage — the
 * snapshot only ever exists as the response payload and whatever the user
 * does with the downloaded file). Restore reads a chosen file client-side,
 * JSON.parses it, and only sends the parsed object to
 * `restoreWorkspaceSnapshot` after an explicit confirmation step — the
 * action re-validates it fully itself regardless (see workspace-io.ts),
 * but the confirmation dialog is where the user commits to "yes, overwrite
 * with this file."
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { exportWorkspaceSnapshot, restoreWorkspaceSnapshot } from '@/server/actions/backup';
import type { WorkspaceSnapshot } from '@/lib/backup/workspace-io';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';

export interface WorkspaceBackupProps {
  /** Gated on the real DeliveryRole 'admin:workspace' permission (see
   * src/lib/auth/rbac.ts), not the page's legacy MembershipRole `canEdit`
   * — this panel's server actions check that independently either way, but
   * showing the controls to someone who'd immediately get denied is bad
   * UX for no benefit. */
  canManage: boolean;
}

type RestoreStage = 'idle' | 'reading' | 'confirm' | 'restoring' | 'done';

export function WorkspaceBackup({ canManage }: WorkspaceBackupProps) {
  const router = useRouter();
  const runSafe = useSafeAction();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [restoreStage, setRestoreStage] = useState<RestoreStage>('idle');
  const [pendingSnapshot, setPendingSnapshot] = useState<{ raw: unknown; fileName: string } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreIssues, setRestoreIssues] = useState<string[]>([]);
  const [restoreSummary, setRestoreSummary] = useState<{ projectCount: number; deliveryRoleCount: number; resourceCount: number } | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const outcome = await runSafe(() => exportWorkspaceSnapshot(), { errorTitle: 'Workspace export failed' });
      if (!outcome.ok) return;
      const result = outcome.data;
      if (!result.ok) {
        setExportError(result.error);
        toast({ variant: 'error', title: 'Workspace export failed', description: result.error });
        return;
      }
      downloadSnapshot(result.snapshot);
      toast({ variant: 'success', title: 'Workspace snapshot downloaded' });
    } finally {
      setExporting(false);
    }
  }

  function downloadSnapshot(snapshot: WorkspaceSnapshot) {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = snapshot.exportedAt.slice(0, 10);
    a.href = url;
    a.download = `a2r-workspace-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleFilePicked(file: File) {
    setRestoreError(null);
    setRestoreIssues([]);
    setRestoreStage('reading');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed = JSON.parse(text);
        setPendingSnapshot({ raw: parsed, fileName: file.name });
        setRestoreStage('confirm');
      } catch {
        setRestoreError('That file isn’t valid JSON.');
        setRestoreStage('idle');
      }
    };
    reader.onerror = () => {
      setRestoreError('Could not read that file.');
      setRestoreStage('idle');
    };
    reader.readAsText(file);
  }

  async function handleConfirmRestore() {
    if (!pendingSnapshot) return;
    setRestoreStage('restoring');
    setRestoreError(null);
    setRestoreIssues([]);
    const outcome = await runSafe(() => restoreWorkspaceSnapshot(pendingSnapshot.raw), {
      errorTitle: 'Workspace restore failed',
    });
    if (!outcome.ok) {
      // threw — error toast already shown; let the operator retry or cancel
      setRestoreStage('confirm');
      return;
    }
    const result = outcome.data;
    if (!result.ok) {
      setRestoreError(result.error);
      setRestoreIssues(result.issues ?? []);
      setRestoreStage('confirm');
      toast({ variant: 'error', title: 'Workspace restore failed', description: result.error });
      return;
    }
    setRestoreSummary(result);
    setRestoreStage('done');
    toast({
      variant: 'success',
      title: 'Workspace restored',
      description: `${result.projectCount} project(s), ${result.deliveryRoleCount} role(s), ${result.resourceCount} resource(s).`,
    });
    router.refresh();
  }

  function handleCancelRestore() {
    setPendingSnapshot(null);
    setRestoreStage('idle');
    setRestoreError(null);
    setRestoreIssues([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="card">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">Data Pipeline</div>
        <h2 className="text-[15.5px] font-bold">Workspace Backup &amp; Restore</h2>
        <p className="text-[12.5px] text-ink-muted mt-1">
          Export a full snapshot of this tenant&rsquo;s projects, rate card, resources, and RAID registers as a single
          JSON file, or restore one back in. Restoring only ever adds or overwrites what the file describes &mdash; it
          never deletes a project, role, or resource that isn&rsquo;t in the file.
        </p>
      </div>

      {!canManage && <p className="text-ink-faint text-xs mb-3">Only tenant administrators can export or restore the workspace.</p>}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" className="btn-secondary !w-auto px-4 text-xs" disabled={!canManage || exporting} onClick={handleExport}>
            {exporting ? 'Exporting…' : 'Export Workspace JSON'}
          </button>
          {canManage && (
            <label className="btn-secondary !w-auto px-4 text-xs cursor-pointer inline-flex items-center justify-center">
              Restore from file&hellip;
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                disabled={restoreStage === 'reading' || restoreStage === 'restoring'}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFilePicked(file);
                }}
              />
            </label>
          )}
        </div>
        {exportError && <p className="text-critical text-xs">{exportError}</p>}

        {restoreStage === 'done' && restoreSummary && (
          <p className="text-success text-sm">
            Restore complete &mdash; {restoreSummary.projectCount} project(s), {restoreSummary.deliveryRoleCount} rate-card
            role(s), {restoreSummary.resourceCount} resource(s) applied. Logged to the Audit Trail.
          </p>
        )}

        {restoreError && (
          <div className="flex flex-col gap-1">
            <p className="text-critical text-xs">{restoreError}</p>
            {restoreIssues.length > 0 && (
              <ul className="text-critical text-[11px] list-disc pl-4">
                {restoreIssues.slice(0, 8).map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
                {restoreIssues.length > 8 && <li>&hellip;and {restoreIssues.length - 8} more.</li>}
              </ul>
            )}
          </div>
        )}
      </div>

      {(restoreStage === 'confirm' || restoreStage === 'restoring') && pendingSnapshot && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={handleCancelRestore}>
          <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15.5px] font-bold mb-2">Restore from {pendingSnapshot.fileName}?</h3>
            <p className="text-sm text-ink-muted mb-3">
              This will overwrite every project, rate-card role, and resource described in this file with the file&rsquo;s
              data &mdash; including each project&rsquo;s Scope Matrix, Effort Matrix, Audit Checklist, RAID Register, and
              Schedule, which are replaced wholesale for any project in the file. Nothing outside the file is deleted.
              This cannot be undone from within the app (re-export a fresh backup first if you&rsquo;re unsure).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-sm text-xs font-semibold text-ink-muted hover:text-ink"
                disabled={restoreStage === 'restoring'}
                onClick={handleCancelRestore}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-critical/40 bg-critical-soft text-critical hover:bg-critical/20 transition-colors disabled:opacity-60"
                disabled={restoreStage === 'restoring'}
                onClick={handleConfirmRestore}
              >
                {restoreStage === 'restoring' ? 'Restoring…' : 'Restore workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
