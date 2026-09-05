import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if ((session.memberships ?? []).length > 0) redirect('/launch');

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-xl font-bold mb-1">Create your organization</h1>
        <p className="text-ink-muted text-sm mb-6">
          You&rsquo;re signed in as {session.user.email}, but not attached to an organization yet.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
