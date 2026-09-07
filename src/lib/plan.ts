import { generateGreeting } from '@/ai/planner-text';
import { getCompletedSkillIdsOn, getDailyPlan, getDeadlines, getSkills, saveDailyPlan } from '@/db/queries';
import type { PlanItem, Student } from '@/db/schema';
import { buildDailyPlan } from '@/domain/planner';
import { todayISO } from '@/lib/today';

export type TodayPlan = { date: string; greeting: string; items: (PlanItem & { done: boolean })[] };

export async function getOrCreateTodayPlan(student: Student): Promise<TodayPlan> {
  const date = todayISO();
  let plan = await getDailyPlan(student.id, date);

  if (!plan) {
    const [skills, deadlines] = await Promise.all([getSkills(student.id), getDeadlines(student.id)]);
    const items = buildDailyPlan({
      skills: skills.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        courseId: s.courseId,
        courseName: s.courseName,
        score: s.score,
        lastPracticedAt: s.lastPracticedAt,
      })),
      deadlines: deadlines.map((d) => ({ courseId: d.courseId, title: d.title, kind: d.kind, dueAt: d.dueAt })),
      todayISO: date,
    });
    const greeting = await generateGreeting({ name: student.name, items, deadlines, todayISO: date });
    plan = await saveDailyPlan(student.id, date, greeting, items);
  }

  const done = await getCompletedSkillIdsOn(student.id, date);
  return { date, greeting: plan.greeting, items: plan.items.map((i) => ({ ...i, done: done.has(i.skillId) })) };
}
