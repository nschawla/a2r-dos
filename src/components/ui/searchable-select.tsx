'use client';

/**
 * Type-to-filter engagement/project combobox — the fix for a picker that
 * degrades badly once a tenant has 50–100+ active engagements: a wrapped
 * pill row (`<PillSelectorRow>`, §5) or a plain scrollable list
 * (`ProjectPicker`) both turn into a wall the viewer has to hunt through.
 * This keeps the same "pick one of a known set" shape and interaction
 * contract as `<PillSelectorRow>` (caller owns the selected value and what
 * selecting does — this component only renders and reports a choice) but
 * costs a few lines of vertical space regardless of how many options there
 * are, and gets there by typing instead of scanning.
 *
 * Styled as a single pill, not a generic rectangular form input — it's
 * standing in for a whole row of `<PillSelectorRow>` pills, so it keeps
 * that same rounded-2xl/border-2 treatment, brand-colored while idle
 * (reads like one "active" pill showing the current choice) and dropping
 * to a neutral border while open/typing, so it's visually clear you've
 * moved from *viewing* a selection to *picking* a new one.
 *
 * Deliberately a plain controlled input + an absolutely-positioned panel,
 * not a new dependency — the filtering, keyboard nav (↑/↓/Enter/Esc), and
 * open/close state are all small enough to own directly, matching how
 * every other dropdown in this app (the header's notification bell, the
 * organization switcher) is already built.
 *
 * Two selection modes, picked by whether the caller passes `getHref`:
 *  - `onSelect` only (Executive Hub's engagement picker): selecting
 *    updates state on the *same* page (a `?project=` query param) — rows
 *    render as buttons, same as `<PillSelectorRow>`'s own interaction
 *    contract.
 *  - `getHref` (the module landing pickers): selecting always *navigates
 *    away* to `/<module>/[id]` — rows render as real `<Link>`s instead of
 *    buttons, so cmd/middle-click-to-open-in-a-new-tab keeps working and
 *    the result stays an `<a href>` a test (or a screen reader) can find
 *    as a link, not a bespoke button. `onSelect`, if also given, still
 *    fires alongside the navigation.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

export interface SearchableSelectOption {
  id: string;
  label: string;
  /** Secondary text shown (and matched on) alongside the label — e.g. the client name. */
  sublabel?: string | null;
  /** A Tailwind background class for a small leading status dot, e.g. `'bg-critical'`.
   * The caller owns the health→color mapping, same as `<PillSelectorRow>`'s `icon`. */
  dotClassName?: string | null;
  /** A small trailing tag, e.g. "Locked". */
  badge?: string | null;
}

