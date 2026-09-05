'use client';

/**
 * AI-assisted intake for the "Status Reports & RAID Log" pillar.
 *
 * Paste a weekly status email / PMO report / meeting notes, pick the
 * engagement it's about (or let the parser detect engagements itself),
 * and hit "Parse with AI". The text goes to POST /api/parse-document
 * (src/app/api/parse-document/route.ts → src/lib/ai-parser.ts), which
 * returns rows already shaped for the batch importer.
 *
 * Those rows are then validated RIGHT HERE with the exact same
 * `validateBatchRow` the upload portal and the server both use — so the
 * valid / quarantined split shown in the preview is the real one — and,
 * on "Send to batch flow", staged through the same `stageImportBatch`
 * server action as an uploaded CSV. Nothing this component does bypasses
 * the batch engine's server-side re-validation or its admin gate.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import {
  validateBatchRow,
  type BatchValidationContext,
  type BatchRowIssue,
} from '@/lib/ingestion/batch-schemas';
import { stageImportBatch } from '@/server/actions/data-import';

type Phase = 'idle' | 'parsing' | 'parsed' | 'staging';

/** What the engagement <select> resolves to: a project id, or "let the
 * parser keep whatever engagement it detected in the text". */
const DETECT = '__detect__';

interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: BatchRowIssue[];
}

