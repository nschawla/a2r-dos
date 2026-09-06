/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 */

'use server';

import { withAction } from '@/lib/observability/action-wrapper';

/**
 * WP8 — in-app Support & Ticket Submission.
 *
 * Identity fields (name/email/organization) are deliberately NEVER trusted
 * from the client payload — the same rule every other server action in
 * this app follows (see src/lib/session.ts's own doc comment: "the active
 * org id here always comes from a membership the session actually
 * holds"). `SupportTicketModal.tsx` displays those fields as read-only
 * auto-populated context so the user can see what will be sent, but
 * `submitSupportTicketAction` re-resolves all of it itself via
 * `requireOrgContext()`. Only the free-text ticket fields (subject,
 * category, priority, description) and the current route — which the
 * server genuinely cannot know on its own — come from the client.
 *
 * "Structured logging" here (rather than a new SupportTicket table) is a
 * deliberate, literal reading of the WP8 spec: this sandbox has no
 * ticketing-system integration to call (no npm registry access — see the
 * README's environment note — and no real Zendesk/Jira/Freshdesk account
 * to wire up), so the server action's job is to validate, resolve real
 * identity, generate a stable ticket reference, and emit one structured
 * log line a real deployment's log pipeline would forward to whatever
 * ticketing system it actually uses. Swapping this for a `db.supportTicket
 * .create(...)` call or an outbound webhook later is a one-function change
 * — every caller only depends on the {ok, ticketId} contract.
 */
import { z } from 'zod';
import { requireOrgContext } from '@/lib/session';

export type SupportTicketCategory = 'bug' | 'question' | 'feature_request' | 'billing' | 'other';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SubmitSupportTicketResult = { ok: true; ticketId: string } | { ok: false; error: string };

const submitSchema = z.object({
  subject: z.string().trim().min(3, 'Give the ticket a short subject (at least 3 characters).').max(200),
  category: z.enum(['bug', 'question', 'feature_request', 'billing', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  description: z.string().trim().min(10, 'Describe the issue in a bit more detail (at least 10 characters).').max(5000),
  /** The route the user was on when they opened the modal
   * (`usePathname()` client-side) — purely descriptive telemetry to help
   * support reproduce the issue; never used for authorization. */
  route: z.string().max(500).optional().or(z.literal('')),
});

/** Short, sortable, human-readable-enough reference: SUP-<base36 timestamp>-<4 random chars>,
 * uppercased. No DB round-trip needed to mint it (there's no table to
 * collide against), and the timestamp component makes it naturally
 * chronological in a log stream. */
function generateTicketId(): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUP-${time}-${rand}`;
}

export const submitSupportTicketAction = withAction('submitSupportTicketAction', async (input: unknown): Promise<SubmitSupportTicketResult> => {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid ticket.' };
  const { subject, category, priority, description, route } = parsed.data;

  // Real identity, resolved server-side — never trusts a client-supplied
  // name/email/org. Redirects to /login if somehow called while
  // unauthenticated, which is fine: the modal that calls this only ever
  // renders inside the authenticated dashboard shell.
  const context = await requireOrgContext();

  const ticketId = generateTicketId();

  const logEntry = {
    event: 'SUPPORT_TICKET_SUBMITTED',
    ticketId,
    submittedAt: new Date().toISOString(),
    priority,
    category,
    subject,
    description,
    route: route || null,
    requester: {
      userId: context.userId,
      name: context.session.user.name ?? null,
      email: context.session.user.email ?? null,
      deliveryRole: context.deliveryRole,
    },
    organization: {
      id: context.organizationId,
      name: context.organizationName,
    },
  };

  // Structured, single-line JSON so a real log pipeline (CloudWatch,
  // Datadog, etc.) can parse and forward this to an actual ticketing
  // system without any code change here — see the file doc comment.
  console.log(`[SUPPORT_TICKET] ${JSON.stringify(logEntry)}`);

  return { ok: true, ticketId };
});
