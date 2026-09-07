import { redirect } from 'next/navigation';
import { DeadlineList } from '@/components/dashboard/deadline-list';
import { RecentSessions } from '@/components/dashboard/recent-sessions';
import { SkillSnapshot } from '@/components/dashboard/skill-snapshot';
import { TodayPlanCard } from '@/components/dashboard/today-plan';
import { getDeadlines, getRecentSessions, getSkills, getStudent } from '@/db/queries';
import { summarizeSkills } from '@/domain/summary';
import { getOrCreateTodayPlan } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');

  const [plan, deadlines, skills, recent] = await Promise.all([
    getOrCreateTodayPlan(student),
    getDeadlines(student.id),
    getSkills(student.id),
    getRecentSessions(student.id, 5),
  ]);

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm text-muted-foreground">{plan.date}</p>
        <h1 className="mt-1 max-w-2xl text-xl font-semibold leading-snug tracking-tight">{plan.greeting}</h1>
      </header>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="grid gap-6">
          <TodayPlanCard plan={plan} />
          <RecentSessions sessions={recent} />
        </div>
        <div className="grid gap-6">
          <DeadlineList deadlines={deadlines} todayISO={plan.date} />
          <SkillSnapshot groups={summarizeSkills(skills)} />
        </div>
      </div>
    </div>
  );
}
