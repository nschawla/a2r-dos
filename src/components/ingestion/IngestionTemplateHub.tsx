'use client';

/**
 * Data Ingestion & Template Hub — the shared "how to hand us your data"
 * view. Rendered for A2R operators at /ops/ingestion and for tenant
 * administrators on /admin. Purely presentational + the client-side
 * download flow (fetch → blob → save, with success / error toasts); the
 * template definitions come in as a prop from a server component that
 * reads src/server/services/templates.ts.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { useToast } from '@/components/ui/toast';
import { captureException } from '@/lib/observability';
import type { IngestionTemplate } from '@/server/services/templates';

const LOAD_ORDER = [
  'Resource Allocations — establishes the roster and the `employeeId` / `email` keys.',
  'Project Financial Baselines — establishes engagements and the `projectCode` key.',
  'Aggregated Period Actuals & Hours — references the two above by email + code.',
];

export function IngestionTemplateHub({
  templates,
  heading = 'Data Ingestion & Templates',
  intro = 'Standardized intake templates and the rules for handing structured data to A2R Delivery OS.',
}: {
  templates: IngestionTemplate[];
  heading?: string;
  intro?: string;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(template: IngestionTemplate) {
    setBusyId(template.id);
    try {
      const res = await fetch(`/api/templates/${template.id}`, { headers: { accept: 'text/csv' } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = template.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ variant: 'success', title: `${template.title} template downloaded`, description: template.filename });
    } catch (err) {
      captureException(err, { scope: 'ingestion-templates', templateId: template.id });
      toast({
        variant: 'error',
        title: `Couldn’t download the ${template.title} template`,
        description: 'Check your connection and try again.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function downloadAll() {
    for (const t of templates) {
      // sequential so the browser doesn't drop concurrent download prompts
      // eslint-disable-next-line no-await-in-loop
      await download(t);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-bold">{heading}</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">{intro}</p>
      </div>

      <section className="card">
        <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">How ingestion works</div>
        <h2 className="text-[15.5px] font-bold mb-3">Before you load anything</h2>
        <div className="grid gap-4 md:grid-cols-2 text-[13px] text-ink-muted">
          <div className="flex flex-col gap-1.5">
            <span className="text-ink font-semibold text-xs uppercase tracking-wide">Two ways in</span>
            <p>
              <span className="text-ink">Self-serve import</span> — fill a template, then use the
              <span className="text-ink"> Import CSV</span> action in the relevant module (Commercial Baseline,
              RAID, Financial Realization). Every import is previewed row-by-row before it commits.
            </p>
            <p>
              <span className="text-ink">Automated bridge</span> — for recurring PSA / ERP feeds, an A2R
              operator issues a tenant-scoped API key and your systems POST to the ingestion API on a schedule.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink font-semibold text-xs uppercase tracking-wide">Load order</span>
            <ol className="list-decimal pl-4 flex flex-col gap-1">
              {LOAD_ORDER.map((line) => (
                <li key={line}>
                  <GuidanceText text={line} />
                </li>
              ))}
            </ol>
            <p className="mt-1">
              Re-importing is safe — rows are matched on their key column and updated in place, never duplicated.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={downloadAll}
            disabled={busyId !== null}
            className="btn-secondary !w-auto px-4 text-xs disabled:opacity-50"
          >
            {busyId !== null ? 'Downloading…' : `Download all ${templates.length} templates`}
          </button>
        </div>
      </section>

      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          busy={busyId === template.id}
          onDownload={() => download(template)}
        />
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  busy,
  onDownload,
}: {
  template: IngestionTemplate;
  busy: boolean;
  onDownload: () => void;
}) {
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">Intake Template</div>
          <h2 className="text-[15.5px] font-bold">{template.title}</h2>
          <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">{template.purpose}</p>
          <p className="text-[11px] text-ink-faint font-mono mt-1.5">{template.filename}</p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="btn-primary !w-auto px-5 text-xs disabled:opacity-50 flex-none"
        >
          {busy ? 'Downloading…' : 'Download CSV'}
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Guidelines</div>
          <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink-muted">
            {template.guidance.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand-hi flex-none">&bull;</span>
                <span>
                  <GuidanceText text={line} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Schema</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-3">Column</th>
                  <th className="py-2 pr-3">Req.</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2">Example</th>
                </tr>
              </thead>
              <tbody>
                {template.columns.map((col) => (
                  <tr key={col.name} className="border-b border-border/60 last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-ink whitespace-nowrap">{col.name}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={clsx(
                          'text-[10px] font-semibold uppercase tracking-wide',
                          col.required ? 'text-warning' : 'text-ink-faint'
                        )}
                      >
                        {col.required ? 'Required' : 'Optional'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{col.description}</td>
                    <td className="py-2 font-mono text-ink-muted whitespace-nowrap">{col.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Renders `\`code\`` spans in guidance text as real nodes (no markdown lib,
 * no dangerouslySetInnerHTML). */
function GuidanceText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 1 && part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="font-mono text-[11.5px] text-ink bg-surface-2 rounded px-1 py-0.5">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
