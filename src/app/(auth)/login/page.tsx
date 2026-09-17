'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/layout/AuthShell';

/** ?ssoError=<code> — set by /api/auth/saml/{login,acs} redirects back here.
 * Deliberately generic for the pre-flight lookup codes (matches
 * initiateSamlLogin's own vagueness about which domains are federated);
 * specific for a genuine post-handshake failure, whose full detail is
 * already in the tenant's Ops Console sign-in failure log. */
const SSO_ERROR_MESSAGE: Record<string, string> = {
  'not-configured': 'Single sign-on is not configured for that email address.',
  'invalid-email': 'Enter a valid email address to sign in with SSO.',
  'invalid-signature': 'Your identity provider’s response could not be verified. Please try again or contact your administrator.',
  expired: 'That sign-in attempt expired before it completed. Please try again.',
  replay: 'That sign-in link was already used. Please start a new sign-in.',
  'issuer-mismatch': 'Your identity provider’s response did not match this organization’s configuration. Contact your administrator.',
  disabled: 'Single sign-on is not currently enabled for your organization. Contact your administrator.',
  'access-denied': 'Your account is not provisioned for this workspace. Contact your administrator.',
  malformed: 'Your identity provider’s response could not be read. Contact your administrator.',
  session: 'Your identity was verified, but we couldn’t start your session. Please try signing in with your password.',
  failed: 'Single sign-on failed. Please try again or contact your administrator.',
};

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
  return (
    <Suspense
      fallback={
        <AuthShell title="Sign in to PS-DOS" subtitle="Loading">
          <div />
        </AuthShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True once a signal says this email's domain needs SSO — either a
  // credentials attempt came back AccessDenied, or the login page was
  // reached via a redirect from a prior SSO attempt. Shows the "Continue
  // with SSO" button instead of (not in addition to) hiding the password
  // form, since a tenant admin/A2R staff account on the same domain may
  // still need password login even when the domain has SSO configured.
  const [ssoAvailable, setSsoAvailable] = useState(false);
  const [ssoRedirecting, setSsoRedirecting] = useState(false);

  useEffect(() => {
    const code = searchParams.get('ssoError');
    if (!code) return;
    setError(SSO_ERROR_MESSAGE[code] ?? SSO_ERROR_MESSAGE.failed!);
    // A real post-handshake failure (not just "not configured") still means
    // SSO IS set up for this org — keep offering the button so the user can
    // retry without re-typing their email.
    if (code !== 'not-configured' && code !== 'invalid-email') setSsoAvailable(true);
  }, [searchParams]);

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
        setError('Single sign-on is required for your organization. Continue below to sign in through your identity provider.');
        setSsoAvailable(true);
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

  function continueWithSso() {
    if (!email.includes('@')) {
      setError('Enter your email address first.');
      return;
    }
    setSsoRedirecting(true);
    window.location.href = `/api/auth/saml/login?email=${encodeURIComponent(email)}`;
  }

  return (
    <AuthShell
      title="Sign in to PS-DOS™"
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
        {ssoAvailable && (
          <button
            type="button"
            disabled={ssoRedirecting}
            onClick={continueWithSso}
            className="btn-secondary"
          >
            {ssoRedirecting ? 'Redirecting to your identity provider…' : 'Continue with single sign-on'}
          </button>
        )}
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
