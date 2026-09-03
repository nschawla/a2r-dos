'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import clsx from 'clsx';
import { useDashboardUI, PERSONAS, type Persona } from './dashboard-ui-context';
import { BrandMark } from '@/components/ui/brand-mark';
import { switchActiveOrganization } from '@/server/actions/organizations';
import type { NotificationSummary } from '@/server/queries/notifications';
import type { SessionMembership } from '@/types/next-auth';

/** Closes `menu` when a pointer event lands outside `ref`, or Escape is pressed. */
function useOutsideClose(ref: React.RefObject<HTMLElement>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}

export interface HeaderProps {
  userName: string;
  role: SessionMembership['role'];
  organizationName: string;
  memberships: SessionMembership[];
  notifications: NotificationSummary;
  /** A2R Ventures staff — shows the "A2R Ops Console" workspace switch. */
  isA2rStaff?: boolean;
}

export function Header({ userName, role, organizationName, memberships, notifications, isA2rStaff }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-md border-b border-border px-5 py-2.5 flex items-center gap-2.5">
      <WorkspaceSwitcher organizationName={organizationName} memberships={memberships} />
      {isA2rStaff && <OpsConsoleSwitch />}
      <div className="flex-1 flex justify-center">
        <CommandPaletteTrigger />
      </div>
      <div className="flex items-center gap-1.5">
        <NotificationsBell notifications={notifications} />
        <SupportTrigger />
        <HelpTrigger />
        <UserMenu userName={userName} role={role} />
      </div>
    </header>
  );
}

// ------------------------------------------------------------- Ops console switch

/** A2R Operator Control Plane — visible only to A2R staff. Toggles from the
 * current client workspace over to the internal /ops console. The reverse
 * link ("← Client Workspace") lives in the ops shell. */
function OpsConsoleSwitch() {
  return (
    <Link
      href="/ops"
      title="Switch to the A2R Ops Console"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-brand/40 text-brand text-xs font-semibold hover:bg-brand/10 transition-colors whitespace-nowrap"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden />
      A2R Ops Console
    </Link>
  );
}

// ------------------------------------------------------------- Workspace switcher

function WorkspaceSwitcher({ organizationName, memberships }: { organizationName: string; memberships: SessionMembership[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, open, () => setOpen(false));

  async function switchTo(organizationId: string) {
    setSwitching(organizationId);
    try {
      const result = await switchActiveOrganization(organizationId);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="A2R Delivery OS™"
        className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-sm hover:bg-surface-2 transition-colors max-w-[220px]"
      >
        <BrandMark size="sm" />
        <span className="sr-only">A2R Delivery OS™ —</span>
        <span className="text-sm font-semibold truncate">{organizationName}</span>
        <span className="text-ink-faint text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-ink-faint font-semibold border-b border-border">
            Your organizations
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {memberships.map((m) => (
              <li key={m.organizationId}>
                <button
                  type="button"
                  disabled={switching === m.organizationId}
                  onClick={() => switchTo(m.organizationId)}
                  className={clsx(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-surface-2 transition-colors',
                    m.organizationName === organizationName && 'text-brand'
                  )}
                >
                  <span className="truncate">{m.organizationName}</span>
                  <span className="text-[10px] text-ink-faint uppercase flex-none">{m.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Command palette trigger

function CommandPaletteTrigger() {
  const { openCommandPalette } = useDashboardUI();
  const [isMac, setIsMac] = useState(true);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(window.navigator.platform ?? window.navigator.userAgent)), []);

  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="flex items-center gap-2.5 w-full max-w-md px-3.5 py-1.5 rounded-full bg-surface-2 border border-border-soft text-ink-faint hover:border-ink-faint transition-colors text-sm"
    >
      <span aria-hidden>🔎</span>
      <span className="flex-1 text-left">Search projects, people, RAID…</span>
      <kbd className="text-[10px] border border-border-soft rounded px-1.5 py-0.5 font-mono">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
    </button>
  );
}

// ------------------------------------------------------------- Support trigger

/** WP8 — opens the global Support & Ticket Submission modal (mounted once
 * in the dashboard layout, see SupportTicketModal.tsx). A separate icon
 * from HelpTrigger below: "?" is contextual, route-aware self-service
 * guidance; this is "talk to a human," available from anywhere. */
function SupportTrigger() {
  const { openSupportModal } = useDashboardUI();
  return (
    <button
      type="button"
      onClick={openSupportModal}
      aria-label="Contact Support"
      title="Contact Support"
      className="w-8 h-8 rounded-full border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center text-sm"
    >
      ✉️
    </button>
  );
}

// ------------------------------------------------------------- Help trigger

function HelpTrigger() {
  const { openHelpDrawer } = useDashboardUI();
  return (
    <button
      type="button"
      onClick={openHelpDrawer}
      aria-label="Help & governance guidance"
      title="Help & governance guidance"
      className="w-8 h-8 rounded-full border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center text-sm font-semibold"
    >
      ?
    </button>
  );
}

// ------------------------------------------------------------- Notifications bell

function NotificationsBell({ notifications }: { notifications: NotificationSummary }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, open, () => setOpen(false));
  const { total, paceAlerts, raidAlerts } = notifications;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${total} alerts`}
        className="relative w-8 h-8 rounded-full border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center text-sm"
      >
        🔔
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-critical text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-ink-faint font-semibold border-b border-border">
            Alerts · {total}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {total === 0 && <p className="px-3 py-4 text-sm text-ink-muted text-center">Nothing needs attention.</p>}
            {paceAlerts.map((a) => (
              <Link
                key={`pace-${a.projectId}-${a.phaseKey}`}
                href={`/schedule/${a.projectId}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-2 border-b border-border/60 last:border-0"
              >
                <span className="status-dot bg-critical mt-1.5" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Critical Pace Risk · {a.projectName}</div>
                  <div className="text-xs text-ink-faint capitalize">
                    {a.phaseKey} phase, {a.elapsedPct}% of window elapsed
                  </div>
                </div>
              </Link>
            ))}
            {raidAlerts.map((a) => (
              <Link
                key={`raid-${a.id}`}
                href={`/raid/${a.projectId}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-2 border-b border-border/60 last:border-0"
              >
                <span className="status-dot bg-warning mt-1.5" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">SteerCo Escalation · {a.projectName}</div>
                  <div className="text-xs text-ink-faint truncate">{a.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- User + persona menu

function UserMenu({ userName, role }: { userName: string; role: SessionMembership['role'] }) {
  const { persona, setPersona } = useDashboardUI();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, open, () => setOpen(false));
  const activePersonaLabel = PERSONAS.find((p) => p.key === persona)?.label ?? persona;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full hover:bg-surface-2 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-surface-3 border border-border-soft flex items-center justify-center text-xs font-bold flex-none">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:block text-left">
          <span className="block text-xs font-semibold leading-tight max-w-[120px] truncate">{userName}</span>
          <span className="block text-[10px] text-ink-faint leading-tight">{activePersonaLabel}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-sm font-semibold truncate">{userName}</div>
            <div className="text-[10px] text-ink-faint uppercase">Org role: {role}</div>
          </div>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-ink-faint font-semibold border-b border-border">
            Preview as (RBAC testing)
          </div>
          <ul className="py-1">
            {PERSONAS.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setPersona(p.key as Persona)}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-surface-2 transition-colors',
                    p.key === persona ? 'text-brand' : 'text-ink-muted'
                  )}
                >
                  {p.label}
                  {p.key === persona && <span>✓</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full px-3 py-2.5 text-sm text-left text-critical hover:bg-surface-2 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
