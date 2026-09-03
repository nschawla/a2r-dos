'use client';

/**
 * Universal Cmd+K / Ctrl+K palette — mounted once at the app root, so it
 * opens on every surface (dashboard, Ops Console, auth). Keyboard-first:
 * ⌘K toggles, ↑/↓ move, Enter runs, Esc clears then closes.
 *
 * Opens instantly from cached state; the org-scoped search index loads
 * once on first open. The active row's destination is prefetched so Enter
 * is a same-frame navigation.
 */
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import clsx from 'clsx';
import { getCommandKContext, type CommandKContext } from '@/server/actions/command-k';
import {
  buildCommandKItems,
  groupCommandKItems,
  type CommandKItem,
  type CommandKDot,
} from '@/lib/command-center/command-k-results';

export const OPEN_COMMAND_K_EVENT = 'a2r:command-k';

const DOT_CLASS: Record<CommandKDot, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  critical: 'bg-critical',
  neutral: 'bg-ink-faint',
};

export function CommandK() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [ctx, setCtx] = useState<CommandKContext | null>(null);
  const loadedRef = useRef(false);

  const deferredQuery = useDeferredValue(query);

  const items = useMemo<CommandKItem[]>(
    () => (ctx ? buildCommandKItems(deferredQuery, ctx) : []),
    [ctx, deferredQuery]
  );
  const groups = useMemo(() => groupCommandKItems(items), [items]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const run = useCallback(
    (item: CommandKItem | undefined) => {
      if (!item) return;
      close();
      const a = item.action;
      if (a.type === 'navigate') router.push(a.href);
      else if (a.type === 'search') setOpen(true);
      else if (a.type === 'signout') signOut({ callbackUrl: '/login' });
    },
    [close, router]
  );

  // Global open/toggle: ⌘K / Ctrl+K, plus the custom event other triggers fire.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_K_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_COMMAND_K_EVENT, onOpenEvent);
    };
  }, []);

  // On first open: load the index; every open: reset + focus.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    if (!loadedRef.current) {
      loadedRef.current = true;
      getCommandKContext()
        .then(setCtx)
        .catch(() => setCtx({ projects: [], resources: [], raidAlerts: [], isStaff: false }));
    }
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => setActive(0), [deferredQuery]);

  // Prefetch the active destination so Enter is instant.
  useEffect(() => {
    const a = items[active]?.action;
    if (open && a?.type === 'navigate') router.prefetch(a.href);
  }, [open, items, active, router]);

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else close();
    }
  }

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center px-4 pt-[13vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] motion-safe:animate-[cmdk-fade_120ms_ease-out]"
        onClick={close}
      />
      <div className="relative w-full max-w-xl bg-surface-1 border border-border rounded-lg shadow-elevated overflow-hidden motion-safe:animate-[cmdk-pop_130ms_ease-out]">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <span className="font-mono text-[11px] text-ink-faint flex-none">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search or run a command…"
            aria-label="Command input"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-faint caret-brand"
          />
          <kbd className="flex-none text-[10px] text-ink-faint border border-border rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {!ctx ? (
            <p className="px-4 py-8 text-sm text-ink-muted text-center">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-sm text-ink-muted text-center">No matches.</p>
          ) : (
            groups.map((group) => (
              <div key={group.section}>
                <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  {group.section}
                </div>
                {group.items.map((item) => {
                  flatIdx += 1;
                  const i = flatIdx;
                  const selected = i === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(item)}
                      className={clsx(
                        'relative w-full flex items-center gap-3 pl-4 pr-3 py-2 text-left text-[13px] transition-colors duration-100',
                        selected ? 'bg-surface-2 text-ink' : 'text-ink-muted'
                      )}
                    >
                      <span
                        className={clsx(
                          'absolute left-0 top-1 bottom-1 w-[2px] rounded-full transition-opacity',
                          selected ? 'bg-brand opacity-100' : 'opacity-0'
                        )}
                        aria-hidden
                      />
                      {item.dot ? (
                        <span className={clsx('w-1.5 h-1.5 rounded-full flex-none', DOT_CLASS[item.dot])} aria-hidden />
                      ) : (
                        <span className="w-1.5 h-1.5 flex-none" aria-hidden />
                      )}
                      <span className="flex-1 min-w-0 truncate">
                        {item.label}
                        {item.sub && <span className="text-ink-faint"> · {item.sub}</span>}
                      </span>
                      {selected && (
                        <span className="flex-none font-mono text-[10px] text-ink-faint">↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
