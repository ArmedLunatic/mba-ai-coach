import { describe, expect, it } from 'vitest';
import { buildDailyPlan, minutesFor, type PlannerDeadline, type PlannerSkill } from './planner';

const TODAY = '2026-09-07';
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function skill(over: Partial<PlannerSkill> & { id: string }): PlannerSkill {
  return {
    name: over.id,
    domain: 'finance',
    courseId: 'fin',
    courseName: 'Finance',
    score: 60,
    lastPracticedAt: null,
    ...over,
  };
}

describe('buildDailyPlan', () => {
  it('ranks a weak skill with a near deadline first', () => {
    const skills = [
      skill({ id: 'wacc', score: 40, courseId: 'fin' }),
      skill({ id: 'swot', score: 40, courseId: 'strat', courseName: 'Strategy', domain: 'strategy' }),
      skill({ id: 'articles', domain: 'english', courseId: null, courseName: null, score: 50 }),
    ];
    const deadlines: PlannerDeadline[] = [{ courseId: 'fin', title: 'Finance exam', kind: 'exam', dueAt: d('2026-09-09') }];
    const plan = buildDailyPlan({ skills, deadlines, todayISO: TODAY });
    expect(plan[0].skillId).toBe('wacc');
    expect(plan[0].reason).toBe('Finance exam in 2 days');
  });

  it('always includes exactly one language item when available, placed last', () => {
    const skills = [
      skill({ id: 'a', score: 30 }),
      skill({ id: 'b', score: 35 }),
      skill({ id: 'c', score: 40 }),
      skill({ id: 'articles', domain: 'english', courseId: null, courseName: null, score: 90 }),
      skill({ id: 'tenses', domain: 'english', courseId: null, courseName: null, score: 20 }),
    ];
    const plan = buildDailyPlan({ skills, deadlines: [], todayISO: TODAY });
    expect(plan).toHaveLength(3);
    expect(plan.map((p) => p.skillId)).toEqual(['a', 'b', 'tenses']);
    expect(plan[2].minutes).toBe(10);
  });

  it('prefers stale skills and explains it', () => {
    const skills = [
      skill({ id: 'fresh', score: 50, lastPracticedAt: d('2026-09-06') }),
      skill({ id: 'stale', score: 50, lastPracticedAt: d('2026-08-20') }),
    ];
    const plan = buildDailyPlan({ skills, deadlines: [], todayISO: TODAY });
    expect(plan[0].skillId).toBe('stale');
    expect(plan[0].reason).toBe('Not practiced in 18 days');
  });

  it('pushes a skill practiced today to the bottom', () => {
    const skills = [
      skill({ id: 'done', score: 20, lastPracticedAt: new Date('2026-09-07T09:00:00Z') }),
      skill({ id: 'next', score: 70 }),
    ];
    const plan = buildDailyPlan({ skills, deadlines: [], todayISO: TODAY });
    expect(plan[0].skillId).toBe('next');
  });

  it('falls back to three MBA skills when there are no language skills', () => {
    const skills = [skill({ id: 'a' }), skill({ id: 'b' }), skill({ id: 'c' }), skill({ id: 'd' })];
    expect(buildDailyPlan({ skills, deadlines: [], todayISO: TODAY })).toHaveLength(3);
  });

  it('uses the weakness reason when nothing else dominates', () => {
    const skills = [skill({ id: 'wacc', name: 'WACC', score: 35 })];
    const plan = buildDailyPlan({ skills, deadlines: [], todayISO: TODAY });
    expect(plan[0].reason).toBe('Your weakest Finance topic');
  });
});

describe('minutesFor', () => {
  it('gives weaker MBA topics more time and language skills 10 minutes', () => {
    expect(minutesFor(skill({ id: 'x', score: 30 }))).toBe(35);
    expect(minutesFor(skill({ id: 'x', score: 60 }))).toBe(25);
    expect(minutesFor(skill({ id: 'x', score: 85 }))).toBe(20);
    expect(minutesFor(skill({ id: 'x', domain: 'english', score: 10 }))).toBe(10);
  });
});
