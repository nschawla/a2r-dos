'use client';

/**
 * REL-2 / UX-2 (GA-readiness audit) — app-wide toast surface.
 *
 * Mounted once in the root layout so any client component can surface a
 * transient success / error message without threading state through the
 * tree. `useSafeAction` (src/lib/client/safe-action.ts) uses this to turn
 * an unhandled server-action rejection into a visible "something went
 * wrong" instead of a silently re-enabled button.
 *
 * `useToast()` degrades to a console-logging no-op if used outside the
 * provider — a missing provider must never break a mutation flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastVariant = 'default' | 'success' | 'error';

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss; `0` to keep until dismissed. Default 6000. */
  durationMs?: number;
}

interface ToastRecord extends Required<Omit<ToastInput, 'durationMs'>> {
  id: number;
}

interface ToastApi {
  toast: (t: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const FALLBACK: ToastApi = {
  toast: (t) => {
    // eslint-disable-next-line no-console
    console[t.variant === 'error' ? 'error' : 'log'](`[toast:${t.variant ?? 'default'}] ${t.title}${t.description ? ` — ${t.description}` : ''}`);
  },
  dismiss: () => {},
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++nextId;
      const record: ToastRecord = {
        id,
        title: t.title,
        description: t.description ?? '',
        variant: t.variant ?? 'default',
      };
      setItems((xs) => [...xs, record]);
      const duration = t.durationMs ?? 6000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? FALLBACK;
}

const VARIANT_STYLE: Record<ToastVariant, { accent: string; label: string }> = {
  default: { accent: 'border-l-brand-hi', label: 'text-ink' },
  success: { accent: 'border-l-success', label: 'text-success' },
  error: { accent: 'border-l-critical', label: 'text-critical' },
};

function ToastViewport({ items, onDismiss }: { items: ToastRecord[]; onDismiss: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
      role="region"
      aria-label="Notifications"
    >
      {items.map((t) => {
        const style = VARIANT_STYLE[t.variant];
        return (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
            className={`bg-surface-1 border border-border border-l-2 ${style.accent} rounded-md shadow-card px-3.5 py-3 flex items-start gap-3`}
          >
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] font-semibold ${style.label}`}>{t.title}</p>
              {t.description && <p className="text-xs text-ink-muted mt-0.5 break-words">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="flex-none w-5 h-5 -mr-1 -mt-0.5 rounded-sm text-ink-faint hover:text-ink flex items-center justify-center text-sm leading-none"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
