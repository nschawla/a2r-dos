'use client';

/**
 * Universal sub-navigation pills. A module page renders all of its views as
 * server components and hands them to <ModuleTabs> as a `panels` map; this
 * client shell shows one at a time and keeps the rest in the DOM (hidden),
 * so switching is instant with zero extra requests.
 *
 * The active tab is reflected in the URL (`?v=<key>`, first tab omitted) via
 * history.replaceState — shareable and refresh-safe — without going through
 * the router, so no server round-trip and no Suspense boundary needed.
 */
import { useEffect, useState, isValidElement, type ReactNode } from 'react';
import clsx from 'clsx';

/** `actions` is either one node shown regardless of tab, or a lookup
 * object keyed by tab key (only that tab's entry renders). Deliberately
 * never a function — `<ModuleTabs>` is a Client Component rendered from a
 * Server Component page, and a closure can't cross that boundary (Next.js
 * hard-errors: "Functions cannot be passed directly to Client Components").
 * A plain object is fine to pass across it, same as any other prop. */
function resolveActions(
  actions: ReactNode | Partial<Record<string, ReactNode>> | undefined,
  activeKey: string
): ReactNode {
  if (actions == null) return null;
  if (typeof actions === 'object' && !isValidElement(actions) && !Array.isArray(actions)) {
    return (actions as Partial<Record<string, ReactNode>>)[activeKey] ?? null;
  }
  return actions as ReactNode;
}

export interface ModuleTab {
  key: string;
  label: string;
}

export function ModuleTabs({
  tabs,
  panels,
  param = 'v',
  className,
  printKey,
  printAll,
  actions,
  sticky = true,
  wrap = false,
}: {
  tabs: ModuleTab[];
  panels: Record<string, ReactNode>;
  param?: string;
  className?: string;
  /** Key of the panel that must still render when the page is printed even
   * if it isn't the active tab (e.g. a print-to-PDF board briefing). */
  printKey?: string;
  /** Every panel prints, regardless of which is active on screen — for a
   * board deck split into on-screen pills (Summary/Resources/Financials/
   * Risks-style) where the printed PDF is still the whole document, one
   * section after another. Takes precedence over `printKey`. */
  printAll?: boolean;
  /** Right-aligned content in the same sticky row as the pills. Either one
   * node shown regardless of which tab is active, or a `{ [tabKey]: node }`
   * lookup for an action that only makes sense on one panel (e.g. a
   * `<PrintButton>` that belongs to just one tab) — the active tab lives
   * in this component's own state, not the caller's, so a lookup is the
   * only way the caller can target one. Hidden on print along with the
   * pills themselves (the whole row is `print:hidden`). */
  actions?: ReactNode | Partial<Record<string, ReactNode>>;
  /** Wrap the pill row onto additional lines instead of horizontally
   * scrolling once it runs out of width. Off by default — most call sites
   * have few enough tabs to fit one row, and a single-row scroll reads
   * better there than a wrap that rarely triggers. Turn on for a row with
   * enough tabs (e.g. IngestionTemplateHub's one-per-template pills) that
   * horizontal scrolling would otherwise hide pills off-screen. */
  wrap?: boolean;
  /** Every usage of this component today is one top-level `<ModuleTabs>`
   * per page, where `sticky top-[3.35rem]` correctly pins the pill row
   * just below the global header. Set `false` for a `<ModuleTabs>` nested
   * inside another one's panel (e.g. IngestionTemplateHub's per-template
   * pills inside /admin/ingestion's own Templates tab) — two sticky rows
   * at the same offset fight for the same on-screen position once both
   * are scrolled into their stuck state. The nested pill row still works
   * perfectly well unstuck; it just scrolls with its panel like ordinary
   * content instead of pinning. */
  sticky?: boolean;
}) {
  const first = tabs[0]?.key ?? '';
  const [active, setActive] = useState(first);

  useEffect(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get(param);
      if (requested && tabs.some((t) => t.key === requested)) setActive(requested);
    } catch {
      /* ignore */
    }
    // tabs identity is stable for a given page render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  function go(key: string) {
    setActive(key);
    try {
      const url = new URL(window.location.href);
      if (key === first) url.searchParams.delete(param);
      else url.searchParams.set(param, key);
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div
        className={clsx(
          sticky && 'sticky top-[3.35rem] z-30 bg-bg/85 backdrop-blur-sm',
          '-mx-2 px-2 py-2 print:hidden flex items-center justify-between gap-3 flex-wrap',
          className
        )}
      >
        <div
          role="tablist"
          aria-label="Module views"
          className={clsx(
            'max-w-full gap-1 rounded-lg border border-border bg-surface-1 p-1',
            wrap ? 'flex flex-wrap' : 'inline-flex overflow-x-auto'
          )}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === active}
              onClick={() => go(t.key)}
              className={clsx(
                'rounded-md px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                t.key === active
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {resolveActions(actions, active)}
      </div>

      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          hidden={t.key !== active}
          data-print-keep={printAll || (printKey && t.key === printKey) ? '' : undefined}
          className="flex flex-col gap-5"
        >
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
