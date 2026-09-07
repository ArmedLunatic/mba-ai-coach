import { redirect } from 'next/navigation';
import { startSessionAction } from '@/app/(shell)/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCourses, getSkills, getStudent } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function CoursesPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');
  const [courses, skills] = await Promise.all([getCourses(student.id), getSkills(student.id)]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
      <div className="grid gap-6 md:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                {c.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {skills
                  .filter((s) => s.courseId === c.id)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3">
                      <span>{s.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">{s.score}%</span>
                        <form action={startSessionAction.bind(null, s.id)}>
                          <Button type="submit" size="sm" variant="outline">
                            Practice
                          </Button>
                        </form>
                      </span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