interface ParseResponse {
  ok: true;
  digest: { entries: unknown[]; unattributed: string[] };
  rows: Record<string, string>[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const MAX_CHARS = 50_000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AiDocumentParser({ lookups }: { lookups: BatchValidationContext }) {
  const router = useRouter();
  const run = useSafeAction();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const projects = useMemo(
    () => [...lookups.projects].sort((a, b) => a.name.localeCompare(b.name)),
    [lookups.projects],
  );

  const [text, setText] = useState('');
  const [engagement, setEngagement] = useState<string>(DETECT);
  const [weekEnding, setWeekEnding] = useState<string>(todayIso);
  const [phase, setPhase] = useState<Phase>('idle');
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [unattributed, setUnattributed] = useState<string[]>([]);
  const [usage, setUsage] = useState<ParseResponse['usage'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const overLimit = trimmed.length > MAX_CHARS;
  const canParse = trimmed.length > 0 && !overLimit && phase !== 'parsing' && phase !== 'staging';

  function resetResult() {
    setRows(null);
    setPreview(null);
    setUnattributed([]);
    setUsage(null);
    setError(null);
  }

  /** Any input change invalidates a shown preview. */
  function invalidatePreview() {
    if (phase === 'parsed') {
      resetResult();
      setPhase('idle');
    }
  }

  /** Force every parsed row onto the chosen engagement (matched by the
   * same code-or-name rule the validator uses), unless "detect" is set. */
  function applyEngagement(incoming: Record<string, string>[]): Record<string, string>[] {
    if (engagement === DETECT) return incoming;
    const project = projects.find((p) => p.id === engagement);
    if (!project) return incoming;
    const ref = project.code ?? project.name;
    return incoming.map((r) => ({ ...r, 'Project Code': ref }));
  }

  async function handleParse() {
    resetResult();
    setPhase('parsing');
    try {
      const res = await fetch('/api/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, weekEnding: weekEnding || undefined }),
      });

      const body = (await res.json().catch(() => null)) as
        | ParseResponse
        | { error?: string; code?: string }
        | null;

      if (!res.ok || !body || !('ok' in body)) {
        const message =
          (body && 'error' in body && body.error) ||
          (res.status === 503
            ? 'The document parser isn’t configured on this environment yet.'
            : res.status === 429
              ? 'You’ve run several parses in quick succession — wait a moment and try again.'
              : `The parser request failed (HTTP ${res.status}).`);
        setError(message);
        setPhase('idle');
        return;
      }

      const finalRows = applyEngagement(body.rows);
      if (finalRows.length === 0) {
        setError('The parser didn’t find any status updates or RAID items in that text.');
        setPhase('idle');
        return;
      }

      setRows(finalRows);
      setPreview(
        finalRows.map((raw, i) => ({
          rowNumber: i + 1,
          raw,
          errors: validateBatchRow('STATUS_RAID', raw, lookups).errors,
        })),
      );
      setUnattributed(body.digest.unattributed ?? []);
      setUsage(body.usage);
      setPhase('parsed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the document parser.');
      setPhase('idle');
    }
  }

  function handleStage() {
    if (!rows || rows.length === 0) return;
    setPhase('staging');
    const project = projects.find((p) => p.id === engagement);
    const label = project?.code ?? project?.name ?? 'multi-engagement';
    const fileName = `ai-parsed-status_${label}_${weekEnding || todayIso()}.csv`;

    startTransition(async () => {
      const outcome = await run(() => stageImportBatch('STATUS_RAID', fileName, rows), {
        errorTitle: 'Couldn’t send this to the batch flow',
        context: { scope: 'ai-document-parser' },
      });
      if (!outcome.ok) {
        setPhase('parsed');
        return;
      }
      const result = outcome.data;
      if (!result.ok) {
        setError(result.error);
        setPhase('parsed');
        return;
      }
      toast({
        variant: 'success',
        title: 'Staged as a batch',
        description: 'Review, correct any quarantined rows, and commit from the batch page.',
      });
      router.push(`/admin/ingestion/batches/${result.batchId}`);
    });
  }

  function startOver() {
    resetResult();
    setText('');
    setPhase('idle');
  }

  const validCount = preview?.filter((r) => r.errors.length === 0).length ?? 0;
  const quarantinedCount = preview ? preview.length - validCount : 0;

  return (
    <section className="card flex flex-col gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
          AI-Assisted Intake
        </div>
        <h2 className="text-[15.5px] font-bold">Parse a status report or RAID log</h2>
        <p className="text-[12.5px] text-ink-muted mt-1 max-w-2xl">
          Paste a weekly status email, a PMO report, or meeting notes. The parser extracts the status
          narrative and any RAID items into rows for the <span className="font-medium">Status Reports &amp; RAID Log</span>{' '}
          importer. Nothing commits here — you review and stage it exactly like an uploaded file.
        </p>
      </div>

      {/* ── Inputs ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-muted">Engagement</span>
          <select
            className="input"
            value={engagement}
            disabled={phase === 'parsing' || phase === 'staging'}
            onChange={(e) => {
              setEngagement(e.target.value);
              invalidatePreview();
            }}
          >
            <option value={DETECT}>Detect from the text</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} — ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-muted">
            Week ending <span className="text-ink-faint font-normal">— fallback for undated updates</span>
          </span>
          <input
            type="date"
            className="input"
            value={weekEnding}
            disabled={phase === 'parsing' || phase === 'staging'}
            onChange={(e) => setWeekEnding(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-ink-muted">Raw text</span>
        <textarea
          className="input min-h-[200px] font-mono text-[12.5px] leading-relaxed resize-y"
          placeholder={
            'Paste the status report or RAID log here.\n\ne.g. "Contoso migration — on track for the Apr 3 cutover. RISK (high): the data-quality remediation is behind and could slip the go-live. Owner: dana@contoso.com."'
          }
          value={text}
          disabled={phase === 'parsing' || phase === 'staging'}
          onChange={(e) => {
            setText(e.target.value);
            invalidatePreview();
          }}
        />
        <span className={clsx('text-[11px]', overLimit ? 'text-critical' : 'text-ink-faint')}>
          {trimmed.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
        </span>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary !w-auto px-5 text-xs disabled:opacity-50"
          onClick={handleParse}
          disabled={!canParse}
        >
          {phase === 'parsing' ? 'Parsing…' : 'Parse with AI'}
        </button>
        {(phase === 'parsed' || rows) && (
          <button
            type="button"
            className="text-ink-faint hover:text-ink text-xs px-3 py-2"
            onClick={startOver}
            disabled={phase === 'staging'}
          >
            Start over
          </button>
        )}
      </div>

      {error && <p className="text-critical text-xs">{error}</p>}

      {/* ── Preview ── */}
      {preview && (
        <div className="flex flex-col gap-3 border-t border-border-soft pt-4">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="badge bg-success-soft text-success">{validCount} valid</span>
            {quarantinedCount > 0 && (
              <span className="badge bg-critical-soft text-critical">{quarantinedCount} will be quarantined</span>
            )}
            {usage && (
              <span className="text-[11px] text-ink-faint">
                {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out tokens
              </span>
            )}
          </div>

          {unattributed.length > 0 && (
            <div className="rounded-sm border border-border-soft bg-surface-2/60 px-3 py-2 text-[12px] text-ink-muted">
              <span className="font-semibold text-ink">Not attributed to an engagement:</span>
              <ul className="mt-1 flex flex-col gap-0.5 list-disc pl-4">
                {unattributed.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto border border-border-soft rounded-sm">
            <table className="w-full text-[12px]">
              <thead className="bg-surface-2">
                <tr className="text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
                  <th className="py-1.5 px-3">#</th>
                  <th className="py-1.5 px-3">Project</th>
                  <th className="py-1.5 px-3">Week</th>
                  <th className="py-1.5 px-3">Narrative</th>
                  <th className="py-1.5 px-3">RAID</th>
                  <th className="py-1.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => {
                  const raid = r.raw['RAID Type']
                    ? `${r.raw['RAID Type']} · ${r.raw['RAID Severity'] || 'Med'}${
                        r.raw['RAID Owner Email'] ? ` · ${r.raw['RAID Owner Email']}` : ''
                      }`
                    : '—';
                  const raidDesc = r.raw['RAID Description'] || '';
                  return (
                    <tr key={r.rowNumber} className="border-t border-border/60 align-top">
                      <td className="py-1.5 px-3 tabular-nums text-ink-faint">{r.rowNumber}</td>
                      <td className="py-1.5 px-3 font-mono text-ink-muted whitespace-nowrap">
                        {r.raw['Project Code'] || <span className="text-critical">missing</span>}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-ink-faint whitespace-nowrap">
                        {r.raw['Week Ending'] || '—'}
                      </td>
                      <td className="py-1.5 px-3 text-ink-muted max-w-[240px]">
                        {r.raw['Status Narrative'] || <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="py-1.5 px-3 text-ink-muted max-w-[240px]">
                        {raid === '—' ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <>
                            <span className="font-medium text-ink">{raid}</span>
                            {raidDesc && <div className="text-ink-faint">{raidDesc}</div>}
                          </>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        {r.errors.length === 0 ? (
                          <span className="text-success">valid</span>
                        ) : (
                          <ul className="flex flex-col gap-0.5">
                            {r.errors.map((issue, i) => (
                              <li key={i} className="text-critical">
                                {issue.field}: {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-primary !w-auto px-5 text-xs disabled:opacity-50"
              onClick={handleStage}
              disabled={phase === 'staging'}
            >
              {phase === 'staging'
                ? 'Sending…'
                : `Send ${rows?.length ?? 0} row${rows?.length === 1 ? '' : 's'} to the batch flow`}
            </button>
            <span className="text-[11px] text-ink-faint">
              Stages a batch you then review and commit — quarantined rows included.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
