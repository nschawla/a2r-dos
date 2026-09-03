'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/layout/AuthShell';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn('credentials', { redirect: false, email, password });
      if (result?.status === 429) {
        setError(result.error || 'Too many sign-in attempts. Please wait a minute and try again.');
        return;
      }
      if (result?.error) {
        setError('Invalid email or password.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Couldn’t reach the sign-in service. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to A2R Delivery OS™"
      subtitle="Delivery Operating System for Professional Services organizations."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-critical text-sm">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary mt-2">
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-ink-faint text-xs mt-6">
        No account yet?{' '}
        <Link href="/register" className="text-brand-hi hover:brightness-110 font-semibold">
          Create an organization
        </Link>
      </p>
    </AuthShell>
  );
}