export function SearchableSelect({
  label,
  options,
  selectedId,
  onSelect,
  getHref,
  placeholder = 'Type to search…',
  ariaLabel,
  emptyText = 'No matches.',
  pending,
}: {
  /** Small eyebrow label above the pill — stays visible regardless of
   * selection state, unlike a placeholder (which the chosen label replaces). */
  label?: string;
  options: SearchableSelectOption[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** When provided, options render as real `<Link href>`s and selecting
   * one navigates there — see the file doc comment's two selection modes. */
  getHref?: (id: string) => string;
  placeholder?: string;
  ariaLabel?: string;
  emptyText?: string;
  /** Dims + disables the control while a selection is still resolving
   * (e.g. an async navigation) — same role as `<PillSelectorRow>`'s `pending`. */
  pending?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  // The single source of truth for what the input shows, closed or open.
  // Deliberately NOT derived from `selectedId` at render time: after
  // `choose()` picks a *new* option, `selectedId` is still the old value
  // until the caller's own state/async-nav round-trip catches up (a beat
  // later, or — for a same-pathname query-param nav — occasionally
  // several seconds later; see reports-hub-client.tsx's own fallback
  // comment). Reading `selectedId` directly here would show the stale
  // choice, faded, until that round-trip lands. `query` is set
  // optimistically in `choose()` instead, and only ever resynced from the
  // real selection on an actual `selectedId` change (effect below) or a
  // revert (closing without choosing).
  const [query, setQuery] = useState(() => options.find((o) => o.id === selectedId)?.label ?? '');
  const [activeIdx, setActiveIdx] = useState(0);

  const selected = useMemo(() => options.find((o) => o.id === selectedId) ?? null, [options, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => setActiveIdx(0), [query, open]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
  // keyed on selectedId alone, not `selected`/`options` — see the `query`
  // state doc comment above.
  useEffect(() => setQuery(selected ? selected.label : ''), [selectedId]);

  function openFresh() {
    setOpen(true);
    setQuery('');
  }

  function closeAndRevert() {
    setOpen(false);
    setQuery(selected ? selected.label : '');
  }

  function choose(o: SearchableSelectOption) {
    if (getHref) router.push(getHref(o.id));
    onSelect?.(o.id);
    setOpen(false);
    setQuery(o.label);
    // Deliberately not calling inputRef.current?.blur() here — doing so
    // synchronously fires `onBlur` (closeAndRevert), which reads the
    // *still-stale* `selectedId` prop and immediately overwrites the
    // optimistic label this just set, back to the previous choice, until
    // the caller's own state/nav round-trip eventually catches up.
    // `setOpen(false)` already closes the panel; staying focused is fine.
  }

  // Keeps the input focused through a mousedown on an option row, so
  // `onBlur` doesn't close (and unmount) the panel before the click that
  // follows gets to land on it. Safe for a real `<Link>` too —
  // preventDefault on mousedown only suppresses the browser's default
  // focus-shift/text-selection, never the click/navigation itself, so
  // ctrl/cmd/middle-click still work normally.
  function holdFocus(e: MouseEvent) {
    e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        openFresh();
        return;
      }
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[activeIdx];
      if (o) choose(o);
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">{label}</div>}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            !getHref && open && filtered[activeIdx] ? `${listId}-${filtered[activeIdx]!.id}` : undefined
          }
          aria-label={ariaLabel ?? label}
          disabled={pending}
          className={clsx(
            'w-full rounded-2xl border-2 px-3.5 py-2 text-[13px] font-semibold',
            'transition-all duration-150 ease-out disabled:opacity-50',
            'placeholder:font-normal placeholder:text-ink-faint',
            open
              ? 'border-border bg-surface-1 text-ink'
              : query
                ? 'border-brand bg-brand/[0.08] text-brand shadow-[0_0_0_3px_rgba(11,95,209,0.14)]'
                : 'border-border-soft bg-surface-1 text-ink-muted hover:border-border hover:bg-surface-2'
          )}
          placeholder={placeholder}
          value={query}
          onFocus={openFresh}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={closeAndRevert}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div
            id={listId}
            role={getHref ? undefined : 'listbox'}
            aria-label={ariaLabel ?? label}
            className="absolute left-0 right-0 top-full mt-1.5 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50 max-h-80 overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-ink-muted text-center">{emptyText}</p>
            ) : (
              filtered.map((o, i) => {
                const rowClassName = clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-border/60 last:border-0 hover:bg-surface-2',
                  i === activeIdx && 'bg-surface-2'
                );
                const content = (
                  <>
                    {o.dotClassName && <span className={clsx('status-dot flex-none', o.dotClassName)} />}
                    <span className={clsx('min-w-0 flex-1 truncate text-sm', o.id === selectedId && 'font-semibold')}>
                      {o.label}
                    </span>
                    {o.sublabel && (
                      <span className="flex-none text-ink-muted text-xs truncate max-w-[40%]">{o.sublabel}</span>
                    )}
                    {o.badge && <span className="flex-none text-[10px] text-ink-faint">{o.badge}</span>}
                  </>
                );
                return getHref ? (
                  // A plain link, not role="option" — an explicit role
                  // would override its implicit (and here, more honest)
                  // "link" role: choosing one leaves this page entirely,
                  // which a listbox option's semantics don't really fit.
                  <Link
                    key={o.id}
                    id={`${listId}-${o.id}`}
                    href={getHref(o.id)}
                    className={rowClassName}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={holdFocus}
                    onClick={() => {
                      setOpen(false);
                      onSelect?.(o.id);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={o.id}
                    id={`${listId}-${o.id}`}
                    type="button"
                    role="option"
                    aria-selected={o.id === selectedId}
                    className={rowClassName}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={holdFocus}
                    onClick={() => choose(o)}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
