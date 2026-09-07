import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { getStudent } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (await getStudent()) redirect('/');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your MBA coach</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Five minutes now. Your coach uses this to decide what you should work on each day.
      </p>
      <OnboardingForm />
    </main>
  );
}
