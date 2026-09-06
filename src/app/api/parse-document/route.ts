/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * POST /api/parse-document
 *
 * Session-authenticated (cookie — gated by src/middleware.ts like every
 * other in-app API route). Body:
 *
 *   { "text": "<the document>", "weekEnding"?: "YYYY-MM-DD" }
 *
 * Runs the document through the AI parser (src/lib/ai-parser.ts) and
 * returns a REVIEWABLE DRAFT: the structured digest plus `rows` already
 * shaped for the "Status Reports & RAID Log" pill of the Self-Service
 * Batch Import Engine. This endpoint writes nothing — the user pastes the
 * rows into the batch importer, which re-validates every one of them
 * server-side against this tenant's live projects and roster before
 * anything is committed or ledgered.
 *
 * Guards: 10 requests / minute per user (LLM calls are costly), request
 * body capped at 200 KB, document text capped at 50,000 characters.
 * GET / OPTIONS → 405.
 *
 * Requires ANTHROPIC_API_KEY in the environment; without it the parser
 * returns a clean 503 rather than erroring.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getOrgContextOrNull } from '@/lib/session';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { getScopedProjectWhere } from '@/lib/scoping';
import { hit, tooManyRequestsResponse } from '@/lib/rate-limiter';
import { captureException } from '@/lib/observability';
import {
  parseDeliveryDocument,
  toStatusRaidRows,
  MAX_INPUT_CHARS,
  type ParseErrorCode,
} from '@/lib/ai-parser';

/** LLM round-trips can take a while — lift the platform's default. */
export const maxDuration = 30;

const MAX_BODY_BYTES = 200 * 1024;
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };
/** Cap the project hint list we hand the model. */
const MAX_PROJECT_HINTS = 500;

const bodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'text is required')
    .max(MAX_INPUT_CHARS, `text must be ${MAX_INPUT_CHARS.toLocaleString()} characters or fewer`),
  weekEnding: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekEnding must be an ISO date (YYYY-MM-DD)')
    .optional(),
});

/** Parser failure codes → HTTP status. */
const STATUS_BY_CODE: Record<ParseErrorCode, number> = {
  'not-configured': 503,
  'empty-input': 400,
  'input-too-large': 413,
  'model-error': 502,
  unparseable: 422,
};

export async function POST(request: Request) {
  const blocked = await passwordRotationGate();
  if (blocked) return blocked;
  const context = await getOrgContextOrNull();
  if (!context) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // ── Per-user rate limit — LLM calls cost real money. ──
  const rl = hit(`parse-document:${context.userId}`, RATE_LIMIT);
  if (!rl.ok) {
    return tooManyRequestsResponse(
      rl,
      `Rate limit exceeded (${RATE_LIMIT.limit} document parses/minute). Retry in ${rl.retryAfterSeconds}s.`,
    );
  }

  // ── Body-size guard — bail before request.json() buffers anything big. ──
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `Request body too large (${declared} bytes). Limit is ${MAX_BODY_BYTES} bytes.` },
        { status: 413 },
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'Payload validation failed.',
        issues: parsedBody.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 422 },
    );
  }

  try {
    // Hand the model the engagements this user can actually see — a PM
    // gets only their own, a Practice Director only their practice — the
    // same scoping every portfolio view uses (src/lib/scoping.ts).
    const projects = await db.project.findMany({
      where: await getScopedProjectWhere(context),
      select: { externalId: true, name: true },
      take: MAX_PROJECT_HINTS,
      orderBy: { name: 'asc' },
    });

    const result = await parseDeliveryDocument({
      text: parsedBody.data.text,
      knownProjects: projects.map((p) => ({ code: p.externalId, name: p.name })),
      defaultWeekEnding: parsedBody.data.weekEnding ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: STATUS_BY_CODE[result.code] },
      );
    }

    return NextResponse.json({
      ok: true,
      digest: result.data,
      rows: toStatusRaidRows(result.data),
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    captureException(err, {
      scope: 'api/parse-document',
      tenantId: context.organizationId,
      userId: context.userId,
    });
    return NextResponse.json({ error: 'Internal error parsing the document.' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json(
    { error: 'Use POST to parse a document.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
