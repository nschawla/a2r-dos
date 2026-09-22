/**
 * Unit tests for the Persona-Aware Executive Agent (src/lib/executive-agent.ts).
 * The prompt builders are pure and fully covered directly; `askExecutiveAgent`
 * itself is covered two ways — its fast-fail branches (no network call at
 * all) directly, and its happy/grounding path via an injected fake
 * Anthropic client (the same `options.client` seam ai-parser.ts's own
 * tests would use), so the tool-response validation and citation-grounding
 * logic are exercised without a real API key or network call.
 *
 * Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  extractAgentToolInput,
  askExecutiveAgent,
  ASK_AGENT_TOOL,
  type AgentPersonaContext,
  type AgentPortfolioContext,
  type AgentDecisionSummary,
  type AskAgentInput,
} from '../src/lib/executive-agent';
import type { TriageItem } from '../src/lib/executive-triage';

const persona: AgentPersonaContext = {
  personaLabel: 'Project Manager',
  organizationName: 'Acme Health',
  scopeDescription: 'your own assigned engagements',
};

const portfolio: AgentPortfolioContext = {
  projectCount: 4,
  totalValue: 1_200_000,
  avgMarginPct: 32.5,
  highRiskCount: 1,
  utilizationPct: 0.82,
  attainmentPct: 0.95,
};

const triageItem: TriageItem = {
  projectId: 'proj-1',
  projectName: 'Claims Automation Pilot',
  drivers: ['Over Budget'],
  cause: 'Vendor scope creep on the bill-pay module.',
  financialImpact: '$45,000 over budget',
  scheduleImpact: null,
  ownerName: 'Sarah M.',
  deadline: '2026-09-20T00:00:00.000Z',
  overdue: false,
  requiredAction: 'Approve a budget adjustment.',
  driverHref: '/raid/proj-1',
  lastUpdated: '2026-09-15T00:00:00.000Z',
};

const decisionSummary: AgentDecisionSummary = {
  projectId: 'proj-1',
  options: [
    { label: 'Generate Change Order Draft', summary: 'Draft a change order to recover $45,000 from the client.' },
    { label: 'Internal Margin Absorption', summary: 'Absorb $45,000 into delivery margin.' },
  ],
  lastIntervention: null,
};

function baseInput(overrides: Partial<AskAgentInput> = {}): AskAgentInput {
  return {
    question: 'Why is Claims Automation Pilot over budget?',
    persona,
    portfolio,
    triage: [triageItem],
    decisions: [decisionSummary],
    otherProjectNames: ['Field Service Mobile App'],
    ...overrides,
  };
}

describe('buildAgentSystemPrompt', () => {
  it('names the organization, the persona, and its scope', () => {
    const prompt = buildAgentSystemPrompt(persona);
    expect(prompt).toContain('Acme Health');
    expect(prompt).toContain('Project Manager');
    expect(prompt).toContain('your own assigned engagements');
  });

  it('instructs the model to answer only from context and never invent facts', () => {
    const prompt = buildAgentSystemPrompt(persona);
    expect(prompt).toMatch(/only from the CONTEXT/i);
    expect(prompt).toMatch(/never invent/i);
  });
});

describe('buildAgentUserPrompt', () => {
  it('includes the portfolio headline figures', () => {
    const prompt = buildAgentUserPrompt(baseInput());
    expect(prompt).toContain('4 engagement(s)');
    expect(prompt).toContain('$1,200,000');
    expect(prompt).toContain('32.5%');
  });

  it('masks the margin figure when the caller passed null (restricted viewer)', () => {
    const prompt = buildAgentUserPrompt(baseInput({ portfolio: { ...portfolio, avgMarginPct: null } }));
    expect(prompt).toContain('restricted');
    expect(prompt).not.toContain('32.5%');
  });

  it('includes every triage item\'s cause, impact, owner, deadline, and required action', () => {
    const prompt = buildAgentUserPrompt(baseInput());
    expect(prompt).toContain('Claims Automation Pilot (id: proj-1)');
    expect(prompt).toContain('Vendor scope creep on the bill-pay module.');
    expect(prompt).toContain('$45,000 over budget');
    expect(prompt).toContain('Sarah M.');
    expect(prompt).toContain('Approve a budget adjustment.');
  });

  it('names a flagged item\'s real decision options when it has none applied yet', () => {
    const prompt = buildAgentUserPrompt(baseInput());
    expect(prompt).toContain('Generate Change Order Draft');
    expect(prompt).toContain('Internal Margin Absorption');
  });

  it('states an already-decided item\'s outcome instead of its options', () => {
    const decided: AgentDecisionSummary = {
      ...decisionSummary,
      lastIntervention: { optionLabel: 'Generate Change Order Draft', when: '2026-09-16T00:00:00.000Z' },
    };
    const prompt = buildAgentUserPrompt(baseInput({ decisions: [decided] }));
    expect(prompt).toMatch(/Already decided.*Generate Change Order Draft/);
  });

  it('counts flagged-but-undecided items into a pending-authority headline', () => {
    const prompt = buildAgentUserPrompt(baseInput());
    expect(prompt).toContain('1 decision(s) currently require your authority');
  });

  it('does not count an already-decided item toward the pending-authority headline', () => {
    const decided: AgentDecisionSummary = {
      ...decisionSummary,
      lastIntervention: { optionLabel: 'Generate Change Order Draft', when: '2026-09-16T00:00:00.000Z' },
    };
    const prompt = buildAgentUserPrompt(baseInput({ decisions: [decided] }));
    expect(prompt).toContain('0 decision(s) currently require your authority');
  });

  it('lists other in-scope engagements so a question about a healthy project is still grounded', () => {
    const prompt = buildAgentUserPrompt(baseInput());
    expect(prompt).toContain('Field Service Mobile App');
  });

  it('says plainly when nothing is flagged', () => {
    const prompt = buildAgentUserPrompt(baseInput({ triage: [] }));
    expect(prompt).toMatch(/No engagement in scope is currently Red or over budget/);
  });

  it('appends the literal question last', () => {
    const prompt = buildAgentUserPrompt(baseInput({ question: 'What needs my attention today?' }));
    expect(prompt.trim().endsWith('What needs my attention today?')).toBe(true);
  });
});

describe('askExecutiveAgent — fast-fail branches (no network call)', () => {
  it('refuses an empty question', async () => {
    const result = await askExecutiveAgent(baseInput({ question: '   ' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('empty-question');
  });

  it('refuses a question over the character limit', async () => {
    const result = await askExecutiveAgent(baseInput({ question: 'x'.repeat(501) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('question-too-long');
  });

  it('reports not-configured when no client is injected and ANTHROPIC_API_KEY is unset', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await askExecutiveAgent(baseInput());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('not-configured');
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});

describe('askExecutiveAgent — happy path + grounding (injected fake client)', () => {
  // Only `.messages.create` is ever called (askExecutiveAgent's own type
  // is `Pick<Anthropic, 'messages'>`, but that still names the SDK's full
  // `Messages` class as the property's type) — cast the minimal fake past
  // that rather than stubbing every unused method on the real class.
  function fakeClient(toolInput: unknown): Pick<Anthropic, 'messages'> {
    return {
      messages: {
        create: async () => ({
          content: [{ type: 'tool_use' as const, id: 't1', name: ASK_AGENT_TOOL.name, input: toolInput }],
          stop_reason: 'tool_use' as const,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      },
    } as unknown as Pick<Anthropic, 'messages'>;
  }

  it('returns the answer and resolves a valid citation to its real triage href', async () => {
    const client = fakeClient({
      answer: 'It is $45,000 over budget due to vendor scope creep on the bill-pay module.',
      citations: [{ projectId: 'proj-1' }],
    });
    const result = await askExecutiveAgent(baseInput(), { client });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answer).toContain('$45,000');
      expect(result.citations).toEqual([{ projectId: 'proj-1', projectName: 'Claims Automation Pilot', href: '/raid/proj-1' }]);
    }
  });

  it('drops a citation to a project id the model was never given, rather than trusting it', async () => {
    const client = fakeClient({
      answer: 'Some answer.',
      citations: [{ projectId: 'not-in-context' }],
    });
    const result = await askExecutiveAgent(baseInput(), { client });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.citations).toEqual([]);
  });

  it('fails cleanly when the model returns no tool_use block', async () => {
    const client = {
      messages: {
        create: async () => ({ content: [{ type: 'text' as const, text: 'oops' }], stop_reason: 'end_turn' as const, usage: { input_tokens: 1, output_tokens: 1 } }),
      },
    } as unknown as Pick<Anthropic, 'messages'>;
    const result = await askExecutiveAgent(baseInput(), { client });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unparseable');
  });

  it('fails cleanly when the tool input does not match the expected schema', async () => {
    const client = fakeClient({ answer: '', citations: [] }); // empty answer fails z.string().min(1)
    const result = await askExecutiveAgent(baseInput(), { client });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unparseable');
  });
});

describe('extractAgentToolInput', () => {
  it('pulls the forced tool call input off a model message', () => {
    const message = {
      content: [{ type: 'tool_use' as const, id: 't1', name: ASK_AGENT_TOOL.name, input: { answer: 'x', citations: [] } }],
    } as unknown as Parameters<typeof extractAgentToolInput>[0];
    expect(extractAgentToolInput(message)).toEqual({ answer: 'x', citations: [] });
  });

  it('returns null when there is no matching tool_use block', () => {
    const message = { content: [{ type: 'text' as const, text: 'hi' }] } as unknown as Parameters<typeof extractAgentToolInput>[0];
    expect(extractAgentToolInput(message)).toBeNull();
  });
});
