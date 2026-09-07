import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { COMMUNICATION_SKILLS, COURSES, ENGLISH_SKILLS, type Domain } from './curriculum';
import { db } from './client';
import { initialState, type SessionState } from '@/domain/session';
import { englishPenalty, initialScores } from '@/domain/skills';
import { startOfDay } from '@/lib/today';
import {
  courses,
  dailyPlans,
  deadlines,
  sessionMessages,
  sessions,
  skillObservations,
  skills,
  students,
  type Course,
  type DailyPlan,
  type Deadline,
  type PlanItem,
  type Session,
  type SessionMessage,
  type SessionPhase,
  type Skill,
  type SkillObservation,
  type Student,
} from './schema';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type OnboardingInput = {
  name: string;
  program: string;
  semester: string;
  courseSlugs: string[];
  englishComfort: number;
  academicGoals: string;
  careerGoals: string;
  preferredStudyTimes: string[];
  deadlines: { title: string; courseSlug: string | null; kind: Deadline['kind']; dueAt: Date }[];
};

export async function getStudent(): Promise<Student | null> {
  const rows = await db.select().from(students).orderBy(asc(students.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function createStudent(input: OnboardingInput): Promise<Student> {
  return db.transaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({
        name: input.name,
        program: input.program,
        semester: input.semester,
        englishComfort: input.englishComfort,
        academicGoals: input.academicGoals,
        careerGoals: input.careerGoals,
        preferredStudyTimes: input.preferredStudyTimes,
      })
      .returning();

    const templates = COURSES.filter((c) => input.courseSlugs.includes(c.slug));
    const insertedCourses = templates.length
      ? await tx
          .insert(courses)
          .values(templates.map((t) => ({ studentId: student.id, name: t.name, slug: t.slug, color: t.color })))
          .returning()
      : [];
    const courseIdBySlug = new Map(insertedCourses.map((c) => [c.slug, c.id]));

    const scores = initialScores(input.englishComfort);
    const skillRows = [
      ...templates.flatMap((t) =>
        t.topics.map((topic) => ({
          studentId: student.id,
          courseId: courseIdBySlug.get(t.slug)!,
          domain: t.domain,
          name: topic,
          score: scores.mba,
        })),
      ),
      ...ENGLISH_SKILLS.map((name) => ({ studentId: student.id, courseId: null, domain: 'english' as Domain, name, score: scores.english })),
      ...COMMUNICATION_SKILLS.map((name) => ({
        studentId: student.id,
        courseId: null,
        domain: 'communication' as Domain,
        name,
        score: scores.communication,
      })),
    ];
    await tx.insert(skills).values(skillRows);

    if (input.deadlines.length) {
      await tx.insert(deadlines).values(
        input.deadlines.map((d) => ({
          studentId: student.id,
          courseId: d.courseSlug ? (courseIdBySlug.get(d.courseSlug) ?? null) : null,
          title: d.title,
          kind: d.kind,
          dueAt: d.dueAt,
        })),
      );
    }
    return student;
  });
}

export type SkillWithCourse = Skill & { courseName: string | null };

export async function getSkills(studentId: string): Promise<SkillWithCourse[]> {
  const rows = await db
    .select({ skill: skills, courseName: courses.name })
    .from(skills)
    .leftJoin(courses, eq(skills.courseId, courses.id))
    .where(eq(skills.studentId, studentId))
    .orderBy(asc(courses.name), asc(skills.name));
  return rows.map((r) => ({ ...r.skill, courseName: r.courseName ?? null }));
}

export async function getCourses(studentId: string): Promise<Course[]> {
  return db.select().from(courses).where(eq(courses.studentId, studentId)).orderBy(asc(courses.name));
}

/** All deadlines for the student, soonest first. Callers filter to upcoming ones with `daysBetween`. */
export async function getDeadlines(studentId: string): Promise<Deadline[]> {
  return db.select().from(deadlines).where(eq(deadlines.studentId, studentId)).orderBy(asc(deadlines.dueAt));
}

export async function getDailyPlan(studentId: string, date: string): Promise<DailyPlan | null> {
  const rows = await db
    .select()
    .from(dailyPlans)
    .where(and(eq(dailyPlans.studentId, studentId), eq(dailyPlans.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveDailyPlan(studentId: string, date: string, greeting: string, items: PlanItem[]): Promise<DailyPlan> {
  const [row] = await db.insert(dailyPlans).values({ studentId, date, greeting, items }).returning();
  return row;
}

export async function createSession(skillId: string): Promise<Session> {
  const [row] = await db
    .insert(sessions)
    .values({ skillId, phaseState: initialState() })
    .returning();
  return row;
}

export type LoadedSession = { session: Session; skill: Skill; course: Course | null; student: Student; messages: SessionMessage[] };

export async function loadSession(id: string): Promise<LoadedSession | null> {
  const rows = await db
    .select({ session: sessions, skill: skills, course: courses, student: students })
    .from(sessions)
    .innerJoin(skills, eq(sessions.skillId, skills.id))
    .leftJoin(courses, eq(skills.courseId, courses.id))
    .innerJoin(students, eq(skills.studentId, students.id))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const messages = await getSessionMessages(id);
  return { session: row.session, skill: row.skill, course: row.course ?? null, student: row.student, messages };
}

export type NewMessage = { phase: SessionPhase; role: 'coach' | 'student'; content: string };

export async function saveSessionStep(id: string, state: SessionState, messages: NewMessage[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ phaseState: state, phase: state.phase }).where(eq(sessions.id, id));
    if (messages.length) {
      await tx.insert(sessionMessages).values(messages.map((m) => ({ sessionId: id, ...m })));
    }
  });
}

export async function getSessionMessages(id: string): Promise<SessionMessage[]> {
  return db.select().from(sessionMessages).where(eq(sessionMessages.sessionId, id)).orderBy(asc(sessionMessages.createdAt), asc(sessionMessages.id));
}

export async function getSkillObservations(skillId: string, limit: number): Promise<SkillObservation[]> {
  return db
    .select()
    .from(skillObservations)
    .where(eq(skillObservations.skillId, skillId))
    .orderBy(desc(skillObservations.createdAt))
    .limit(limit);
}

export async function getSkillPerformances(skillId: string, limit: number): Promise<number[]> {
  const rows = await db
    .select({ performance: sessions.performance })
    .from(sessions)
    .where(and(eq(sessions.skillId, skillId), isNotNull(sessions.performance)))
    .orderBy(desc(sessions.endedAt))
    .limit(limit);
  return rows.map((r) => r.performance as number).reverse();
}

export type SessionOutcomeWrite = {
  sessionId: string;
  skillId: string;
  studentId: string;
  performance: number;
  score: number;
  attempts: number;
  trend: Skill['trend'];
  confidence: number;
  selfConfidence: number;
  summary: string;
  mistakes: string[];
  englishNotes: { skill: string; note: string }[];
  /** Final phase state, committed with the outcome so a session is never `done` without one. */
  state: SessionState;
  /** Transcript rows produced by the final step, inserted in the same transaction. */
  messages: NewMessage[];
  at: Date;
};

/**
 * Commits the whole end of a session in one transaction: phase state, transcript, session outcome,
 * skill update, mistake observations, and the English nudges (whose penalty is computed inside the
 * transaction so concurrent finalisations cannot both read a stale note count).
 */
export async function applySessionOutcome(w: SessionOutcomeWrite): Promise<void> {
  const since = new Date(w.at.getTime() - WEEK_MS);
  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({
        phaseState: w.state,
        phase: 'done',
        endedAt: w.at,
        performance: w.performance,
        selfConfidence: w.selfConfidence,
        summary: w.summary,
      })
      .where(and(eq(sessions.id, w.sessionId), isNull(sessions.endedAt)));

    if (w.messages.length) {
      await tx.insert(sessionMessages).values(w.messages.map((m) => ({ sessionId: w.sessionId, ...m })));
    }

    await tx
      .update(skills)
      .set({ score: w.score, attempts: w.attempts, trend: w.trend, confidence: w.confidence, lastPracticedAt: w.at })
      .where(eq(skills.id, w.skillId));

    if (w.mistakes.length) {
      await tx.insert(skillObservations).values(
        w.mistakes.map((note) => ({ skillId: w.skillId, sessionId: w.sessionId, kind: 'mistake' as const, note })),
      );
    }

    for (const note of w.englishNotes) {
      const [englishSkill] = await tx
        .select()
        .from(skills)
        .where(and(eq(skills.studentId, w.studentId), eq(skills.domain, 'english'), eq(skills.name, note.skill)))
        .limit(1);
      if (!englishSkill) continue;

      const [counted] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(skillObservations)
        .where(
          and(
            eq(skillObservations.skillId, englishSkill.id),
            eq(skillObservations.kind, 'english_note'),
            gte(skillObservations.createdAt, since),
          ),
        );
      const penalty = englishPenalty(counted?.n ?? 0);

      await tx.insert(skillObservations).values({ skillId: englishSkill.id, sessionId: w.sessionId, kind: 'english_note', note: note.note });
      if (penalty !== 0) {
        await tx
          .update(skills)
          .set({ score: sql`greatest(0, ${skills.score} + ${penalty})` })
          .where(eq(skills.id, englishSkill.id));
      }
    }
  });
}

