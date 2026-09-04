'use client';

/**
 * RBAC Persona Preview — an Ops Console-only demo / testing helper, not an
 * access control. Lets an A2R operator set which RBAC persona
 * (src/lib/governance/rbacMatrix.ts) a tenant's Sidebar and per-engagement
 * module pills render as, ahead of a demo or setup walkthrough — without
 * ever exposing a "preview as" control to the everyday users or external
 * clients signed into that tenant themselves (it lived in the main header
 * before; it now lives only here).
 *
 * Strictly DISPLAY-ONLY: the choice is client-side state (localStorage,
 * shared with src/components/layout/dashboard-ui-context.tsx via
 * src/lib/client/rbac-preview.ts), never sent to the server, and never
 * changes what a route actually lets through — middleware.ts and every
 * scoped query still enforce whichever real user is signed into the
 * tenant's own session DeliveryRole. Set it here, then switch to
 * "← Client Workspace" (or start an impersonation session) to see it live.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useRbacPreview } from '@/lib/client/rbac-preview';
import { RBAC_MATRIX, RBAC_PERSONAS, type RbacPersona } from '@/lib/governance/rbacMatrix';

export function RbacPersonaSwitcher() {
  const { rbacPreview, setRbacPreview } = useRbacPreview();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(p: RbacPersona) {
    setRbacPreview(p);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Set the RBAC persona a tenant previews as (display only)"
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border text-xs font-semibold whitespace-nowrap transition-colors',
          open
            ? 'border-brand text-ink'
            : rbacPreview
              ? 'border-warning/50 bg-warning-soft text-warning'
              : 'border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint'
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-[14px] w-[14px] flex-none"
        >
          <circle cx="12" cy="8" r="3.4" />
          <path d="M4.8 20c1.2-4 4-6 7.2-6s6 2 7.2 6" />
        </svg>
        Persona Preview
        <span className="text-ink-faint font-normal">{rbacPreview ? `· ${RBAC_MATRIX[rbacPreview].label}` : '· Off'}</span>
        <span className="text-ink-faint text-[10px]">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-80 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
              Preview a tenant’s navigation as
            </div>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Display only — sets what the Sidebar renders on your next tenant visit. Never changes real access.
            </p>
          </div>
          <ul className="py-1">
            {RBAC_PERSONAS.map((key) => {
              const def = RBAC_MATRIX[key];
              const active = key === rbacPreview;
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(key)}
                    className={clsx(
                      'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-surface-2 transition-colors',
                      active ? 'text-brand' : 'text-ink'
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{def.label}</span>
                      <span className="block text-[11px] text-ink-faint leading-tight mt-0.5">{def.blurb}</span>
                    </span>
                    {active && <span className="flex-none text-xs mt-0.5">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {rbacPreview && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setRbacPreview(null);
                  setOpen(false);
                }}
                className="w-full px-3 py-2.5 text-xs font-semibold text-left text-warning hover:bg-surface-2 transition-colors"
              >
                Clear preview — each user’s real role
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
