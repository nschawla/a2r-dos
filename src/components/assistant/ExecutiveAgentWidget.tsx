'use client';

/**
 * The Persona-Aware Executive Agent — a global floating widget/drawer
 * (docs/UI_DESIGN_SYSTEM.md §6) mounted once in the dashboard layout, so
 * it's reachable from every page. Talks to POST /api/assistant/ask
 * (src/app/api/assistant/ask/route.ts → src/lib/executive-agent.ts),
 * which does all the RBAC-scoping and grounding server-side — this
 * component only renders the conversation and forwards the question,
 * exactly like AiDocumentParser.tsx's relationship to /api/parse-document.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

interface AgentCitation {
  projectId: string;
  projectName: string;
  href: string;
}

interface AgentMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: AgentCitation[];
  error?: boolean;
}

interface AskResponse {
  ok: true;
  answer: string;
  citations: AgentCitation[];
  model: string;
}

const PROMPT_CHIPS = [
  'What needs my authority today?',
  'Why is my most at-risk engagement over budget?',
  'What are my options for fixing it?',
  'Show me the evidence / audit trail.',
];

export function ExecutiveAgentWidget({ personaLabel }: { personaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    startTransition(async () => {
      try {
        const res = await fetch('/api/assistant/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        });
        const body = (await res.json().catch(() => null)) as AskResponse | { error?: string; code?: string } | null;

        if (res.status === 503) {
          setNotConfigured(true);
          setMessages((m) => [
            ...m,
            { role: 'assistant', error: true, text: 'The Executive Agent isn’t configured on this environment yet — ask an admin to set ANTHROPIC_API_KEY.' },
          ]);
          return;
        }
        if (!res.ok || !body || !('ok' in body)) {
          const message =
            (body && 'error' in body && body.error) ||
            (res.status === 429
              ? 'You’ve asked several questions in quick succession — wait a moment and try again.'
              : `The agent request failed (HTTP ${res.status}).`);
          setMessages((m) => [...m, { role: 'assistant', error: true, text: message }]);
          return;
        }
        setMessages((m) => [...m, { role: 'assistant', text: body.answer, citations: body.citations }]);
      } catch {
        setMessages((m) => [...m, { role: 'assistant', error: true, text: 'Could not reach the Executive Agent — check your connection and try again.' }]);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close the Executive Agent' : 'Open the Executive Agent'}
        className="fixed bottom-6 right-6 z-[90] w-12 h-12 rounded-full bg-brand text-brand-fg shadow-elevated flex items-center justify-center hover:bg-brand/90 transition-colors print:hidden"
      >
        <SparkleIcon />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] print:hidden" role="dialog" aria-modal="true" aria-label="Executive Agent">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface-1 border-l border-border-soft shadow-elevated flex flex-col">
            <div className="border-b border-border px-6 py-4 flex items-start justify-between gap-4 flex-none">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Executive Agent</div>
                <h2 className="text-lg font-display font-bold">Ask about your portfolio</h2>
                <p className="text-[11.5px] text-ink-faint mt-0.5 truncate">Scoped to you — {personaLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
              {messages.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[12.5px] text-ink-muted mb-1">
                    Grounded in your own scoped portfolio — try one of these, or ask your own question.
                  </p>
                  {PROMPT_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => ask(c)}
                      disabled={notConfigured}
                      className="text-left text-[13px] rounded-lg border border-border-soft px-3.5 py-2.5 hover:border-brand/40 hover:bg-brand/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={clsx(
                    'max-w-[88%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed',
                    m.role === 'user'
                      ? 'self-end bg-brand text-brand-fg'
                      : m.error
                        ? 'self-start bg-critical-soft text-critical'
                        : 'self-start bg-surface-2 text-ink'
                  )}
                >
                  {m.text}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40 flex flex-col gap-1">
                      {m.citations.map((c) => (
                        <Link
                          key={c.projectId}
                          href={c.href}
                          onClick={() => setOpen(false)}
                          className="text-[11.5px] font-semibold text-brand hover:underline"
                        >
                          {c.projectName} →
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {pending && <div className="self-start text-[12px] text-ink-faint italic px-1">Thinking…</div>}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="border-t border-border px-4 py-3 flex items-center gap-2 flex-none"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={pending || notConfigured}
                placeholder={notConfigured ? 'Not configured on this environment' : 'Ask about your portfolio…'}
                className="input !py-2 text-[13px] disabled:opacity-50"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={pending || !input.trim() || notConfigured}
                className="btn-primary !w-auto px-4 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Ask
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="w-5 h-5">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}
