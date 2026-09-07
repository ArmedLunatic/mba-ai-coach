import { describe, expect, it } from 'vitest';
import { parseOnboarding } from './schema';

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

const base = {
  name: 'Ansh',
  program: 'Full-time MBA',
  semester: 'Semester 1',
  courses: ['finance', 'strategy'],
  englishComfort: '2',
  academicGoals: 'Pass finance',
  careerGoals: 'Consulting',
  studyTimes: ['evening'],
  'deadline.title.0': 'Finance midterm',
  'deadline.course.0': 'finance',
  'deadline.kind.0': 'exam',
  'deadline.date.0': '2026-09-20',
};

describe('parseOnboarding', () => {
  it('parses a complete form', () => {
    const r = parseOnboarding(form(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.courseSlugs).toEqual(['finance', 'strategy']);
    expect(r.value.englishComfort).toBe(2);
    expect(r.value.deadlines).toEqual([
      { title: 'Finance midterm', courseSlug: 'finance', kind: 'exam', dueAt: new Date('2026-09-20T00:00:00.000Z') },
    ]);
  });

  it('skips empty deadline rows', () => {
    const r = parseOnboarding(form({ ...base, 'deadline.title.0': '', 'deadline.date.0': '' }));
    expect(r.ok && r.value.deadlines).toEqual([]);
  });

  it('requires a name and at least one course', () => {
    expect(parseOnboarding(form({ ...base, name: '' })).ok).toBe(false);
    expect(parseOnboarding(form({ ...base, courses: [] })).ok).toBe(false);
  });

  it('rejects unknown course slugs', () => {
    expect(parseOnboarding(form({ ...base, courses: ['finance', 'astrology'] })).ok).toBe(false);
  });

  it('reports friendly messages for deadline problems', () => {
    const long = parseOnboarding(form({ ...base, 'deadline.title.0': 'x'.repeat(81) }));
    expect(long).toEqual({ ok: false, error: 'Deadline titles are limited to 80 characters' });
    const badCourse = parseOnboarding(form({ ...base, 'deadline.course.0': 'astrology' }));
    expect(badCourse).toEqual({ ok: false, error: 'Choose a course from your list' });
  });
});
