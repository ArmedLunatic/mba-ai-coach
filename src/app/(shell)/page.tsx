import { redirect } from 'next/navigation';
import { getStudent } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');
  return <h1 className="text-2xl font-semibold">Good morning, {student.name}.</h1>;
}
