import { z } from 'zod';
import { COURSES } from '@/db/curriculum';
import type { OnboardingInput } from '@/db/queries';

const SLUGS = COURSES.map((c) => c.slug) as [string, ...string[]];
export const MAX_DEADLINES = 3;
export const STUDY_TIMES = ['morning', 'afternoon', 'evening', 'night'] as const;

const deadlineSchema = z.object({
  title: z.string().trim().min(1, 'Give each deadline a title').max(80, 'Deadline titles are limited to 80 characters'),
  courseSlug: z.enum(SLUGS, { error: 'Choose a course from your list' }).nullable(),
  kind: z.enum(['exam', 'assignment', 'class', 'presentation'], { error: 'Choose a deadline type' }),
  dueAt: z.coerce.date({ error: 'Enter a valid date' }),
});

const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  program: z.string().trim().min(1, 'Program is required').max(80),
  semester: z.string().trim().min(1, 'Semester is required').max(40),
  courseSlugs: z.array(z.enum(SLUGS, { error: 'Choose courses from the list' })).min(1, 'Pick at least one course'),
  englishComfort: z.coerce.number().int().min(1).max(5),
  academicGoals: z.string().trim().max(300),
  careerGoals: z.string().trim().max(300),
  preferredStudyTimes: z.array(z.enum(STUDY_TIMES)),
  deadlines: z.array(deadlineSchema).max(MAX_DEADLINES),
});

export function parseOnboarding(form: FormData): { ok: true; value: OnboardingInput } | { ok: false; error: string } {
  const str = (k: string) => (form.get(k) ?? '').toString();
  const deadlines = [];
  for (let i = 0; i < MAX_DEADLINES; i++) {
    const title = str(`deadline.title.${i}`);
    const date = str(`deadline.date.${i}`);
    if (!title.trim() || !date) continue;
    const course = str(`deadline.course.${i}`);
    deadlines.push({ title, courseSlug: course || null, kind: str(`deadline.kind.${i}`) || 'exam', dueAt: `${date}T00:00:00.000Z` });
  }

  const result = onboardingSchema.safeParse({
    name: str('name'),
    program: str('program'),
    semester: str('semester'),
    courseSlugs: form.getAll('courses').map(String),
    englishComfort: str('englishComfort'),
    academicGoals: str('academicGoals'),
    careerGoals: str('careerGoals'),
    preferredStudyTimes: form.getAll('studyTimes').map(String),
    deadlines,
  });

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Please check the form' };
  }
  return { ok: true, value: result.data };
}
