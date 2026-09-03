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
import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';

export interface ModuleTab {
  key: string;
  label: string;
  /** Small trailing count / hint, e.g. a badge number. */
  hint?: string | number;
}

export function ModuleTabs({
  tabs,
  panels,
  param = 'v',
  className,
  printKey,
}: {
  tabs: ModuleTab[];
  panels: Record<string, ReactNode>;
  param?: string;
  className?: string;
  /** Key of the panel that must still render when the page is printed even
   * if it isn't the active tab (e.g. a print-to-PDF board briefing). */
  printKey?: string;
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
          'sticky top-[3.35rem] z-30 -mx-2 px-2 py-2 bg-bg/85 backdrop-blur-sm print:hidden',
          className
        )}
      >
        <div
          role="tablist"
          aria-label="Module views"
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface-1 p-1"
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
              {t.hint != null && t.hint !== '' && (
                <span className="ml-1.5 font-normal text-ink-faint tabular-nums">{t.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          hidden={t.key !== active}
          data-print-keep={printKey && t.key === printKey ? '' : undefined}
          className="flex flex-col gap-5"
        >
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
