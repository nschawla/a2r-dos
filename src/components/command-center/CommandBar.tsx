'use client';

/**
 * The universal Command Bar — a Spotlight/terminal-inspired input anchored
 * as the Command Center's primary execution header, directly beneath the
 * Pulse strip. Type a destination, an action, or "<module> for
 * <engagement>"; suggestions drop below the prompt; Enter runs the top one.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import clsx from 'clsx';
import { useDashboardUI } from '@/components/layout/dashboard-ui-context';
import { resolveCommand, type CommandSuggestion } from '@/lib/command-center/commands';

const KIND_HINT: Record<CommandSuggestion['kind'], string> = {
  nav: 'Go',
  action: 'Run',
  engagement: 'Open',
};

export function CommandBar({
  projects,
  isStaff,
}: {
  projects: { id: string; name: string }[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const { openCommandPalette } = useDashboardUI();
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  const suggestions = useMemo(
    () => resolveCommand(value, { projects, isStaff }),
    [value, projects, isStaff]
  );

  const open = focused && suggestions.length > 0;

  function run(s: CommandSuggestion | undefined) {
    if (!s) return;
    setValue('');
    setActive(0);
    inputRef.current?.blur();
    switch (s.action.type) {
      case 'navigate':
        router.push(s.action.href);
        break;
      case 'search':
        openCommandPalette();
        break;
      case 'signout':
        signOut({ callbackUrl: '/login' });
        break;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(suggestions[active]);
    } else if (e.key === 'Escape') {
      if (value) setValue('');
      else inputRef.current?.blur();
    }
  }

  return (
    <div className="sticky top-4 z-30">
      <div className="relative">
        {open && (
          <ul
            role="listbox"
            className="absolute top-full mt-2 w-full rounded-lg border border-border bg-surface-1 shadow-elevated overflow-hidden py-1"
          >
            {suggestions.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    run(s);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors',
                    i === active ? 'bg-surface-2 text-ink' : 'text-ink-muted'
                  )}
                >
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="flex-none font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                    {s.hint ?? KIND_HINT[s.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          className={clsx(
            'flex items-center gap-2.5 rounded-lg border bg-bg/85 backdrop-blur-md px-4 py-3 transition-colors',
            focused ? 'border-brand' : 'border-border'
          )}
        >
          <span className="font-mono text-brand text-sm leading-none flex-none" aria-hidden>
            ›
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder="Navigate or run a command — try “financials for …” or “raid”"
            aria-label="Command bar"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-faint font-mono"
          />
          <kbd className="flex-none font-mono text-[10px] text-ink-faint border border-border rounded px-1.5 py-0.5">
            ↵
          </kbd>
        </div>
      </div>
    </div>
  );
}
