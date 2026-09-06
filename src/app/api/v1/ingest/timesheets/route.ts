/**
 * Secure Data Ingestion API Bridge — bulk timesheet ingestion.
 *
 *   POST /api/v1/ingest/timesheets
 *   Authorization: Bearer a2r_live_…
 *   Content-Type: application/json
 *   Body: [{ "projectId", "resourceId", "hours", "date": "YYYY-MM-DD" }, …]
 *         (or { "timesheets": [ … ] })
 *
 * Every write is locked to the tenant the API key is scoped to. Raw
 * records land in TimesheetEntry AND are rolled into the matching
 * WeeklyAssignmentSlot.actualHours so they flow straight into the EAC /
 * burn-curve / capacity engine. On success an API_BULK_INGEST event is
 * written to that tenant's Immutable Audit Ledger.
 *
 * CORS posture (SEC-3): this is a **server-to-server** endpoint,
 * authenticated by a Bearer API key that must never live in a browser.
 * It sends no `Access-Control-Allow-Origin`, so a cross-origin browser
 * `fetch` fails its preflight / is blocked from reading the response.
 * `OPTIONS` returns 405. Integrations call it from their own backend.
 *
 * Body limits (SEC-3): the request must carry a `Content-Length`
 * (411 otherwise) and it must be ≤ 256 KB (413 otherwise) — checked
 * before `request.json()` buffers anything. The payload is additionally
 * capped at 2000 entries by the schema.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withTenantTx } from '@/lib/db/with-tenant-tx';
import { withApiAuth } from '@/lib/api-auth';
import { mondayOf } from '@/lib/capacity-engine';
import { recordLedgerEvent } from '@/lib/audit-ledger';

/** Max accepted request body. 2000 entries of ~100 bytes each ≈ 200 KB. */
const MAX_BODY_BYTES = 256 * 1024;

