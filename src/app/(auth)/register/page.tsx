'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerOrganization } from '@/server/actions/auth';
import { AuthShell } from '@/components/layout/AuthShell';

export default function RegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await registerOrganization({ orgName, name, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const signInResult = await signIn('credentials', { redirect: false, email, password });
      if (signInResult?.error) {
        setError('Account created — please sign in.');
        router.push('/login');
        return;
      }
      router.push('/launch');
      router.refresh();
    } catch {
      setError('Couldn’t complete sign-up. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Set up A2R Delivery OS™"
      subtitle="Creates your organization with a starter practice roster and rate card."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Organization name">
          <input
            className="input"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Consulting"
            required
          />
        </Field>
        <Field label="Your name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acme.com"
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </Field>
        {error && <p className="text-critical text-sm">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary mt-2">
          {submitting ? 'Creating…' : 'Create organization'}
        </button>
      </form>
      <p className="text-ink-faint text-xs mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-brand hover:brightness-110 font-semibold">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
