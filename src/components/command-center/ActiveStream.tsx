import clsx from 'clsx';
import { relativeTime } from '@/lib/relative-time';
import type { StreamEvent, StreamTone } from '@/server/queries/active-stream';

/**
 * The Active Stream — one chronological feed replacing the multi-board
 * clutter. A quiet vertical timeline: a tone dot, the event, its context,
 * a relative time. Flat, hairline-separated, no nested cards.
 */
const DOT_CLASS: Record<StreamTone, string> = {
  default: 'bg-ink-faint',
  good: 'bg-success',
  warn: 'bg-warning',
  critical: 'bg-critical',
};

const KIND_LABEL: Record<StreamEvent['kind'], string> = {
  activity: 'Activity',
  governance: 'Governance',
  risk: 'Risk',
};

export function ActiveStream({
  events,
  eyebrow = 'Active Stream',
  heading = 'Live operational & governance state',
  emptyText = 'Nothing has happened yet. Baseline locks, EAC updates, RAID escalations, and imports land here.',
}: {
  events: StreamEvent[];
  eyebrow?: string;
  heading?: string;
  emptyText?: string;
}) {
  return (
    <section className="card !p-0 overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 px-6 pt-5 pb-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {eyebrow}
          </div>
          <h2 className="text-[15.5px] font-bold mt-0.5">{heading}</h2>
        </div>
        <span className="text-[11px] text-ink-faint tabular-nums flex-none">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-muted text-center">{emptyText}</p>
      ) : (
        <ol className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3.5 px-6 py-3">
              <span className={clsx('mt-1.5 w-1.5 h-1.5 rounded-full flex-none', DOT_CLASS[e.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] text-ink font-medium truncate">{e.title}</span>
                  <span className="ml-auto flex-none text-[11px] text-ink-faint tabular-nums">
                    {relativeTime(e.at)}
                  </span>
                </div>
                <div className="text-[11.5px] text-ink-muted truncate mt-0.5">
                  <span className="text-ink-faint">{KIND_LABEL[e.kind]}</span>
                  {e.detail && <> · {e.detail}</>}
                  {e.context && <> · {e.context}</>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
