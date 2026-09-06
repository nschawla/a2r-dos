/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 */

'use server';

import { withAction } from '@/lib/observability/action-wrapper';

/**
 * Early-access lead capture for the public "Coming Soon" landing page
 * (src/app/page.tsx). Unauthenticated by design — anyone can register
 * interest.
 *
 * Same "structured logging, not a table" approach as
 * src/server/actions/support.ts: this sandbox has no CRM / marketing
 * automation to POST to, so the action's job is to validate, rate-limit,
 * drop obvious bots, mint a stable reference, and emit ONE structured
 * `[EARLY_ACCESS_LEAD]` log line a real deployment's pipeline forwards to
 * HubSpot / Salesforce / a Slack webhook / an inbox. Swapping the
 * `console.log` for a `db.earlyAccessLead.create(...)` or an outbound
 * fetch is a one-line change — every caller only depends on the
 * `{ ok, ref }` contract.
 *
 * ⚠️ Until that swap happens, a submitted lead lives ONLY in the server
 * log. Wire real persistence before relying on this for a real campaign.
 */
import { headers } from 'next/headers';
import { z } from 'zod';
import { hitDistributed } from '@/lib/rate-limiter-redis';
import { captureException } from '@/lib/observability';

export type SubmitEarlyAccessResult = { ok: true; ref: string } | { ok: false; error: string };

const submitSchema = z.strictObject({
  fullName: z.string().trim().min(2, 'Please enter your full name.').max(120),
  organization: z.string().trim().min(2, 'Please enter your organization.').max(160),
  workEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid work email address.')
    .max(200),
  phone: z
    .string()
    .trim()
    .min(7, 'Please enter a phone number we can reach you on.')
    .max(40)
    .regex(/^[+()\-\s\d.]+$/, 'Phone number can only contain digits and + ( ) - . spaces.'),
  /** Honeypot — a real person never fills this (it's visually hidden and
   * `autocomplete="off"`); a bot that auto-fills every field does. */
  company_website: z.string().max(0).optional().or(z.literal('')).or(z.undefined()),
});

/** WAIT-<base36 timestamp>-<4 random> — chronological in a log stream,
 * no DB round-trip needed to mint it. */
function generateRef(): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WAIT-${time}-${rand}`;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
}

export const submitEarlyAccessLead = withAction('submitEarlyAccessLead', async (input: unknown): Promise<SubmitEarlyAccessResult> => {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' };
  }

  // Bot caught by the honeypot — pretend it worked, log nothing.
  if (parsed.data.company_website) {
    return { ok: true, ref: generateRef() };
  }

  // 5 submissions / 10 min per IP — generous for a real person, a wall
  // for a script.
  const ip = await clientIp();
  const rl = await hitDistributed(`early-access:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) {
    return {
      ok: false,
      error: `You’ve submitted a few times already — try again in ${Math.ceil(rl.retryAfterSeconds / 60)} minute(s), or email hello@a2rventures.com.`,
    };
  }

  const { fullName, organization, workEmail, phone } = parsed.data;
  const ref = generateRef();

  const logEntry = {
    event: 'EARLY_ACCESS_LEAD',
    ref,
    submittedAt: new Date().toISOString(),
    fullName,
    organization,
    workEmail,
    phone,
    sourceIp: ip,
  };

  try {
    // Structured single-line JSON — a real log pipeline forwards this to
    // the CRM / marketing tool without any code change here.
    // eslint-disable-next-line no-console
    console.log(`[EARLY_ACCESS_LEAD] ${JSON.stringify(logEntry)}`);
  } catch (err) {
    captureException(err, { scope: 'early-access', ref });
    return { ok: false, error: 'Something went wrong on our end. Please try again in a moment.' };
  }

  return { ok: true, ref };
});