const timesheetEntrySchema = z.strictObject({
  projectId: z.string().min(1, 'projectId is required'),
  resourceId: z.string().min(1, 'resourceId is required'),
  hours: z.number().finite().positive('hours must be > 0').max(24, 'hours cannot exceed 24 in a day'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

const payloadSchema = z.union([
  z.array(timesheetEntrySchema).min(1).max(2000),
  z.strictObject({ timesheets: z.array(timesheetEntrySchema).min(1).max(2000) }).transform((v) => v.timesheets),
]);

export const POST = withApiAuth(async (request, { tenantId, apiKey }) => {
  // ── Body-size guard (SEC-3): bail before request.json() buffers a
  // multi-MB payload. A JSON body without Content-Length is rejected
  // rather than read blindly.
  const contentLength = request.headers.get('content-length');
  if (contentLength === null) {
    return NextResponse.json(
      { error: 'A Content-Length header is required.' },
      { status: 411 }
    );
  }
  const declaredBytes = Number(contentLength);
  if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
    return NextResponse.json({ error: 'Invalid Content-Length header.' }, { status: 400 });
  }
  if (declaredBytes > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: `Request body too large (${declaredBytes} bytes). Limit is ${MAX_BODY_BYTES} bytes; split the batch (max 2000 entries per request).`,
      },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Payload validation failed.',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 422 }
    );
  }
  const entries = parsed.data;

  // ── Tenant isolation: every projectId / resourceId must belong to this
  // tenant. Reject the whole batch if any reference is foreign or unknown.
  const projectIds = [...new Set(entries.map((e) => e.projectId))];
  const resourceIds = [...new Set(entries.map((e) => e.resourceId))];
  const [validProjects, validResources] = await Promise.all([
    db.project.findMany({ where: { id: { in: projectIds }, organizationId: tenantId }, select: { id: true } }),
    db.resource.findMany({ where: { id: { in: resourceIds }, organizationId: tenantId }, select: { id: true } }),
  ]);
  const okProjects = new Set(validProjects.map((p) => p.id));
  const okResources = new Set(validResources.map((r) => r.id));

  const unknownProjects = projectIds.filter((id) => !okProjects.has(id));
  const unknownResources = resourceIds.filter((id) => !okResources.has(id));
  if (unknownProjects.length > 0 || unknownResources.length > 0) {
    return NextResponse.json(
      {
        error: 'One or more projectId / resourceId values are not in this tenant.',
        unknownProjects,
        unknownResources,
      },
      { status: 400 }
    );
  }

  // ── Aggregate into weekly slots (resource × project × ISO-week Monday).
  // Parse the calendar date at local midnight so the week bucket lines up
  // with mondayOf() / the seeded WeeklyAssignmentSlot grid (both local-time).
  const localMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00`);
  const weekly = new Map<string, { resourceId: string; projectId: string; weekDate: Date; hours: number }>();
  for (const e of entries) {
    const weekDate = mondayOf(localMidnight(e.date));
    const key = `${e.resourceId}|${e.projectId}|${weekDate.toISOString()}`;
    const acc = weekly.get(key) ?? { resourceId: e.resourceId, projectId: e.projectId, weekDate, hours: 0 };
    acc.hours += e.hours;
    weekly.set(key, acc);
  }

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);

  await withTenantTx(async (tx) => {
    await tx.timesheetEntry.createMany({
      data: entries.map((e) => ({
        organizationId: tenantId,
        projectId: e.projectId,
        resourceId: e.resourceId,
        hours: e.hours,
        workDate: new Date(`${e.date}T00:00:00.000Z`), // the calendar day, stored as UTC-midnight marker
        source: 'api',
        apiKeyId: apiKey.apiKeyId,
      })),
    });

    for (const w of weekly.values()) {
      await tx.weeklyAssignmentSlot.upsert({
        where: {
          resourceId_projectId_weekDate: { resourceId: w.resourceId, projectId: w.projectId, weekDate: w.weekDate },
        },
        update: { actualHours: { increment: w.hours } },
        create: {
          organizationId: tenantId,
          resourceId: w.resourceId,
          projectId: w.projectId,
          weekDate: w.weekDate,
          actualHours: w.hours,
        },
      });
    }

    // Automated feed into the tenant's Active Stream / recent-activity —
    // an API ingest surfaces without anyone typing it in.
    await tx.activityLogEntry.create({
      data: {
        organizationId: tenantId,
        text: `Ingested ${entries.length} timesheet ${entries.length === 1 ? 'record' : 'records'} (${totalHours}h) via ${apiKey.apiKeyName}`,
        tab: 'home',
      },
    });

    await recordLedgerEvent(tx, {
      organizationId: tenantId,
      actorId: `apikey:${apiKey.apiKeyId}`,
      actionType: 'API_BULK_INGEST',
      targetResource: `Organization:${tenantId}`,
      metadata: {
        channel: 'api/v1/ingest/timesheets',
        apiKeyId: apiKey.apiKeyId,
        apiKeyName: apiKey.apiKeyName,
        keyPrefix: apiKey.keyPrefix,
        entryCount: entries.length,
        totalHours,
        distinctProjects: projectIds.length,
        distinctResources: resourceIds.length,
        weeklySlotsTouched: weekly.size,
      },
    });
  });

  return NextResponse.json(
    {
      ok: true,
      ingested: entries.length,
      totalHours,
      weeklySlotsUpdated: weekly.size,
      tenantId,
    },
    { status: 201 }
  );
});

/** Anything other than POST → 405. */
export function GET() {
  return NextResponse.json({ error: 'Use POST to ingest timesheets.' }, { status: 405, headers: { Allow: 'POST' } });
}

/**
 * No CORS preflight support — this is a server-to-server API (see the file
 * header). A browser cross-origin request gets no `Access-Control-*`
 * headers and cannot proceed.
 */
export function OPTIONS() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
