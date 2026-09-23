'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Documentation Hub — the in-app reader for the repo's curated `docs/*.md`
 * files (+ root `CHANGELOG.md`), at /ops/docs, gated the same as every
 * other engineering-reference surface (`devdocs:view`, same capability as
 * /ops/dev-docs — see that page for the hand-authored, narrower
 * consolidation this complements rather than replaces).
 *
 * Content is baked in at build time (`scripts/build-docs-hub.ts` →
 * `src/lib/ops/docs-hub-content.generated.ts`), not fetched or read from
 * disk at runtime — see that script's header for why. Only the active
 * doc is actually rendered through react-markdown at once (not all 21,
 * hidden-via-CSS the way `<ModuleTabs>` does it) — the content is already
 * in the page's JS bundle either way, so switching is still instant with
 * zero network requests; this just avoids mounting 21 full markdown trees
 * simultaneously.
 */
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import type { Components } from 'react-markdown';
import type { DocsHubEntry } from '@/lib/ops/docs-hub-content.generated';

const PARAM = 'doc';

/** Turn a markdown cross-reference like `docs/RAID_EXECUTIVE_TRIAGE.md` or
 * a bare `SECURITY.md` into the slug it maps to in this hub, so an
 * in-repo doc link stays a real, working jump instead of a dead href. */
function buildFileIndex(entries: readonly DocsHubEntry[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const e of entries) {
    index.set(e.file, e.slug); // "docs/ERD.md" -> "erd"
    index.set(e.file.split('/').pop()!, e.slug); // "ERD.md" -> "erd"
  }
  return index;
}

export function DocsHub({ entries, categoryOrder }: { entries: DocsHubEntry[]; categoryOrder: readonly string[] }) {
  const fileIndex = useMemo(() => buildFileIndex(entries), [entries]);
  const bySlug = useMemo(() => new Map(entries.map((e) => [e.slug, e])), [entries]);
  const first = entries[0]?.slug ?? '';
  const [active, setActive] = useState(first);

  useEffect(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get(PARAM);
      if (requested && bySlug.has(requested)) setActive(requested);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(slug: string) {
    setActive(slug);
    try {
      const url = new URL(window.location.href);
      if (slug === first) url.searchParams.delete(PARAM);
      else url.searchParams.set(PARAM, slug);
      window.history.replaceState(null, '', url);
      document.getElementById('docs-hub-content')?.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
  }

  const doc = bySlug.get(active) ?? entries[0];

  const components: Components = useMemo(
    () => ({
      a: ({ href, children, ...props }) => {
        const targetSlug = href ? fileIndex.get(href.replace(/^\.\//, '')) : undefined;
        if (targetSlug) {
          return (
            <button
              type="button"
              onClick={() => go(targetSlug)}
              className="text-brand font-semibold hover:underline underline-offset-2"
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline underline-offset-2" {...props}>
            {children}
          </a>
        );
      },
      h1: ({ children }) => <h1 className="text-[22px] font-display font-bold mb-3 mt-1">{children}</h1>,
      h2: ({ children }) => <h2 className="text-[17px] font-display font-bold mt-7 mb-2.5 pb-1.5 border-b border-border-soft">{children}</h2>,
      h3: ({ children }) => <h3 className="text-[14.5px] font-bold mt-5 mb-2">{children}</h3>,
      h4: ({ children }) => <h4 className="text-[13px] font-bold mt-4 mb-1.5">{children}</h4>,
      p: ({ children }) => <p className="text-[13.5px] leading-relaxed text-ink mb-3">{children}</p>,
      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-[13.5px] text-ink">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-[13.5px] text-ink">{children}</ol>,
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
      em: ({ children }) => <em className="text-ink-muted">{children}</em>,
      hr: () => <hr className="my-6 border-border-soft" />,
      blockquote: ({ children }) => (
        <blockquote className="border-l-[3px] border-l-brand/40 pl-3.5 my-3 text-ink-muted text-[13px]">{children}</blockquote>
      ),
      code: ({ className, children, ...props }) => {
        const isBlock = /language-/.test(className ?? '');
        if (isBlock) {
          return (
            <code className={clsx('block font-mono text-[12px]', className)} {...props}>
              {children}
            </code>
          );
        }
        return (
          <code className="font-mono text-[12px] bg-surface-2 border border-border-soft rounded px-1 py-0.5" {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre className="bg-surface-2 border border-border-soft rounded-md p-3.5 mb-3 overflow-x-auto">{children}</pre>
      ),
      table: ({ children }) => (
        <div className="overflow-x-auto mb-4 rounded-md border border-border-soft">
          <table className="w-full text-[12.5px]">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-surface-2 text-left text-ink-faint text-[10.5px] uppercase tracking-wide">{children}</thead>,
      th: ({ children }) => <th className="py-2 px-3 font-semibold border-b border-border-soft">{children}</th>,
      td: ({ children }) => <td className="py-2 px-3 border-b border-border-soft/60 align-top">{children}</td>,
    }),
    [fileIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!doc) {
    return <div className="card">No documentation entries are configured.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
      <nav className="lg:sticky lg:top-[4.5rem] lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto flex flex-col gap-4 pb-4">
        {categoryOrder.map((category) => {
          const items = entries.filter((e) => e.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category}>
              <div className="px-1 pb-1.5 text-[9.5px] uppercase tracking-wide text-ink-faint font-mono font-medium">
                {category}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const isActive = item.slug === active;
                  return (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => go(item.slug)}
                      className={clsx(
                        'relative text-left rounded-sm px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors truncate',
                        isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                      )}
                      title={item.title}
                    >
                      {isActive && <span className="absolute -left-1 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand" />}
                      {item.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div id="docs-hub-content" className="card !p-6 min-w-0 max-h-[calc(100vh-6rem)] overflow-y-auto">
        <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-mono font-medium mb-1">
          {doc.category} · {doc.file}
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {doc.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
