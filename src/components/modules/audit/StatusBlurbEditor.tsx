'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The Executive Status Blurb editor — a one-or-two sentence plain-English
 * note on why an engagement is Yellow or Red. Lives on the Audit page
 * (where G/Y/R health is actually driven from) and is read everywhere the
 * RAG flag itself appears — the Control Tower's Active Projects table and
 * its Decision Center — so a stakeholder gets the "why" without opening
 * the project. Backed by `Project.narrativeBlockers`.
 */
import { useState, type FormEvent } from 'react';
import { useBusyAction } from '@/components/ui/panel-kit';
import { updateProjectStatusBlurb } from '@/server/actions/projects';
import type { HealthCode } from '@/lib/calculations/types';

const MAX_LEN = 280;

export function StatusBlurbEditor({
  projectId,
  initialValue,
  canEdit,
  healthCode,
}: {
  projectId: string;
  initialValue: string;
  canEdit: boolean;
  healthCode: HealthCode;
}) {
  const [value, setValue] = useState(initialValue);
  const { busy, error, run } = useBusyAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(() => updateProjectStatusBlurb({ projectId, narrativeBlockers: value }), {
      success: 'Status blurb saved',
      errorTitle: 'Couldn’t save the status blurb',
    });
  }

  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
        Executive Status Blurb
      </div>
      <p className="text-[12.5px] text-ink-muted mb-3 max-w-xl">
        One or two sentences on what&rsquo;s blocking this engagement — shown next to the RAG flag in the Control
        Tower and Decision Center so stakeholders get the &ldquo;why&rdquo; without opening the project.
        {healthCode === 'G' && ' Only surfaced elsewhere once this engagement is Yellow or Red.'}
      </p>
      {canEdit ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <textarea
            className="input min-h-[64px] resize-y"
            maxLength={MAX_LEN}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Awaiting client sign-off on a scope change; schedule is slipping two weeks pending that decision."
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-faint">
              {value.length} / {MAX_LEN}
            </span>
            <button className="btn-secondary !w-auto px-5" disabled={busy} type="submit">
              Save
            </button>
          </div>
        </form>
      ) : (
        <p className="text-[13px] text-ink">
          {initialValue || <span className="text-ink-faint italic">No blurb set.</span>}
        </p>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </div>
  );
}
