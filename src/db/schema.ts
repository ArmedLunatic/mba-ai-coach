import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { Domain } from './curriculum';
import type { SessionState } from '@/domain/session';

export type PlanItem = {
  skillId: string;
  skillName: string;
  courseName: string | null;
  domain: Domain;
  minutes: number;
  reason: string;
};

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  program: text('program').notNull(),
  semester: text('semester').notNull(),
  englishComfort: integer('english_comfort').notNull(), // 1-5
  academicGoals: text('academic_goals').notNull().default(''),
  careerGoals: text('career_goals').notNull().default(''),
  preferredStudyTimes: text('preferred_study_times').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  color: text('color').notNull(),
});

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  domain: text('domain').$type<Domain>().notNull(),
  name: text('name').notNull(),
  score: integer('score').notNull(), // 0-100
  confidence: integer('confidence').notNull().default(50), // 0-100
  attempts: integer('attempts').notNull().default(0),
  lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }),
  trend: text('trend').$type<'up' | 'flat' | 'down'>().notNull().default('flat'),
});

export const skillObservations = pgTable('skill_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id'),
  kind: text('kind').$type<'mistake' | 'strength' | 'english_note'>().notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deadlines = pgTable('deadlines', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  kind: text('kind').$type<'exam' | 'assignment' | 'class' | 'presentation'>().notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
});

export const dailyPlans = pgTable(
  'daily_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    greeting: text('greeting').notNull(),
    items: jsonb('items').$type<PlanItem[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // One plan per student per day: two concurrent dashboard loads must not both insert.
  (t) => [unique('daily_plans_student_date').on(t.studentId, t.date)],
);

export type SessionPhase = 'learn' | 'practice' | 'explain' | 'test' | 'feedback' | 'done';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  phase: text('phase').$type<SessionPhase>().notNull().default('learn'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  performance: integer('performance'), // 0-100, set on finalize
  selfConfidence: integer('self_confidence'), // 1-5
  summary: text('summary'),
  phaseState: jsonb('phase_state').$type<SessionState>().notNull(),
});

export const sessionMessages = pgTable('session_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  phase: text('phase').$type<SessionPhase>().notNull(),
  role: text('role').$type<'coach' | 'student'>().notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skillsRelations = relations(skills, ({ one }) => ({
  course: one(courses, { fields: [skills.courseId], references: [courses.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  skill: one(skills, { fields: [sessions.skillId], references: [skills.id] }),
  messages: many(sessionMessages),
}));

export const sessionMessagesRelations = relations(sessionMessages, ({ one }) => ({
  session: one(sessions, { fields: [sessionMessages.sessionId], references: [sessions.id] }),
}));

export type Student = typeof students.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type SkillObservation = typeof skillObservations.$inferSelect;
export type Deadline = typeof deadlines.$inferSelect;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionMessage = typeof sessionMessages.$inferSelect;
