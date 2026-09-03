'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createOrganizationForCurrentUser } from '@/server/actions/auth';

export function OnboardingForm() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createOrganizationForCurrentUser({ orgName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/launch');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Organization name</span>
        <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
      </label>
      {error && <p className="text-critical text-sm">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary mt-2">
        {submitting ? 'Creating…' : 'Create organization'}
      </button>
    </form>
  );
}
