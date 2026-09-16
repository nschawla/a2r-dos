'use client';

/**
 * Persona Preview — the ONE explicit, clearly-labeled control for the RBAC
 * persona simulation (src/lib/governance/rbacMatrix.ts). It replaces two
 * things that used to cause confusion during pilot review:
 *   1. A dead "Preview as (RBAC testing)" list buried in the account menu
 *      (src/components/layout/personas.ts's old `Persona` axis) that drove
 *      nothing real and had drifted out of sync with the matrix below it.
 *   2. The fact that the one mechanism that DID work
 *      (src/components/ops/RbacPersonaSwitcher.tsx) only existed inside the
 *      internal Ops Console, so a tenant ADMIN previewing another role
 *      while sitting inside their own tenant had no visible control and no
 *      visible reminder that a preview was even active.
 *
 * This bar is:
 *   - Rendered only for `eligible` viewers (tenant ADMIN or A2R staff — see
 *     the gate in src/app/(dashboard)/layout.tsx). Every other signed-in
 *     user gets no switcher at all: they are locked into their own real
 *     navigation, full stop.
 *   - A full-width banner at the very top of the shell (same sticky-strip
 *     language as ImpersonationBanner / GraceperiodBanner) rather than a
 *     dropdown tucked into the header's icon row — deliberately out of the
 *     normal operational flow, so a click here always reads as "I am
 *     changing how I'm looking at this," not as a normal nav action.
 *   - Quiet (neutral surface) at rest, unmistakably loud (solid warning
 *     fill, pulsing dot, "Exit preview") the instant a non-native persona
 *     is active — so a preview can never be mistaken for real access.
 *
 * Strictly DISPLAY-ONLY, same as everything downstream of it: this only
 * writes to src/lib/client/rbac-preview.ts's localStorage-backed state,
 * which only changes what Sidebar.tsx and ProjectHeader.tsx render.
 * middleware.ts and every server action/query enforce the signed-in user's
 * REAL session DeliveryRole and never read this value.
 *
 * Picking a persona also navigates to its `landing` route
 * (rbacMatrix.ts) — the same "switch drops you on the tailored page"
 * convention the old header lens pill used. Without it, switching to
 * Guest while sitting on /audit/[id] would leave the main pane showing a
 * module that persona's Sidebar no longer lists at all: a mismatched,
 * orphaned URL, not a clean preview.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDashboardUI } from './dashboard-ui-context';
import { RBAC_MATRIX, RBAC_PERSONAS, type RbacPersona } from '@/lib/governance/rbacMatrix';

export function PersonaPreviewBar({ eligible }: { eligible: boolean }) {
  const { rbacPersona, realRbacPersona, rbacPreviewActive, setRbacPreview } = useDashboardUI();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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

  // Standard users, locked into their native operational view: render
  // nothing — not a disabled control, not a hint. No switcher exists.
  if (!eligible) return null;

  function pick(p: RbacPersona | null) {
    const next = p === realRbacPersona ? null : p;
    setRbacPreview(next);
    setOpen(false);
    startTransition(() => {
      router.push(RBAC_MATRIX[next ?? realRbacPersona].landing);
      router.refresh();
    });
  }

  return (
    <div
      id="persona-preview-bar"
      className={clsx(
        'sticky top-0 z-[105] flex items-center justify-center gap-2.5 px-4 py-1.5 text-[12.5px] font-semibold border-b flex-wrap transition-colors',
        rbacPreviewActive
          ? 'bg-warning text-black border-warning/60'
          : 'bg-surface-1 text-ink-faint border-border-soft'
      )}
    >
      {rbacPreviewActive && <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" aria-hidden />}
      <span>Persona Preview:</span>

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          // Explicit accessible name, distinct from the bare persona label
          // text visible on the button — RBAC_MATRIX labels ("Global
          // Admin" etc.) are reused verbatim as plain button text elsewhere
          // in the app (e.g. KpiBuilderPanel's target-audience toggles), so
          // an unprefixed name here would collide with those on any page
          // that renders both.
          aria-label={`Persona Preview: ${RBAC_MATRIX[rbacPersona].label}`}
          title="Simulate another persona's navigation and module access"
          disabled={pending}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-semibold transition-colors',
            pending && 'opacity-60',
            rbacPreviewActive
              ? 'border-black/40 bg-black/10 hover:bg-black/15'
              : 'border-border-soft hover:border-ink-faint hover:text-ink'
          )}
        >
          {RBAC_MATRIX[rbacPersona].label}
          <span className="text-[10px] opacity-70">▾</span>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-80 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50 text-left font-normal"
          >
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
                See the app as
              </div>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Display only — changes the Sidebar and module tabs on this device. Never your real access.
              </p>
            </div>
            <ul className="py-1">
              <li>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!rbacPreviewActive}
                  onClick={() => pick(null)}
                  className={clsx(
                    'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-surface-2 transition-colors',
                    !rbacPreviewActive ? 'text-brand' : 'text-ink'
                  )}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold leading-tight">
                      {RBAC_MATRIX[realRbacPersona].label} — your real access
                    </span>
                    <span className="block text-[11px] text-ink-faint leading-tight mt-0.5">
                      Stop previewing and return to your own permissions.
                    </span>
                  </span>
                  {!rbacPreviewActive && <span className="flex-none text-xs mt-0.5">✓</span>}
                </button>
              </li>
              <li className="h-px bg-border/70 my-1 mx-3" />
              {RBAC_PERSONAS.map((key) => {
                const def = RBAC_MATRIX[key];
                const active = rbacPreviewActive && key === rbacPersona;
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
          </div>
        )}
      </div>

      {rbacPreviewActive && (
        <>
          <span className="text-black/70">— simulated view, not your real access</span>
          <button
            type="button"
            onClick={() => pick(realRbacPersona)}
            className="rounded-sm border border-black/40 px-2 py-0.5 hover:bg-black/10 transition-colors disabled:opacity-60"
            disabled={pending}
          >
            Exit preview
          </button>
        </>
      )}
    </div>
  );
}
