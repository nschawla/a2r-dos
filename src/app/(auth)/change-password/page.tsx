/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * /change-password. Requires a session (middleware-gated, plus the check
 * below). Reached two ways:
 *   - forced: src/middleware.ts redirects here on every request while the
 *     signed-in user's `mustChangePassword` flag is set (an
 *     operator-provisioned admin with a temp password);
 *   - voluntary: any signed-in user navigating here to change their
 *     password.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AuthShell } from '@/components/layout/AuthShell';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

export const metadata: Metadata = { title: 'Change your password — A2R Delivery OS™' };

export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const forced = session.user.mustChangePassword === true;

  return (
    <AuthShell
      title={forced ? 'Set your own password' : 'Change your password'}
      subtitle={
        forced
          ? 'Your account was set up with a temporary password. Choose your own to continue into the workspace.'
          : 'Enter your current password, then choose a new one.'
      }
    >
      <ChangePasswordForm forced={forced} />
    </AuthShell>
  );
}
