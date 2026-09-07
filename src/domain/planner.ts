import { isLanguageDomain, type Domain } from '@/db/curriculum';
import type { PlanItem } from '@/db/schema';
import { daysBetween, startOfDay } from '@/lib/today';

export type PlannerSkill = {
  id: string;
  name: string;
  domain: Domain;
  courseId: string | null;
  courseName: string | null;
  score: number;
  lastPracticedAt: Date | null;
};

export type PlannerDeadline = {
  courseId: string | null;
  title: string;
  kind: 'exam' | 'assignment' | 'class' | 'presentation';
  dueAt: Date;
};

const W_DEADLINE = 3;
const W_STALE = 1.5;
const PRACTICED_TODAY_PENALTY = 50;
const STALE_CAP = 14;

type Scored = { skill: PlannerSkill; priority: number; reason: string };

export function minutesFor(skill: PlannerSkill): number {
  if (isLanguageDomain(skill.domain)) return 10;
  if (skill.score < 50) return 35;
  if (skill.score < 70) return 25;
  return 20;
}

/**
 * priority = (100 − score)
 *          + 3 · max(0, 14 − daysToNearestCourseDeadline)
 *          + 1.5 · min(14, daysSincePracticed; 14 if never)
 *          − 50 · practicedToday
 */
function scoreSkill(skill: PlannerSkill, deadlines: PlannerDeadline[], todayISO: string, isWeakestInCourse: boolean): Scored {
  const today = startOfDay(todayISO);
  const weakness = 100 - skill.score;

  const nearest = deadlines
    .filter((dl) => dl.courseId !== null && dl.courseId === skill.courseId && dl.dueAt >= today)
    .map((dl) => ({ dl, days: daysBetween(todayISO, dl.dueAt) }))
    .sort((a, b) => a.days - b.days)[0];
  const deadlineScore = nearest ? W_DEADLINE * Math.max(0, 14 - nearest.days) : 0;

  const daysSince = skill.lastPracticedAt ? daysBetween(todayISO, skill.lastPracticedAt) * -1 : STALE_CAP;
  const staleDays = Math.min(STALE_CAP, Math.max(0, daysSince));
  const staleScore = W_STALE * staleDays;

  const practicedToday = skill.lastPracticedAt !== null && daysSince === 0;
  const priority = weakness + deadlineScore + staleScore - (practicedToday ? PRACTICED_TODAY_PENALTY : 0);

  // Reason precedence: deadline within 14 days → stale (≥ 7 days) → English → weakest in course → mastery.
  let reason: string;
  if (nearest && nearest.days <= 14) {
    reason = `${nearest.dl.title} in ${nearest.days} day${nearest.days === 1 ? '' : 's'}`;
  } else if (skill.lastPracticedAt && staleDays >= 7) {
    reason = `Not practiced in ${daysSince} days`;
  } else if (isLanguageDomain(skill.domain)) {
    reason = skill.domain === 'communication' ? 'Daily communication practice' : 'Daily English practice';
  } else if (skill.courseName && isWeakestInCourse) {
    reason = `Your weakest ${skill.courseName} topic`;
  } else if (skill.courseName) {
    reason = `${skill.courseName} · ${skill.score}% mastery`;
  } else {
    reason = 'Keep it warm';
  }

  return { skill, priority, reason };
}

export function buildDailyPlan(input: {
  skills: PlannerSkill[];
  deadlines: PlannerDeadline[];
  todayISO: string;
}): PlanItem[] {
  const minByCourse = new Map<string, number>();
  for (const s of input.skills) {
    if (s.courseId) minByCourse.set(s.courseId, Math.min(minByCourse.get(s.courseId) ?? 100, s.score));
  }

  const scored = input.skills
    .map((s) => scoreSkill(s, input.deadlines, input.todayISO, s.courseId !== null && minByCourse.get(s.courseId) === s.score))
    .sort((a, b) => b.priority - a.priority);

  const mba = scored.filter((s) => !isLanguageDomain(s.skill.domain));
  const language = scored.filter((s) => isLanguageDomain(s.skill.domain));

  const picked = language.length > 0 ? [...mba.slice(0, 2), language[0]] : mba.slice(0, 3);

  return picked.map(({ skill, reason }) => ({
    skillId: skill.id,
    skillName: skill.name,
    courseName: skill.courseName,
    domain: skill.domain,
    minutes: minutesFor(skill),
    reason,
  }));
}
