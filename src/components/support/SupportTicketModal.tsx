/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 */

'use client';

/**
 * WP8 — the in-app Support & Ticket Submission modal. Mounted once in
 * src/app/(dashboard)/layout.tsx (same pattern as CommandPalette/HelpDrawer
 * — a single global overlay driven by DashboardUIProvider's
 * supportModalOpen flag, not re-mounted per page) and opened from two
 * places: HelpDrawer.tsx's "Contact Support" footer CTA, and Header.tsx's
 * own support trigger next to the "?" Help button.
 *
 * The Name/Email/Organization/Current Page block is read-only, auto-
 * populated context — shown so the user can see exactly what accompanies
 * their ticket, but it's cosmetic. The actual server action
 * (submitSupportTicketAction) re-resolves identity from the authenticated
 * session itself rather than trusting any of these props; see that file's
 * doc comment.
 */
import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useDashboardUI } from '@/components/layout/dashboard-ui-context';
import {
  submitSupportTicketAction,
  type SupportTicketCategory,
  type SupportTicketPriority,
} from '@/server/actions/support';

export interface SupportTicketModalProps {
  userName: string;
  userEmail: string | null;
  organizationId: string;
  organizationName: string;
}

const CATEGORY_OPTIONS: { value: SupportTicketCategory; label: string }[] = [
  { value: 'bug', label: 'Something looks broken' },
  { value: 'question', label: 'How do I…?' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'billing', label: 'Billing / subscription' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS: { value: SupportTicketPriority; label: string; desc: string }[] = [
  { value: 'urgent', label: 'Urgent', desc: 'The Service is unavailable for the whole organization' },
  { value: 'high', label: 'High', desc: 'A core workflow is broken, no workaround' },
  { value: 'medium', label: 'Medium', desc: 'Non-blocking defect or a workaround exists' },
  { value: 'low', label: 'Low', desc: 'General question, cosmetic issue, or request' },
];

export function SupportTicketModal({ userName, userEmail, organizationId, organizationName }: SupportTicketModalProps) {
  const { supportModalOpen, closeSupportModal } = useDashboardUI();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('question');
  const [priority, setPriority] = useState<SupportTicketPriority>('medium');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  if (!supportModalOpen) return null;

  function resetAndClose() {
    setSubject('');
    setCategory('question');
    setPriority('medium');
    setDescription('');
    setError(null);
    setTicketId(null);
    closeSupportModal();
  }

  function handleSubmit() {
    setError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const result = await submitSupportTicketAction({ subject, category, priority, description, route: pathname ?? '' });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setTicketId(result.ticketId);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={resetAndClose}
    >
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {ticketId ? (
          <div className="flex flex-col gap-3">
            <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold">Ticket submitted</div>
            <h2 className="text-[15.5px] font-bold">Thanks — we&rsquo;ve got it.</h2>
            <p className="text-sm text-ink-muted">
              Reference <span className="font-mono text-ink">{ticketId}</span>. Our support team monitors tickets
              Monday&ndash;Friday, 8:00 AM&ndash;6:00 PM EST, and responds according to the priority you selected.
            </p>
            <div className="flex justify-end mt-2">
              <button type="button" className="btn-secondary !w-auto px-4 text-xs" onClick={resetAndClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-1">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">Support</div>
                <h2 className="text-[15.5px] font-bold">Contact Support</h2>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                aria-label="Close"
                className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            <div className="bg-surface-2 rounded-sm px-3 py-2.5 text-xs text-ink-faint flex flex-col gap-0.5 mb-4">
              <div>
                <span className="text-ink-muted">From:</span> {userName} {userEmail ? `(${userEmail})` : ''}
              </div>
              <div>
                <span className="text-ink-muted">Organization:</span> {organizationName}{' '}
                <span className="font-mono">({organizationId.slice(0, 8)}…)</span>
              </div>
              <div>
                <span className="text-ink-muted">Current page:</span> <span className="font-mono">{pathname || '/'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-ink-muted">Subject</span>
                <input
                  className="input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Short summary of the issue or question"
                  maxLength={200}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-ink-muted">Category</span>
                  <select className="input" value={category} onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}>
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-ink-muted">Priority</span>
                  <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}>
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-ink-faint -mt-1.5">
                {PRIORITY_OPTIONS.find((o) => o.value === priority)?.desc}
              </p>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-ink-muted">Description</span>
                <textarea
                  className="input min-h-[110px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect instead? Steps to reproduce, if applicable."
                  maxLength={5000}
                />
              </label>

              {error && <p className="text-critical text-xs">{error}</p>}

              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-[11px] text-ink-faint">Support Hours: Mon&ndash;Fri, 8:00 AM&ndash;6:00 PM EST.</p>
                <div className="flex gap-2">
                  <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={resetAndClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !subject.trim() || !description.trim()}
                    onClick={handleSubmit}
                    className={clsx('btn-secondary !w-auto px-5 text-xs', busy && 'opacity-60')}
                  >
                    {busy ? 'Submitting…' : 'Submit ticket'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