export async function getCompletedSkillIdsOn(studentId: string, dateISO: string): Promise<Set<string>> {
  const start = startOfDay(dateISO);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ skillId: sessions.skillId })
    .from(sessions)
    .innerJoin(skills, eq(sessions.skillId, skills.id))
    .where(and(eq(skills.studentId, studentId), isNotNull(sessions.endedAt), gte(sessions.endedAt, start), sql`${sessions.endedAt} < ${end}`));
  return new Set(rows.map((r) => r.skillId));
}

export type RecentSession = { id: string; skillName: string; courseName: string | null; performance: number | null; endedAt: Date | null };

export async function getRecentSessions(studentId: string, limit: number): Promise<RecentSession[]> {
  const rows = await db
    .select({ id: sessions.id, skillName: skills.name, courseName: courses.name, performance: sessions.performance, endedAt: sessions.endedAt })
    .from(sessions)
    .innerJoin(skills, eq(sessions.skillId, skills.id))
    .leftJoin(courses, eq(skills.courseId, courses.id))
    .where(and(eq(skills.studentId, studentId), isNotNull(sessions.endedAt)))
    .orderBy(desc(sessions.endedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, courseName: r.courseName ?? null }));
}

export type ObservationWithSkill = SkillObservation & { skillName: string; domain: Domain };

export async function getObservationsSince(studentId: string, since: Date): Promise<ObservationWithSkill[]> {
  const rows = await db
    .select({ obs: skillObservations, skillName: skills.name, domain: skills.domain })
    .from(skillObservations)
    .innerJoin(skills, eq(skillObservations.skillId, skills.id))
    .where(and(eq(skills.studentId, studentId), gte(skillObservations.createdAt, since)))
    .orderBy(desc(skillObservations.createdAt));
  return rows.map((r) => ({ ...r.obs, skillName: r.skillName, domain: r.domain }));
}
