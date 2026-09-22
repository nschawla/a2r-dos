/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * POST /api/assistant/ask
 *
 * Session-authenticated. Body: { "question": "<the executive's question>" }
 *
 * The Persona-Aware Executive Agent (src/lib/executive-agent.ts). Every
 * fact the model can cite comes from THIS signed-in user's own RBAC-scoped
 * Executive Action Triage + portfolio summary
 * (src/server/queries/executive-triage.ts) — the same scoping every other
 * portfolio view in the app uses, never a client-supplied scope. Margin
 * figures are omitted from the context entirely for a viewer who can't see
 * them (src/lib/security/masking.ts), the same masking boundary the rest
 * of the app enforces, rather than trusting the model to withhold them.
 *
 * Guards: 15 requests/minute per user (LLM calls cost real money), request
 * body capped at 4 KB, question capped at 500 characters. Requires
 * ANTHROPIC_API_KEY; without it the agent returns a clean 503.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrgContextOrNull } from '@/lib/session';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { rateLimitGuard, tooManyRequestsResponse } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';
import { captureException } from '@/lib/observability';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { getExecutiveTriage } from '@/server/queries/executive-triage';
import { loadDecisionContext } from '@/server/queries/decision-context';
import { getBlendedUtilization } from '@/server/queries/capacity';
import { canViewMargins } from '@/lib/security/masking';
import { personaForDeliveryRole, RBAC_MATRIX } from '@/lib/governance/rbacMatrix';
import { askExecutiveAgent, type AskAgentErrorCode, type AgentDecisionSummary } from '@/lib/executive-agent';

/** Dollar-bearing options — omitted from the agent's context for a viewer
 * who can't see margins, the same boundary canViewMargins already enforces
 * on the triage narrative's own `financialImpact` field below. Non-dollar
 * options (a resource swap in hours, a timeline ask, governance
 * remediation) carry no restricted figure and stay in either way. */
const DOLLAR_OPTION_KEYS = new Set(['change_order', 'margin_absorption']);

/** LLM round-trips can take a while — lift the platform's default. */
export const maxDuration = 30;

const MAX_BODY_BYTES = 4 * 1024;
const MAX_QUESTION_CHARS = 500;

const bodySchema = z.strictObject({
  question: z.string().trim().min(1, 'question is required').max(MAX_QUESTION_CHARS, `question must be ${MAX_QUESTION_CHARS} characters or fewer`),
});

const STATUS_BY_CODE: Record<AskAgentErrorCode, number> = {
  'not-configured': 503,
  'empty-question': 400,
  'question-too-long': 413,
  'model-error': 502,
  unparseable: 422,
};

function scopeDescriptionFor(deliveryRole: string): string {
  switch (deliveryRole) {
    case 'ADMIN':
    case 'VP_EXECUTIVE':
      return 'the full tenant portfolio';
    case 'PRACTICE_DIRECTOR':
      return 'your practice\'s engagements';
    case 'DELIVERY_MANAGER':
      return 'your delivery stream\'s engagements';
    case 'PROJECT_MANAGER':
      return 'your own assigned engagements';
    default:
      return 'your scoped engagements';
  }
}

export const POST = withRouteHandler('assistant-ask', async (request: Request) => {
  const blocked = await passwordRotationGate();
  if (blocked) return blocked;
  const context = await getOrgContextOrNull();
  if (!context) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // ── Per-user rate limit — LLM calls cost real money. ──
  const g = await rateLimitGuard(`assistant-ask:${context.userId}`, RATE_LIMITS.EXEC_AGENT);
  if (!g.allowed) {
    return tooManyRequestsResponse(
      g.result,
      `Rate limit exceeded (${RATE_LIMITS.EXEC_AGENT.limit} questions/minute). Retry in ${g.result.retryAfterSeconds}s.`
    );
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return NextResponse.json({ error: `Request body too large (${declared} bytes). Limit is ${MAX_BODY_BYTES} bytes.` }, { status: 413 });
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
      { error: 'Payload validation failed.', issues: parsedBody.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 422 }
    );
  }

  try {
    const { deliveryRole, governance, organizationName, organizationId } = context;
    const showMargins = canViewMargins(deliveryRole, governance);

    const [{ items: triage, portfolio, flagged }, util] = await Promise.all([
      getExecutiveTriage(context),
      getBlendedUtilization(organizationId),
    ]);
    const flaggedIds = new Set(triage.map((t) => t.projectId));
    const otherProjectNames = portfolio.projects.filter((p) => !flaggedIds.has(p.id)).map((p) => p.name);

    // PS Orchestration & Decision Engine — the same real options + domino
    // preview each item's Decision Card shows, so the agent can name and
    // guide toward them rather than inventing generic advice.
    const decisionContextMap = await loadDecisionContext(context, flagged);
    const decisions: AgentDecisionSummary[] = triage.map((item) => {
      const decision = decisionContextMap.get(item.projectId);
      const options = (decision?.options ?? [])
        .filter((o) => showMargins || !DOLLAR_OPTION_KEYS.has(o.key))
        .map((o) => ({ label: o.label, summary: o.summary }));
      return {
        projectId: item.projectId,
        options,
        lastIntervention: decision?.lastIntervention
          ? { optionLabel: decision.lastIntervention.optionLabel, when: decision.lastIntervention.createdAt }
          : null,
      };
    });

    const persona = RBAC_MATRIX[personaForDeliveryRole(deliveryRole)];

    const result = await askExecutiveAgent({
      question: parsedBody.data.question,
      persona: {
        personaLabel: persona.label,
        organizationName,
        scopeDescription: scopeDescriptionFor(deliveryRole),
      },
      portfolio: {
        projectCount: portfolio.summary.projectCount,
        totalValue: portfolio.summary.totalValue,
        avgMarginPct: showMargins && portfolio.summary.hasMargin ? portfolio.summary.avgMarginPct : null,
        highRiskCount: portfolio.summary.highRiskCount,
        utilizationPct: util.utilizationPct,
        attainmentPct: util.attainmentPct,
      },
      // A restricted viewer's context drops the $/margin figures the same
      // way every other view masks them — the model never sees what the
      // signed-in user can't.
      triage: showMargins ? triage : triage.map((t) => ({ ...t, financialImpact: t.financialImpact ? 'restricted' : null })),
      decisions,
      otherProjectNames,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: STATUS_BY_CODE[result.code] });
    }

    const res = NextResponse.json({ ok: true, answer: result.answer, citations: result.citations, model: result.model });
    for (const [k, v] of Object.entries(g.headers)) res.headers.set(k, v);
    return res;
  } catch (err) {
    captureException(err, { scope: 'api/assistant/ask', tenantId: context.organizationId, userId: context.userId });
    return NextResponse.json({ error: 'Internal error answering the question.' }, { status: 500 });
  }
});

export function GET() {
  return NextResponse.json({ error: 'Use POST to ask the Executive Agent.' }, { status: 405, headers: { Allow: 'POST' } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
