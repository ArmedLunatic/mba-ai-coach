import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudent } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');
  const rows: [string, string][] = [
    ['Name', student.name],
    ['Program', student.program],
    ['Semester', student.semester],
    ['English comfort', `${student.englishComfort} / 5`],
    ['Academic goals', student.academicGoals || '—'],
    ['Career goals', student.careerGoals || '—'],
    ['Study times', student.preferredStudyTimes.join(', ') || '—'],
  ];
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Editing is not available yet. To start over, run <code>npm run db:reset</code> and reload.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
