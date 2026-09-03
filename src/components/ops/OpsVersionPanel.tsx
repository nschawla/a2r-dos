'use client';

/**
 * Ops Console footer build stamp + Release Notes viewer.
 *
 * The stamp ("A2R Delivery OS v1.0.0") sits discreetly at the bottom of
 * the operator sidebar for build traceability; clicking it opens the
 * changelog modal, which renders src/lib/changelog.ts grouped by release.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { BUILD_INFO } from '@/lib/build-info';
import { CHANGELOG, CHANGE_TYPE_META, type ChangeType } from '@/lib/changelog';

export function OpsVersionPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={BUILD_INFO.fullStamp}
        className="mt-1 w-full text-left px-3 py-1.5 rounded-sm text-[10px] text-ink-faint hover:text-ink-muted hover:bg-surface-2 transition-colors flex items-center gap-1.5"
      >
        <span className="w-1 h-1 rounded-full bg-brand/70 flex-none" aria-hidden />
        <span className="truncate">{BUILD_INFO.versionLabel}</span>
        <span className="ml-auto flex-none text-ink-faint/70">Release notes</span>
      </button>

      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangelogModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-black/55 px-4 py-[6vh] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Release notes"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
              A2R Delivery OS
            </div>
            <h2 className="text-[17px] font-bold">Release Notes</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
          >
            &times;
          </button>
        </div>

        <p className="font-mono text-[11px] text-ink-faint mb-5">Build {BUILD_INFO.fullStamp}</p>

        <div className="flex flex-col gap-7">
          {CHANGELOG.map((release, i) => (
            <section key={release.version}>
              <div className="flex items-baseline gap-2.5 flex-wrap border-b border-border/60 pb-2 mb-3">
                <h3 className="text-[15px] font-display font-bold">v{release.version}</h3>
                {i === 0 && (
                  <span className="text-[9.5px] font-semibold uppercase tracking-wide rounded-full border border-brand/40 bg-brand/10 text-brand px-1.5 py-0.5">
                    Current
                  </span>
                )}
                <span className="text-[11px] text-ink-faint tabular-nums ml-auto">{release.date}</span>
              </div>
              <p className="text-[12.5px] text-ink-muted mb-3">{release.headline}</p>
              <ul className="flex flex-col gap-2">
                {release.changes.map((change, j) => (
                  <li key={j} className="flex gap-2.5 text-[12.5px] leading-snug">
                    <ChangeBadge type={change.type} />
                    <span className="text-ink-muted pt-0.5">{change.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex justify-end mt-6">
          <button type="button" onClick={onClose} className="btn-secondary !w-auto px-5 text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeBadge({ type }: { type: ChangeType }) {
  const meta = CHANGE_TYPE_META[type];
  return (
    <span
      className={clsx(
        'flex-none mt-0.5 h-[18px] inline-flex items-center rounded-full border px-1.5 text-[9.5px] font-semibold uppercase tracking-wide',
        meta.badgeClass
      )}
    >
      {meta.label}
    </span>
  );
}
