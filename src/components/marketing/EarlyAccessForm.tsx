'use client';

/**
 * Early-access lead-capture form for the public "Coming Soon" landing
 * page (src/app/page.tsx). Dark-themed, self-contained. Posts to
 * `submitEarlyAccessLead` (src/server/actions/early-access.ts) and swaps
 * to a confirmation state on success.
 */
import { useState, useTransition } from 'react';
import { submitEarlyAccessLead } from '@/server/actions/early-access';

type Field = 'fullName' | 'organization' | 'workEmail' | 'phone';

const FIELDS: { name: Field; label: string; type: string; placeholder: string; autoComplete: string }[] = [
  { name: 'fullName', label: 'Full name', type: 'text', placeholder: 'Jordan Alvarez', autoComplete: 'name' },
  { name: 'organization', label: 'Organization', type: 'text', placeholder: 'Northwind Advisory', autoComplete: 'organization' },
  { name: 'workEmail', label: 'Work email', type: 'email', placeholder: 'jordan@northwind.com', autoComplete: 'email' },
  { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '+1 (555) 010-4477', autoComplete: 'tel' },
];

const EMPTY: Record<Field, string> = { fullName: '', organization: '', workEmail: '', phone: '' };

export function EarlyAccessForm() {
  const [values, setValues] = useState<Record<Field, string>>(EMPTY);
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const complete = FIELDS.every((f) => values[f.name].trim().length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const result = await submitEarlyAccessLead({ ...values, company_website: honeypot });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setRef(result.ref);
      } catch {
        setError('We couldn’t reach the server. Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    });
  }

  if (ref) {
    return (
      <div className="rounded-xl border border-[#2A3A5C] bg-[#111A2E] p-7 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#1B3358]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#6BA5FF]" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-display text-[18px] font-bold text-white">You’re on the list.</h3>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-[#AEB7CC]">
          We’ll be in touch as early-access spots open up. Your reference is{' '}
          <span className="font-mono text-[#E4E9F5]">{ref}</span>.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#243350] bg-[#0F1830] p-6 sm:p-7"
      noValidate
    >
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6BA5FF]">
        Request early access
      </div>
      <h3 className="font-display text-[19px] font-bold text-white">Get on the early-access list</h3>
      <p className="mt-1.5 text-[13px] text-[#95A0BB]">
        Tell us where to reach you. We onboard organizations in small cohorts.
      </p>

      <div className="mt-5 flex flex-col gap-3.5">
        {FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#AEB7CC]">{f.label}</span>
            <input
              type={f.type}
              inputMode={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}
              autoComplete={f.autoComplete}
              required
              placeholder={f.placeholder}
              value={values[f.name]}
              disabled={busy}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="w-full rounded-md border border-[#2A3A5C] bg-[#0A1224] px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#5A6683] outline-none transition-colors focus:border-[#4C8DFF] focus:ring-2 focus:ring-[#4C8DFF]/25 disabled:opacity-60"
            />
          </label>
        ))}

        {/* Honeypot — hidden from real users, catches naive bots. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Company website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-[#FF8A8A]">{error}</p>}

      <button
        type="submit"
        disabled={busy || !complete}
        className="mt-5 w-full rounded-md bg-[#2563EB] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? 'Submitting…' : 'Request early access'}
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-[#5A6683]">
        By submitting, you agree to be contacted about A2R DOS early access. See our{' '}
        <a href="/privacy" className="text-[#8CA9DB] hover:text-white">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
