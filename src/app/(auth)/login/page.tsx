'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/layout/AuthShell';

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.45 18.45 0 0 0 2 12s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      if (result?.error === 'AccessDenied') {
        setError('Single sign-on is required for your organization. Please sign in through your identity provider.');
        return;
      }
      if (result?.error) {
        setError('Invalid email or password.');
        return;
      }
      router.push('/launch');
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
          <div className="relative">
            <input
              className="input pr-10 w-full"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              title={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint hover:text-ink focus-visible:text-ink focus-visible:outline-none"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>
        {error && <p className="text-critical text-sm">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary mt-2">
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-ink-faint text-xs mt-6">
        No account yet?{' '}
        <Link href="/register" className="text-brand hover:brightness-110 font-semibold">
          Create an organization
        </Link>
      </p>
    </AuthShell>
  );
}
