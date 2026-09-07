'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import {
  beginOperatorMfaEnrollmentAction,
  activateOperatorMfaAction,
} from '@/server/actions/ops-mfa';
import type { MfaStatus } from '@/lib/ops/operator-mfa';

type Challenge = { secret: string; otpauthUri: string; qrDataUri: string; rotating: boolean };

/**
 * Operator TOTP enrollment. Three steps in-place:
 *   1. confirm password  → beginOperatorMfaEnrollmentAction
 *   2. scan QR / enter secret, then type a live code → activateOperatorMfaAction
 *   3. save the 10 one-time recovery codes (shown once)
 */
export function OperatorMfaPanel({
  initialStatus,
  operatorEmail,
}: {
  initialStatus: MfaStatus;
  operatorEmail: string;
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activated = initialStatus.activated;

  function begin() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () => beginOperatorMfaEnrollmentAction({ password }),
        { errorTitle: 'Couldn’t start enrollment' },
      );
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        setError(outcome.data.error);
        return;
      }
      setChallenge(outcome.data);
      setPassword('');
    });
  }

  function activate() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () => activateOperatorMfaAction({ code: code.trim() }),
        { errorTitle: 'Couldn’t activate' },
      );
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        setError(outcome.data.error);
        return;
      }
      setRecoveryCodes(outcome.data.recoveryCodes);
      setChallenge(null);
      setCode('');
      toast({ variant: 'success', title: 'Authenticator activated.' });
    });
  }

  // ── recovery codes (shown once, after activation) ──────────────────────
  if (recoveryCodes) {
    return (
      <section className="card">
        <h2 className="text-[15.5px] font-bold mb-1">Save your recovery codes</h2>
        <p className="text-[12.5px] text-ink-muted mb-4">
          Each of these works <strong>once</strong> in place of a 6-digit code if you lose your authenticator.
          Store them somewhere safe — they are shown only now.
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 font-mono text-sm max-w-sm mb-4">
          {recoveryCodes.map((c) => (
            <span key={c} className="tracking-wider">{c}</span>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary !w-auto px-5 text-xs"
          onClick={() => {
            setRecoveryCodes(null);
            router.refresh();
          }}
        >
          I’ve saved them
        </button>
      </section>
    );
  }

  // ── enrollment ceremony (challenge issued) ────────────────────────────
  if (challenge) {
    return (
      <section className="card">
        <h2 className="text-[15.5px] font-bold mb-1">
          {challenge.rotating ? 'Replace your authenticator' : 'Add your authenticator'}
        </h2>
        <p className="text-[12.5px] text-ink-muted mb-4">
          Scan this with your authenticator app, or add the key manually, then enter the current 6-digit code
          to confirm.
        </p>
        <div className="flex flex-wrap gap-6 items-start mb-4">
          <Image
            src={challenge.qrDataUri}
            alt="Authenticator QR code"
            width={200}
            height={200}
            unoptimized
            className="rounded-sm border border-border-soft bg-white p-1"
          />
          <div className="text-xs text-ink-muted">
            <div className="uppercase tracking-wide text-[10.5px] text-ink-faint font-semibold mb-1">
              Manual key
            </div>
            <code className="block font-mono text-sm text-ink break-all max-w-[220px] mb-3">
              {challenge.secret}
            </code>
            <div className="text-ink-faint">Account: {operatorEmail}</div>
            <div className="text-ink-faint">Issuer: A2R Operator Console</div>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs max-w-[220px]">
          <span className="text-ink-muted">6-digit code</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="input tracking-[0.3em] font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
            placeholder="123456"
            maxLength={10}
          />
        </label>

        {error && <p className="text-critical text-xs mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            disabled={pending || code.trim().length < 6}
            onClick={activate}
            className="btn-primary !w-auto px-5 text-xs"
          >
            {pending ? 'Confirming…' : 'Confirm & activate'}
          </button>
          <button
            type="button"
            className="text-ink-faint hover:text-ink text-xs px-3 py-2"
            onClick={() => {
              setChallenge(null);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  // ── status + start ───────────────────────────────────────────────────
  return (
    <section className="card">
      <div className="flex items-center gap-2 mb-1">
        <span className={`status-dot ${activated ? 'bg-success' : 'bg-warning'}`} />
        <h2 className="text-[15.5px] font-bold">
          {activated ? 'Authenticator active' : 'No authenticator enrolled'}
        </h2>
      </div>

      {activated ? (
        <p className="text-[12.5px] text-ink-muted mb-4">
          Active since {new Date(initialStatus.activatedAt!).toLocaleDateString()}.
          {initialStatus.lastUsedAt
            ? ` Last used ${new Date(initialStatus.lastUsedAt).toLocaleString()}.`
            : ''}{' '}
          Replacing it (e.g. a new phone) needs a live elevation.
        </p>
      ) : (
        <p className="text-[12.5px] text-ink-muted mb-4">
          You cannot start a privileged elevation until you enroll one. Confirm your password to begin.
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs max-w-[280px]">
        <span className="text-ink-muted">Confirm your password</span>
        <input
          type="password"
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          maxLength={200}
        />
      </label>

      {error && <p className="text-critical text-xs mt-2">{error}</p>}

      <button
        type="button"
        disabled={pending || password.length < 1}
        onClick={begin}
        className="btn-primary !w-auto px-5 text-xs mt-4"
      >
        {pending ? 'Starting…' : activated ? 'Replace authenticator' : 'Set up authenticator'}
      </button>
    </section>
  );
}
