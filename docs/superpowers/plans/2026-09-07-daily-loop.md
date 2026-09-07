# MBA AI Coach — Daily Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the daily loop of the MBA AI Coach: onboard → dashboard with today's tasks → a five-phase focus session on a weak topic → skill graph update → tomorrow's plan changes.

**Architecture:** Next.js App Router app with three pure, unit-tested domain modules (skill math, planner, session state machine) and a thin AI layer that turns each session phase into one typed Claude call through a `TaskKind → model` router. Persistence is Drizzle on Supabase Postgres with a single seeded student row (no auth yet). The route handler for a session step is a loop: `next(state, event)` → run each returned effect (one model call) → `apply(state, result)` → persist.

**Tech Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4), shadcn/ui (base-nova preset on @base-ui/react), Drizzle ORM 0.45 + `postgres` driver, Vercel AI SDK 7 (`ai`) + `@ai-sdk/anthropic` 4, Zod 4, Vitest 5, npm.

Spec: `docs/superpowers/specs/2026-09-07-daily-loop-design.md`.

## Global Constraints

- Node 24, npm (pnpm is not installed). Use `npx` for one-off CLIs.
- Models: cheap tasks → `claude-haiku-4-5`; coaching tasks → `claude-sonnet-5`. Never write a model id at a call site; always go through `modelFor(kind)` in `src/ai/router.ts`.
- Structured outputs use `generateText({ output: Output.object({ schema }) })` from `ai` v7 and read `result.output`. There is no `generateObject` in this codebase.
- Tests mock models with `MockLanguageModelV4` from `ai/test`. Never call the real API in tests.
- One student row. `getStudent()` returns it or `null`; pages redirect to `/onboarding` when null.
- "Today" always comes from `todayISO()` in `src/lib/today.ts` (honours `COACH_TODAY=YYYY-MM-DD` for manual testing). Never call `new Date()` for date logic elsewhere.
- Scores, confidence, performance are integers 0–100. Self-confidence is 1–5. English comfort is 1–5.
- Copy tone: calm, academic, second person ("Your weakest Finance topic is WACC"). No emoji, no gamification words (streak, XP, badge).
- Env vars: `DATABASE_URL` (Supabase pooler URL), `ANTHROPIC_API_KEY`, optional `COACH_TODAY`. Documented in `.env.example`.
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File map

| Path | Responsibility |
|---|---|
| `src/lib/today.ts` | `todayISO()`, `daysBetween()` |
| `src/db/curriculum.ts` | Static course/topic/English/Communication catalogue |
| `src/db/schema.ts` | Drizzle tables and inferred types |
| `src/db/client.ts` | `db` singleton |
| `src/db/queries.ts` | All reads/writes used by pages and routes |
| `src/domain/skills.ts` | Pure: performance, score update, trend, initial scores, English penalty |
| `src/domain/planner.ts` | Pure: daily plan scoring |
| `src/domain/session.ts` | Pure: phase state machine (`next`, `apply`, `initialState`) |
| `src/ai/router.ts` | `TaskKind`, `modelFor`, provider override for tests |
| `src/ai/schemas.ts` | Zod schemas for every structured output |
| `src/ai/prompts.ts` | System/prompt builders (strings only) |
| `src/ai/phases.ts` | One function per model call (explainTopic, askPractice, …) |
| `src/ai/planner-text.ts` | Greeting + progress trend sentences |
| `src/app/...` | Pages, layout, route handler, server actions |
| `src/components/...` | Shell, dashboard cards, session runner, skill bars |

---

### Task 1: Scaffold the app, test runner, and env

**Files:**
- Create: project via `create-next-app` in `/Users/anshmishra/PREP` (the repo root already has `docs/` and `.git`)
- Create: `vitest.config.ts`, `.env.example`, `src/lib/today.ts`, `src/lib/today.test.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: `todayISO(): string` (YYYY-MM-DD), `daysBetween(fromISO: string, to: Date): number` (whole days, positive when `to` is later), `startOfDay(iso: string): Date`.

- [ ] **Step 1: Scaffold Next.js into the existing repo**

Run from `/Users/anshmishra/PREP`:

```bash
npx -y create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
```

If it refuses because the directory is non-empty (it contains `docs/` and `.git`), scaffold into a temp dir and move the files:

```bash
npx -y create-next-app@latest /tmp/mba-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
cp -R /tmp/mba-scaffold/. /Users/anshmishra/PREP/
rm -rf /tmp/mba-scaffold
```

Expected: `src/app/page.tsx`, `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` exist. `npm run build` is not needed yet.

- [ ] **Step 2: Install shadcn and the components used by the app**

```bash
npx -y shadcn@latest init -d -y </dev/null
npx -y shadcn@latest add button card input textarea progress badge label checkbox -y </dev/null
```

The `-d` flag selects the default `base-nova` preset (components are built on `@base-ui/react`, not Radix). Expected: `components.json` and `src/components/ui/{button,card,input,textarea,progress,badge,label,checkbox}.tsx` exist.

- [ ] **Step 3: Install runtime and dev dependencies**

```bash
npm i ai @ai-sdk/anthropic zod drizzle-orm postgres dotenv
npm i -D drizzle-kit vitest tsx @types/node
```

Expected versions (or newer): `ai@7`, `@ai-sdk/anthropic@4`, `zod@4`, `drizzle-orm@0.45`, `vitest@5`.

- [ ] **Step 4: Add vitest config and scripts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

Add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"db:push": "drizzle-kit push",
"db:reset": "tsx scripts/reset-db.ts",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Write the failing test for `today.ts`**

Create `src/lib/today.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { daysBetween, startOfDay, todayISO } from './today';

describe('todayISO', () => {
  afterEach(() => {
    delete process.env.COACH_TODAY;
  });

  it('honours COACH_TODAY override', () => {
    process.env.COACH_TODAY = '2026-09-10';
    expect(todayISO()).toBe('2026-09-10');
  });

  it('returns a YYYY-MM-DD string by default', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-09-07', new Date('2026-09-09T15:00:00Z'))).toBe(2);
  });
  it('is negative for past dates', () => {
    expect(daysBetween('2026-09-07', new Date('2026-09-05T00:00:00Z'))).toBe(-2);
  });
});

describe('startOfDay', () => {
  it('returns midnight UTC for the ISO date', () => {
    expect(startOfDay('2026-09-07').toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- src/lib/today.test.ts`
Expected: FAIL with "Cannot find module './today'".

- [ ] **Step 7: Implement `today.ts`**

Create `src/lib/today.ts`:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date as YYYY-MM-DD (UTC). Set COACH_TODAY to time-travel while testing. */
export function todayISO(): string {
  const override = process.env.COACH_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Date().toISOString().slice(0, 10);
}

export function startOfDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Whole days from the start of `fromISO` to `to`. Positive when `to` is later. */
export function daysBetween(fromISO: string, to: Date): number {
  return Math.floor((to.getTime() - startOfDay(fromISO).getTime()) / DAY_MS);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- src/lib/today.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Add `.env.example` and ignore local env**

Create `.env.example`:

```
# Supabase → Project Settings → Database → Connection string (Transaction pooler, port 6543)
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
ANTHROPIC_API_KEY=sk-ant-...
# Optional: pin "today" for manual testing of the planner (YYYY-MM-DD)
# COACH_TODAY=2026-09-08
```

Ensure `.gitignore` contains `.env*.local` and `.env` (create-next-app adds `.env*`; keep that line and add `!.env.example`).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with shadcn, vitest, and today helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Curriculum catalogue

**Files:**
- Create: `src/db/curriculum.ts`, `src/db/curriculum.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Domain = 'finance' | 'marketing' | 'strategy' | 'operations' | 'economics' | 'accounting' | 'english' | 'communication';
  export const MBA_DOMAINS: Domain[]; // the six course domains
  export type CourseTemplate = { slug: string; name: string; domain: Domain; color: string; topics: string[] };
  export const COURSES: CourseTemplate[];
  export const ENGLISH_SKILLS: readonly string[];
  export const COMMUNICATION_SKILLS: readonly string[];
  export function isLanguageDomain(d: Domain): boolean; // english | communication
  ```

- [ ] **Step 1: Write the failing test**

Create `src/db/curriculum.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COMMUNICATION_SKILLS, COURSES, ENGLISH_SKILLS, isLanguageDomain } from './curriculum';

describe('curriculum', () => {
  it('has six courses with unique slugs and 4-6 topics each', () => {
    expect(COURSES).toHaveLength(6);
    expect(new Set(COURSES.map((c) => c.slug)).size).toBe(6);
    for (const c of COURSES) {
      expect(c.topics.length).toBeGreaterThanOrEqual(4);
      expect(c.topics.length).toBeLessThanOrEqual(6);
    }
  });

  it('includes the spec examples', () => {
    const finance = COURSES.find((c) => c.slug === 'finance')!;
    expect(finance.topics).toEqual(expect.arrayContaining(['WACC', 'NPV', 'CAPM', 'Valuation']));
    const strategy = COURSES.find((c) => c.slug === 'strategy')!;
    expect(strategy.topics).toEqual(expect.arrayContaining(["Porter's Five Forces", 'SWOT']));
  });

  it('lists English and Communication skills', () => {
    expect(ENGLISH_SKILLS).toContain('Articles');
    expect(ENGLISH_SKILLS).toContain('Subject-verb agreement');
    expect(COMMUNICATION_SKILLS).toContain('Answer structure');
  });

  it('classifies language domains', () => {
    expect(isLanguageDomain('english')).toBe(true);
    expect(isLanguageDomain('communication')).toBe(true);
    expect(isLanguageDomain('finance')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/db/curriculum.test.ts`
Expected: FAIL with "Cannot find module './curriculum'".

- [ ] **Step 3: Implement the catalogue**

Create `src/db/curriculum.ts`:

```ts
export type Domain =
  | 'finance'
  | 'marketing'
  | 'strategy'
  | 'operations'
  | 'economics'
  | 'accounting'
  | 'english'
  | 'communication';

export const MBA_DOMAINS: Domain[] = ['finance', 'marketing', 'strategy', 'operations', 'economics', 'accounting'];

export type CourseTemplate = {
  slug: string;
  name: string;
  domain: Domain;
  color: string; // tailwind-safe hex
  topics: string[];
};

export const COURSES: CourseTemplate[] = [
  {
    slug: 'finance',
    name: 'Finance',
    domain: 'finance',
    color: '#2563eb',
    topics: ['WACC', 'NPV', 'CAPM', 'Valuation', 'Capital Structure'],
  },
  {
    slug: 'marketing',
    name: 'Marketing',
    domain: 'marketing',
    color: '#db2777',
    topics: ['Segmentation & Targeting', 'Positioning', 'Pricing Strategy', 'Customer Lifetime Value', 'Brand Equity'],
  },
  {
    slug: 'strategy',
    name: 'Strategy',
    domain: 'strategy',
    color: '#7c3aed',
    topics: ["Porter's Five Forces", 'SWOT', 'Competitive Advantage', 'Market Entry', 'Value Chain'],
  },
  {
    slug: 'operations',
    name: 'Operations',
    domain: 'operations',
    color: '#ea580c',
    topics: ['Process Capacity', 'Inventory Management', 'Lean & Waste', 'Queueing', 'Supply Chain Risk'],
  },
  {
    slug: 'economics',
    name: 'Economics',
    domain: 'economics',
    color: '#059669',
    topics: ['Supply & Demand', 'Elasticity', 'Market Structures', 'Game Theory Basics', 'Macro Indicators'],
  },
  {
    slug: 'accounting',
    name: 'Accounting',
    domain: 'accounting',
    color: '#0891b2',
    topics: ['Income Statement', 'Balance Sheet', 'Cash Flow Statement', 'Ratio Analysis', 'Accruals'],
  },
];

export const ENGLISH_SKILLS = [
  'Articles',
  'Tenses',
  'Prepositions',
  'Subject-verb agreement',
  'Sentence structure',
  'Business vocabulary',
  'Writing clarity',
] as const;

export const COMMUNICATION_SKILLS = ['Answer structure', 'Confidence'] as const;

export function isLanguageDomain(d: Domain): boolean {
  return d === 'english' || d === 'communication';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/db/curriculum.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/curriculum.ts src/db/curriculum.test.ts
git commit -m "feat: add seeded MBA curriculum catalogue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Database schema, client, push, reset script

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `scripts/reset-db.ts`

**Interfaces:**
- Consumes: `Domain` from `src/db/curriculum.ts`. The `phase_state` JSON column is untyped here; Task 6 Step 5 types it as `SessionState` once that type exists.
- Produces: tables `students, courses, skills, skillObservations, deadlines, dailyPlans, sessions, sessionMessages` and types `Student, Course, Skill, SkillObservation, Deadline, DailyPlan, Session, SessionMessage, NewX…`, plus `PlanItem` type; `db` from `src/db/client.ts`.

- [ ] **Step 1: Write the schema**

Create `src/db/schema.ts`:

```ts
import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Domain } from './curriculum';

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

export const dailyPlans = pgTable('daily_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // YYYY-MM-DD
  greeting: text('greeting').notNull(),
  items: jsonb('items').$type<PlanItem[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  phaseState: jsonb('phase_state').notNull(), // SessionState from @/domain/session
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
```

- [ ] **Step 2: Write the client and drizzle config**

Create `src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Supabase transaction pooler does not support prepared statements.
const client = postgres(url, { prepare: false });

export const db = drizzle(client, { schema });
export type Db = typeof db;
```

Create `drizzle.config.ts`:

```ts
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 3: Write the reset script**

Create `scripts/reset-db.ts`:

```ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
  // Cascades from students remove courses, skills, deadlines, plans, sessions.
  await db.execute(sql`truncate table students cascade`);
  console.log('Database reset: all student data removed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Typecheck and push the schema**

Create `.env.local` from `.env.example` with the real `DATABASE_URL` (ask the user if it is not present; do not invent one). Then:

```bash
npm run typecheck
npm run db:push
```

Expected: typecheck passes; drizzle-kit reports the 8 tables created. If `DATABASE_URL` is unavailable, still commit and note that `db:push` is pending.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/client.ts drizzle.config.ts scripts/reset-db.ts
git commit -m "feat: add Drizzle schema for student, skills, plans, and sessions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Skill math (pure)

**Files:**
- Create: `src/domain/skills.ts`, `src/domain/skills.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function initialScores(englishComfort: number): { english: number; communication: number; mba: number };
  export function computePerformance(testScore: number, practiceCorrect: number, practiceTotal: number): number;
  export function updateScore(current: { score: number; attempts: number }, performance: number): { score: number; attempts: number };
  export function computeTrend(performances: number[]): 'up' | 'flat' | 'down'; // oldest → newest, uses last 3
  export function englishPenalty(priorNotesThisWeek: number): number; // 0 or -2
  export function clamp100(n: number): number;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/skills.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clamp100,
  computePerformance,
  computeTrend,
  englishPenalty,
  initialScores,
  updateScore,
} from './skills';

describe('initialScores', () => {
  it('maps English comfort 1..5 to 30..80 and MBA to 50', () => {
    expect(initialScores(1)).toEqual({ english: 30, communication: 30, mba: 50 });
    expect(initialScores(3)).toEqual({ english: 55, communication: 55, mba: 50 });
    expect(initialScores(5)).toEqual({ english: 80, communication: 80, mba: 50 });
  });
});

describe('computePerformance', () => {
  it('weights test 60% and practice 40%', () => {
    expect(computePerformance(100, 2, 2)).toBe(100);
    expect(computePerformance(50, 1, 2)).toBe(50);
    expect(computePerformance(80, 0, 2)).toBe(48);
  });
  it('treats zero practice questions as neutral 50', () => {
    expect(computePerformance(70, 0, 0)).toBe(62);
  });
});

describe('updateScore', () => {
  it('moves halfway on the first attempt', () => {
    expect(updateScore({ score: 50, attempts: 0 }, 90)).toEqual({ score: 70, attempts: 1 });
  });
  it('moves less as attempts grow, floored at k=0.15', () => {
    // attempts 3 → next is 4 → k = 0.5/sqrt(4) = 0.25
    expect(updateScore({ score: 50, attempts: 3 }, 90)).toEqual({ score: 60, attempts: 4 });
    // attempts 24 → next 25 → k = 0.1 → floored to 0.15 → 50 + 0.15*40 = 56
    expect(updateScore({ score: 50, attempts: 24 }, 90)).toEqual({ score: 56, attempts: 25 });
  });
  it('clamps to 0..100', () => {
    expect(updateScore({ score: 98, attempts: 0 }, 100).score).toBe(99);
    expect(updateScore({ score: 2, attempts: 0 }, 0).score).toBe(1);
  });
});

describe('computeTrend', () => {
  it('is flat with fewer than two data points', () => {
    expect(computeTrend([])).toBe('flat');
    expect(computeTrend([70])).toBe('flat');
  });
  it('compares last of the final three to the first of them', () => {
    expect(computeTrend([40, 50, 60])).toBe('up');
    expect(computeTrend([90, 60, 55])).toBe('down');
    expect(computeTrend([60, 61, 62])).toBe('flat');
    // only the last three count
    expect(computeTrend([10, 80, 80, 79])).toBe('flat');
  });
});

describe('englishPenalty', () => {
  it('penalises repeated weaknesses within a week', () => {
    expect(englishPenalty(0)).toBe(0);
    expect(englishPenalty(1)).toBe(-2);
    expect(englishPenalty(4)).toBe(-2);
  });
});

describe('clamp100', () => {
  it('rounds and clamps', () => {
    expect(clamp100(-3)).toBe(0);
    expect(clamp100(101.2)).toBe(100);
    expect(clamp100(49.5)).toBe(50);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/skills.test.ts`
Expected: FAIL with "Cannot find module './skills'".

- [ ] **Step 3: Implement**

Create `src/domain/skills.ts`:

```ts
export function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** English comfort 1..5 → 30..80. MBA topics always start at 50. */
export function initialScores(englishComfort: number): { english: number; communication: number; mba: number } {
  const c = Math.max(1, Math.min(5, englishComfort));
  const english = clamp100(30 + (c - 1) * 12.5);
  return { english, communication: english, mba: 50 };
}

/** 60% test score, 40% practice accuracy. No practice questions → practice counts as 50. */
export function computePerformance(testScore: number, practiceCorrect: number, practiceTotal: number): number {
  const practice = practiceTotal === 0 ? 50 : (practiceCorrect / practiceTotal) * 100;
  return clamp100(0.6 * testScore + 0.4 * practice);
}

/** new = old + k·(performance − old), k = 0.5/√attempts clamped to [0.15, 0.5]. */
export function updateScore(
  current: { score: number; attempts: number },
  performance: number,
): { score: number; attempts: number } {
  const attempts = current.attempts + 1;
  const k = Math.max(0.15, Math.min(0.5, 0.5 / Math.sqrt(attempts)));
  return { score: clamp100(current.score + k * (performance - current.score)), attempts };
}

/** Trend over the last three performances (oldest → newest). ±3 points is the flat band. */
export function computeTrend(performances: number[]): 'up' | 'flat' | 'down' {
  const recent = performances.slice(-3);
  if (recent.length < 2) return 'flat';
  const delta = recent[recent.length - 1] - recent[0];
  if (delta >= 3) return 'up';
  if (delta <= -3) return 'down';
  return 'flat';
}

/** −2 when the same English weakness was already noted this week. */
export function englishPenalty(priorNotesThisWeek: number): number {
  return priorNotesThisWeek >= 1 ? -2 : 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/domain/skills.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/skills.ts src/domain/skills.test.ts
git commit -m "feat: add pure skill scoring and trend math

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Daily planner (pure)

**Files:**
- Create: `src/domain/planner.ts`, `src/domain/planner.test.ts`

**Interfaces:**
- Consumes: `Domain`, `isLanguageDomain` from `@/db/curriculum`; `PlanItem` from `@/db/schema`; `daysBetween`, `startOfDay` from `@/lib/today`.
- Produces:
  ```ts
  export type PlannerSkill = { id: string; name: string; domain: Domain; courseId: string | null; courseName: string | null; score: number; lastPracticedAt: Date | null };
  export type PlannerDeadline = { courseId: string | null; title: string; kind: 'exam' | 'assignment' | 'class' | 'presentation'; dueAt: Date };
  export function buildDailyPlan(input: { skills: PlannerSkill[]; deadlines: PlannerDeadline[]; todayISO: string }): PlanItem[];
  export function minutesFor(skill: PlannerSkill): number;
  ```

Scoring (document in code): `priority = (100 − score) + 3·max(0, 14 − daysToNearestCourseDeadline) + 1.5·min(14, daysSincePracticed | 14 if never) − 50·practicedToday`. Output = top 2 MBA skills + top 1 language skill, MBA first, ordered by priority. If the student has no language skills, return top 3 MBA. Reason precedence: deadline within 14 days → "not practiced in N days" (N ≥ 7) → "Daily English practice" → "Your weakest <Course> topic" (only when it is the lowest score in its course) → "<Course> · N% mastery".

- [ ] **Step 1: Write the failing tests**

Create `src/domain/planner.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/planner.test.ts`
Expected: FAIL with "Cannot find module './planner'".

- [ ] **Step 3: Implement**

Create `src/domain/planner.ts`:

```ts
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

  // The reason names the dominant factor: an imminent deadline, then staleness, then weakness.
  let reason: string;
  if (nearest && deadlineScore > 0 && deadlineScore >= staleScore) {
    reason = `${nearest.dl.title} in ${nearest.days} day${nearest.days === 1 ? '' : 's'}`;
  } else if (skill.lastPracticedAt && staleDays >= 7) {
    reason = `Not practiced in ${daysSince} days`;
  } else if (isLanguageDomain(skill.domain)) {
    reason = 'Daily English practice';
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/domain/planner.test.ts`
Expected: PASS (7 tests). If the stale test fails on the reason string, check that `daysSince` for `2026-08-20` from `2026-09-07` is 18.

- [ ] **Step 5: Commit**

```bash
git add src/domain/planner.ts src/domain/planner.test.ts
git commit -m "feat: add deterministic daily planner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Session state machine (pure)

**Files:**
- Create: `src/domain/session.ts`, `src/domain/session.test.ts`
- Modify: `src/db/schema.ts` (type `phaseState` as `SessionState`)

**Interfaces:**
- Produces:
  ```ts
  export type Phase = 'learn' | 'practice' | 'explain' | 'test' | 'feedback' | 'done';
  export type EnglishNote = { skill: string; note: string };
  export type SessionState = {
    phase: Phase;
    learn: { followUpUsed: boolean };
    practice: { questions: string[]; answers: string[]; correct: number };
    explain: { conceptGaps: string[]; englishNotes: EnglishNote[] };
    test: { questions: string[]; answers: string[]; score: number | null; mistakes: string[] };
    feedback: { summary: string | null; selfConfidence: number | null };
  };
  export type SessionEvent =
    | { type: 'start' }
    | { type: 'learn.followup'; question: string }
    | { type: 'learn.done' }
    | { type: 'practice.answer'; answer: string }
    | { type: 'explain.submit'; text: string }
    | { type: 'test.answer'; answer: string }
    | { type: 'feedback.confirm'; selfConfidence: number };
  export type Effect =
    | { kind: 'explain-topic' }
    | { kind: 'answer-followup'; question: string }
    | { kind: 'ask-practice'; index: number }
    | { kind: 'grade-practice'; index: number; answer: string }
    | { kind: 'critique-explanation'; text: string }
    | { kind: 'generate-test' }
    | { kind: 'grade-test' }
    | { kind: 'write-feedback' }
    | { kind: 'finalize' };
  export type EffectResult =
    | { kind: 'explanation'; text: string }
    | { kind: 'followup-answer'; text: string }
    | { kind: 'practice-question'; question: string }
    | { kind: 'practice-grade'; isCorrect: boolean; feedback: string }
    | { kind: 'critique'; critique: string; conceptGaps: string[]; englishNotes: EnglishNote[] }
    | { kind: 'test-questions'; questions: string[] }
    | { kind: 'test-grade'; score: number; mistakes: string[] }
    | { kind: 'feedback'; summary: string }
    | { kind: 'finalized' };
  export const PRACTICE_COUNT = 2; export const TEST_COUNT = 3;
  export function initialState(): SessionState;
  export function next(state: SessionState, event: SessionEvent): { state: SessionState; effects: Effect[] }; // throws InvalidTransition
  export function apply(state: SessionState, result: EffectResult): SessionState;
  export class InvalidTransition extends Error {}
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InvalidTransition, apply, initialState, next, type SessionState } from './session';

describe('session state machine', () => {
  it('starts in learn and asks for an explanation', () => {
    const s = initialState();
    expect(s.phase).toBe('learn');
    const r = next(s, { type: 'start' });
    expect(r.effects).toEqual([{ kind: 'explain-topic' }]);
    expect(r.state.phase).toBe('learn');
  });

  it('allows one follow-up in learn, then refuses a second', () => {
    let s = initialState();
    const r1 = next(s, { type: 'learn.followup', question: 'Why beta?' });
    expect(r1.effects).toEqual([{ kind: 'answer-followup', question: 'Why beta?' }]);
    s = r1.state;
    expect(s.learn.followUpUsed).toBe(true);
    expect(() => next(s, { type: 'learn.followup', question: 'again' })).toThrow(InvalidTransition);
  });

  it('moves to practice and asks the first question', () => {
    const r = next(initialState(), { type: 'learn.done' });
    expect(r.state.phase).toBe('practice');
    expect(r.effects).toEqual([{ kind: 'ask-practice', index: 0 }]);
    const s = apply(r.state, { kind: 'practice-question', question: 'Q1?' });
    expect(s.practice.questions).toEqual(['Q1?']);
  });

  it('grades the first answer and asks the second; grades the second and moves to explain', () => {
    let s = apply(next(initialState(), { type: 'learn.done' }).state, { kind: 'practice-question', question: 'Q1?' });
    const r1 = next(s, { type: 'practice.answer', answer: 'A1' });
    expect(r1.effects).toEqual([
      { kind: 'grade-practice', index: 0, answer: 'A1' },
      { kind: 'ask-practice', index: 1 },
    ]);
    s = apply(r1.state, { kind: 'practice-grade', isCorrect: true, feedback: 'good' });
    s = apply(s, { kind: 'practice-question', question: 'Q2?' });
    expect(s.practice.answers).toEqual(['A1']);
    expect(s.practice.correct).toBe(1);

    const r2 = next(s, { type: 'practice.answer', answer: 'A2' });
    expect(r2.effects).toEqual([{ kind: 'grade-practice', index: 1, answer: 'A2' }]);
    expect(r2.state.phase).toBe('explain');
    s = apply(r2.state, { kind: 'practice-grade', isCorrect: false, feedback: 'not quite' });
    expect(s.practice.correct).toBe(1);
    expect(s.practice.answers).toEqual(['A1', 'A2']);
  });

  it('critiques the explanation then generates the test', () => {
    const s: SessionState = { ...initialState(), phase: 'explain' };
    const r = next(s, { type: 'explain.submit', text: 'WACC is the blended cost of capital' });
    expect(r.effects).toEqual([
      { kind: 'critique-explanation', text: 'WACC is the blended cost of capital' },
      { kind: 'generate-test' },
    ]);
    expect(r.state.phase).toBe('test');
    let s2 = apply(r.state, {
      kind: 'critique',
      critique: 'Clear but missing tax shield.',
      conceptGaps: ['tax shield'],
      englishNotes: [{ skill: 'Articles', note: 'Use "the" before WACC' }],
    });
    s2 = apply(s2, { kind: 'test-questions', questions: ['T1', 'T2', 'T3'] });
    expect(s2.explain.conceptGaps).toEqual(['tax shield']);
    expect(s2.test.questions).toHaveLength(3);
  });

  it('collects three test answers, then grades and writes feedback', () => {
    let s: SessionState = { ...initialState(), phase: 'test', test: { questions: ['T1', 'T2', 'T3'], answers: [], score: null, mistakes: [] } };
    s = next(s, { type: 'test.answer', answer: 'a' }).state;
    const r2 = next(s, { type: 'test.answer', answer: 'b' });
    expect(r2.effects).toEqual([]);
    s = r2.state;
    const r3 = next(s, { type: 'test.answer', answer: 'c' });
    expect(r3.effects).toEqual([{ kind: 'grade-test' }, { kind: 'write-feedback' }]);
    expect(r3.state.phase).toBe('feedback');
    s = apply(r3.state, { kind: 'test-grade', score: 67, mistakes: ['confused WACC with cost of equity'] });
    s = apply(s, { kind: 'feedback', summary: 'Solid grasp; revisit tax shield.' });
    expect(s.test.score).toBe(67);
    expect(s.feedback.summary).toBe('Solid grasp; revisit tax shield.');
  });

  it('finalizes on confidence confirmation', () => {
    const s: SessionState = { ...initialState(), phase: 'feedback' };
    const r = next(s, { type: 'feedback.confirm', selfConfidence: 4 });
    expect(r.state.phase).toBe('done');
    expect(r.state.feedback.selfConfidence).toBe(4);
    expect(r.effects).toEqual([{ kind: 'finalize' }]);
  });

  it('rejects events from the wrong phase', () => {
    expect(() => next(initialState(), { type: 'test.answer', answer: 'x' })).toThrow(InvalidTransition);
    const done: SessionState = { ...initialState(), phase: 'done' };
    expect(() => next(done, { type: 'start' })).toThrow(InvalidTransition);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/session.test.ts`
Expected: FAIL with "Cannot find module './session'".

- [ ] **Step 3: Implement**

Create `src/domain/session.ts`:

```ts
export type Phase = 'learn' | 'practice' | 'explain' | 'test' | 'feedback' | 'done';

export type EnglishNote = { skill: string; note: string };

export type SessionState = {
  phase: Phase;
  learn: { followUpUsed: boolean };
  practice: { questions: string[]; answers: string[]; correct: number };
  explain: { conceptGaps: string[]; englishNotes: EnglishNote[] };
  test: { questions: string[]; answers: string[]; score: number | null; mistakes: string[] };
  feedback: { summary: string | null; selfConfidence: number | null };
};

export type SessionEvent =
  | { type: 'start' }
  | { type: 'learn.followup'; question: string }
  | { type: 'learn.done' }
  | { type: 'practice.answer'; answer: string }
  | { type: 'explain.submit'; text: string }
  | { type: 'test.answer'; answer: string }
  | { type: 'feedback.confirm'; selfConfidence: number };

export type Effect =
  | { kind: 'explain-topic' }
  | { kind: 'answer-followup'; question: string }
  | { kind: 'ask-practice'; index: number }
  | { kind: 'grade-practice'; index: number; answer: string }
  | { kind: 'critique-explanation'; text: string }
  | { kind: 'generate-test' }
  | { kind: 'grade-test' }
  | { kind: 'write-feedback' }
  | { kind: 'finalize' };

export type EffectResult =
  | { kind: 'explanation'; text: string }
  | { kind: 'followup-answer'; text: string }
  | { kind: 'practice-question'; question: string }
  | { kind: 'practice-grade'; isCorrect: boolean; feedback: string }
  | { kind: 'critique'; critique: string; conceptGaps: string[]; englishNotes: EnglishNote[] }
  | { kind: 'test-questions'; questions: string[] }
  | { kind: 'test-grade'; score: number; mistakes: string[] }
  | { kind: 'feedback'; summary: string }
  | { kind: 'finalized' };

export const PRACTICE_COUNT = 2;
export const TEST_COUNT = 3;

export class InvalidTransition extends Error {
  constructor(phase: Phase, event: SessionEvent['type']) {
    super(`Event "${event}" is not valid in phase "${phase}"`);
    this.name = 'InvalidTransition';
  }
}

export function initialState(): SessionState {
  return {
    phase: 'learn',
    learn: { followUpUsed: false },
    practice: { questions: [], answers: [], correct: 0 },
    explain: { conceptGaps: [], englishNotes: [] },
    test: { questions: [], answers: [], score: null, mistakes: [] },
    feedback: { summary: null, selfConfidence: null },
  };
}

export function next(state: SessionState, event: SessionEvent): { state: SessionState; effects: Effect[] } {
  const fail = () => new InvalidTransition(state.phase, event.type);

  switch (event.type) {
    case 'start':
      if (state.phase !== 'learn') throw fail();
      return { state, effects: [{ kind: 'explain-topic' }] };

    case 'learn.followup':
      if (state.phase !== 'learn' || state.learn.followUpUsed) throw fail();
      return {
        state: { ...state, learn: { followUpUsed: true } },
        effects: [{ kind: 'answer-followup', question: event.question }],
      };

    case 'learn.done':
      if (state.phase !== 'learn') throw fail();
      return { state: { ...state, phase: 'practice' }, effects: [{ kind: 'ask-practice', index: 0 }] };

    case 'practice.answer': {
      if (state.phase !== 'practice') throw fail();
      const index = state.practice.answers.length;
      if (index >= state.practice.questions.length) throw fail();
      const isLast = index === PRACTICE_COUNT - 1;
      const effects: Effect[] = [{ kind: 'grade-practice', index, answer: event.answer }];
      if (!isLast) effects.push({ kind: 'ask-practice', index: index + 1 });
      return {
        state: {
          ...state,
          phase: isLast ? 'explain' : 'practice',
          practice: { ...state.practice, answers: [...state.practice.answers, event.answer] },
        },
        effects,
      };
    }

    case 'explain.submit':
      if (state.phase !== 'explain') throw fail();
      return {
        state: { ...state, phase: 'test' },
        effects: [{ kind: 'critique-explanation', text: event.text }, { kind: 'generate-test' }],
      };

    case 'test.answer': {
      if (state.phase !== 'test') throw fail();
      const answers = [...state.test.answers, event.answer];
      if (answers.length > TEST_COUNT) throw fail();
      const complete = answers.length === TEST_COUNT;
      return {
        state: { ...state, phase: complete ? 'feedback' : 'test', test: { ...state.test, answers } },
        effects: complete ? [{ kind: 'grade-test' }, { kind: 'write-feedback' }] : [],
      };
    }

    case 'feedback.confirm':
      if (state.phase !== 'feedback') throw fail();
      return {
        state: { ...state, phase: 'done', feedback: { ...state.feedback, selfConfidence: event.selfConfidence } },
        effects: [{ kind: 'finalize' }],
      };
  }
}

export function apply(state: SessionState, result: EffectResult): SessionState {
  switch (result.kind) {
    case 'explanation':
    case 'followup-answer':
    case 'finalized':
      return state;
    case 'practice-question':
      return { ...state, practice: { ...state.practice, questions: [...state.practice.questions, result.question] } };
    case 'practice-grade':
      return {
        ...state,
        practice: { ...state.practice, correct: state.practice.correct + (result.isCorrect ? 1 : 0) },
      };
    case 'critique':
      return { ...state, explain: { conceptGaps: result.conceptGaps, englishNotes: result.englishNotes } };
    case 'test-questions':
      return { ...state, test: { ...state.test, questions: result.questions } };
    case 'test-grade':
      return { ...state, test: { ...state.test, score: result.score, mistakes: result.mistakes } };
    case 'feedback':
      return { ...state, feedback: { ...state.feedback, summary: result.summary } };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/domain/session.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type the JSON column**

In `src/db/schema.ts`, add `import type { SessionState } from '@/domain/session';` and change the `phaseState` column to:

```ts
phaseState: jsonb('phase_state').$type<SessionState>().notNull(),
```

Run: `npm run typecheck` — Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/domain/session.ts src/domain/session.test.ts src/db/schema.ts
git commit -m "feat: add pure focus-session state machine

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: AI router, schemas, prompts, and phase runners

**Files:**
- Create: `src/ai/router.ts`, `src/ai/router.test.ts`, `src/ai/schemas.ts`, `src/ai/context.ts`, `src/ai/prompts.ts`, `src/ai/phases.ts`, `src/ai/phases.test.ts`, `src/ai/test-utils.ts`

**Interfaces:**
- Consumes: `Effect`, `EffectResult`, `SessionState`, `PRACTICE_COUNT`, `TEST_COUNT` from `@/domain/session`; `ENGLISH_SKILLS` from `@/db/curriculum`.
- Produces:
  ```ts
  // router.ts
  export type TaskKind = 'greeting' | 'test-gen' | 'grade' | 'trend' | 'learn' | 'socratic' | 'critique' | 'feedback';
  export type ModelResolver = (kind: TaskKind) => LanguageModel;
  export const MODEL_IDS: { cheap: 'claude-haiku-4-5'; coach: 'claude-sonnet-5' };
  export function isCheapTask(kind: TaskKind): boolean;
  export function createAnthropicResolver(): ModelResolver;
  export function modelFor(kind: TaskKind): LanguageModel;
  export function setModelResolver(r: ModelResolver | null): void;
  // context.ts
  export type CoachContext = { studentName: string; level: 'beginner' | 'mba'; courseName: string | null; topic: string; recentMistakes: string[] };
  export function levelFor(englishComfort: number): 'beginner' | 'mba';
  // phases.ts
  export function runEffect(effect: Effect, ctx: CoachContext, state: SessionState): Promise<EffectResult>;
  // test-utils.ts
  export function mockModel(text: string): LanguageModel;
  export function mockResolver(byKind: Partial<Record<TaskKind, string>>, fallback?: string): ModelResolver;
  ```

- [ ] **Step 1: Write the failing router test**

Create `src/ai/router.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { createAnthropicResolver, isCheapTask, modelFor, setModelResolver } from './router';
import { mockModel } from './test-utils';

afterEach(() => setModelResolver(null));

describe('router', () => {
  it('classifies cheap vs coaching tasks', () => {
    expect(isCheapTask('grade')).toBe(true);
    expect(isCheapTask('test-gen')).toBe(true);
    expect(isCheapTask('greeting')).toBe(true);
    expect(isCheapTask('trend')).toBe(true);
    expect(isCheapTask('socratic')).toBe(false);
    expect(isCheapTask('critique')).toBe(false);
  });

  it('maps cheap tasks to Haiku and coaching tasks to Sonnet', () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const resolve = createAnthropicResolver();
    const modelId = (m: unknown) => (m as { modelId: string }).modelId;
    expect(modelId(resolve('grade'))).toBe('claude-haiku-4-5');
    expect(modelId(resolve('learn'))).toBe('claude-sonnet-5');
  });

  it('lets tests override the resolver', () => {
    const m = mockModel('hi');
    setModelResolver(() => m);
    expect(modelFor('learn')).toBe(m);
  });
});
```

- [ ] **Step 2: Write the test utilities and router**

Create `src/ai/test-utils.ts`:

```ts
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { ModelResolver, TaskKind } from './router';

/** A model that always answers with `text` (JSON string for structured outputs). */
export function mockModel(text: string): LanguageModel {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

export function mockResolver(byKind: Partial<Record<TaskKind, string>>, fallback = 'ok'): ModelResolver {
  return (kind) => mockModel(byKind[kind] ?? fallback);
}
```

Create `src/ai/router.ts`:

```ts
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export type TaskKind = 'greeting' | 'test-gen' | 'grade' | 'trend' | 'learn' | 'socratic' | 'critique' | 'feedback';
export type ModelResolver = (kind: TaskKind) => LanguageModel;

export const MODEL_IDS = { cheap: 'claude-haiku-4-5', coach: 'claude-sonnet-5' } as const;

const CHEAP = new Set<TaskKind>(['greeting', 'test-gen', 'grade', 'trend']);

export function isCheapTask(kind: TaskKind): boolean {
  return CHEAP.has(kind);
}

export function createAnthropicResolver(): ModelResolver {
  return (kind) => anthropic(isCheapTask(kind) ? MODEL_IDS.cheap : MODEL_IDS.coach);
}

let resolver: ModelResolver | null = null;

/** The only way call sites obtain a model. Tests swap the resolver with setModelResolver. */
export function modelFor(kind: TaskKind): LanguageModel {
  if (!resolver) resolver = createAnthropicResolver();
  return resolver(kind);
}

export function setModelResolver(r: ModelResolver | null): void {
  resolver = r;
}
```

- [ ] **Step 3: Run the router test**

Run: `npm test -- src/ai/router.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Write schemas and context**

Create `src/ai/schemas.ts`:

```ts
import { z } from 'zod';
import { ENGLISH_SKILLS } from '@/db/curriculum';

export const practiceGradeSchema = z.object({
  isCorrect: z.boolean(),
  feedback: z.string().max(500),
});

export const critiqueSchema = z.object({
  critique: z.string().max(800),
  conceptGaps: z.array(z.string().max(120)).max(3),
  englishNotes: z
    .array(z.object({ skill: z.enum(ENGLISH_SKILLS), note: z.string().max(160) }))
    .max(2),
});

export const testQuestionsSchema = z.object({
  questions: z.array(z.string().max(300)).length(3),
});

export const testGradeSchema = z.object({
  score: z.number().int().min(0).max(100),
  mistakes: z.array(z.string().max(160)).max(3),
});

export const trendSchema = z.object({
  sentences: z.array(z.string().max(200)).min(1).max(3),
});
```

Create `src/ai/context.ts`:

```ts
export type CoachContext = {
  studentName: string;
  level: 'beginner' | 'mba';
  courseName: string | null;
  topic: string;
  /** Prior observations for this skill, newest first, max 5. */
  recentMistakes: string[];
};

export function levelFor(englishComfort: number): 'beginner' | 'mba' {
  return englishComfort <= 2 ? 'beginner' : 'mba';
}
```

- [ ] **Step 5: Write the prompts**

Create `src/ai/prompts.ts`:

```ts
import { ENGLISH_SKILLS } from '@/db/curriculum';
import type { SessionState } from '@/domain/session';
import type { CoachContext } from './context';

export function coachSystem(ctx: CoachContext): string {
  const language =
    ctx.level === 'beginner'
      ? 'The student is still building English confidence. Use simple English, short sentences, and one idea per sentence. Avoid idioms.'
      : 'Use clear, professional MBA-level English.';
  const weaknesses = ctx.recentMistakes.length
    ? `Known weaknesses on this topic: ${ctx.recentMistakes.join('; ')}.`
    : 'No prior weaknesses recorded for this topic.';
  return [
    `You are ${ctx.studentName}'s personal MBA coach.`,
    `Topic: ${ctx.topic}${ctx.courseName ? ` (course: ${ctx.courseName})` : ''}.`,
    language,
    weaknesses,
    'You coach rather than answer: teach, challenge, correct, and make the student think.',
    'Be concise. Never use emoji. Never mention that you are an AI.',
  ].join('\n');
}

export function explainTopicPrompt(ctx: CoachContext): string {
  return `Explain ${ctx.topic} in under 180 words. Include one concrete business example. End with one sentence on why this matters for an MBA student. Do not ask a question.`;
}

export function followupPrompt(question: string): string {
  return `The student asks a follow-up: "${question}". Answer in under 120 words.`;
}

export function askPracticePrompt(index: number, state: SessionState): string {
  if (index === 0) {
    return 'Ask one Socratic question that tests whether the student understands the core idea of the topic. Return only the question.';
  }
  const prev = state.practice.questions[0] ?? '';
  const answer = state.practice.answers[0] ?? '';
  return `Earlier you asked: "${prev}". The student answered: "${answer}". Now ask one Socratic question that requires applying the topic to a business situation. Return only the question.`;
}

export function gradePracticePrompt(index: number, answer: string, state: SessionState): string {
  const question = state.practice.questions[index] ?? '';
  return `Question: "${question}"\nStudent answer: "${answer}"\nDecide whether the answer shows correct understanding (isCorrect). Write feedback in under 80 words: confirm what is right, then correct or extend one thing. If wrong, give a hint, not the full answer.`;
}

export function critiquePrompt(text: string): string {
  return [
    `The student explained the topic in their own words:\n"""${text}"""`,
    'Write a critique in under 120 words: what is accurate, what is missing or wrong.',
    'List up to 3 conceptGaps as short phrases.',
    `List up to 2 englishNotes only for clear or recurring language errors. Each note names the exact fix. The skill must be one of: ${ENGLISH_SKILLS.join(', ')}. Return an empty list if the English is fine.`,
  ].join('\n');
}

export function generateTestPrompt(state: SessionState): string {
  const gaps = state.explain.conceptGaps.length ? `Target these gaps: ${state.explain.conceptGaps.join('; ')}.` : '';
  return `Write exactly 3 short-answer exam questions on the topic, each answerable in 1-3 sentences. Mix one definition, one calculation-or-reasoning, and one application question. ${gaps}`;
}

export function gradeTestPrompt(state: SessionState): string {
  const pairs = state.test.questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${state.test.answers[i] ?? '(no answer)'}`)
    .join('\n');
  return `${pairs}\nScore the three answers together from 0 to 100. List up to 3 mistakes as short phrases in the form "confused X with Y" or "missed Z". Return an empty list if there are none.`;
}

export function feedbackPrompt(state: SessionState): string {
  const score = state.test.score ?? 0;
  const mistakes = state.test.mistakes.join('; ') || 'none';
  return `The student scored ${score}/100 on the test. Mistakes: ${mistakes}. Practice: ${state.practice.correct}/${state.practice.questions.length} correct. Concept gaps: ${state.explain.conceptGaps.join('; ') || 'none'}.\nWrite a summary in under 80 words, second person: what went well, then the single most important thing to work on next.`;
}
```

- [ ] **Step 6: Write the failing phase tests**

Create `src/ai/phases.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { initialState, type SessionState } from '@/domain/session';
import type { CoachContext } from './context';
import { runEffect } from './phases';
import { setModelResolver, type TaskKind } from './router';
import { mockModel, mockResolver } from './test-utils';

const ctx: CoachContext = { studentName: 'Ansh', level: 'beginner', courseName: 'Finance', topic: 'WACC', recentMistakes: [] };

afterEach(() => setModelResolver(null));

describe('runEffect', () => {
  it('returns an explanation as text', async () => {
    setModelResolver(mockResolver({ learn: 'WACC is the blended cost of capital.' }));
    const r = await runEffect({ kind: 'explain-topic' }, ctx, initialState());
    expect(r).toEqual({ kind: 'explanation', text: 'WACC is the blended cost of capital.' });
  });

  it('parses a test grade and routes it to the grade task', async () => {
    const seen: TaskKind[] = [];
    setModelResolver((kind) => {
      seen.push(kind);
      return mockModel('{"score":67,"mistakes":["confused WACC with cost of equity"]}');
    });
    const state: SessionState = {
      ...initialState(),
      phase: 'feedback',
      test: { questions: ['a', 'b', 'c'], answers: ['1', '2', '3'], score: null, mistakes: [] },
    };
    const r = await runEffect({ kind: 'grade-test' }, ctx, state);
    expect(r).toEqual({ kind: 'test-grade', score: 67, mistakes: ['confused WACC with cost of equity'] });
    expect(seen).toEqual(['grade']);
  });

  it('parses a critique with english notes', async () => {
    setModelResolver(
      mockResolver({
        critique: '{"critique":"Clear.","conceptGaps":["tax shield"],"englishNotes":[{"skill":"Articles","note":"Say \\"the company\\""}]}',
      }),
    );
    const r = await runEffect({ kind: 'critique-explanation', text: 'WACC is cost' }, ctx, initialState());
    expect(r).toEqual({
      kind: 'critique',
      critique: 'Clear.',
      conceptGaps: ['tax shield'],
      englishNotes: [{ skill: 'Articles', note: 'Say "the company"' }],
    });
  });

  it('rejects malformed structured output', async () => {
    setModelResolver(mockResolver({ 'test-gen': '{"questions":["only one"]}' }));
    await expect(runEffect({ kind: 'generate-test' }, ctx, initialState())).rejects.toThrow();
  });

  it('treats finalize as a no-op', async () => {
    const r = await runEffect({ kind: 'finalize' }, ctx, initialState());
    expect(r).toEqual({ kind: 'finalized' });
  });
});
```

- [ ] **Step 7: Run the phase tests to verify they fail**

Run: `npm test -- src/ai/phases.test.ts`
Expected: FAIL with "Cannot find module './phases'".

- [ ] **Step 8: Implement the phase runners**

Create `src/ai/phases.ts`:

```ts
import { generateText, Output } from 'ai';
import type { Effect, EffectResult, SessionState } from '@/domain/session';
import type { CoachContext } from './context';
import {
  askPracticePrompt,
  coachSystem,
  critiquePrompt,
  explainTopicPrompt,
  feedbackPrompt,
  followupPrompt,
  generateTestPrompt,
  gradePracticePrompt,
  gradeTestPrompt,
} from './prompts';
import { modelFor, type TaskKind } from './router';
import { critiqueSchema, practiceGradeSchema, testGradeSchema, testQuestionsSchema } from './schemas';

async function text(kind: TaskKind, ctx: CoachContext, prompt: string): Promise<string> {
  const result = await generateText({ model: modelFor(kind), system: coachSystem(ctx), prompt });
  return result.text.trim();
}

/** Runs one effect from the session state machine as a single model call. */
export async function runEffect(effect: Effect, ctx: CoachContext, state: SessionState): Promise<EffectResult> {
  const system = coachSystem(ctx);

  switch (effect.kind) {
    case 'explain-topic':
      return { kind: 'explanation', text: await text('learn', ctx, explainTopicPrompt(ctx)) };

    case 'answer-followup':
      return { kind: 'followup-answer', text: await text('learn', ctx, followupPrompt(effect.question)) };

    case 'ask-practice':
      return { kind: 'practice-question', question: await text('socratic', ctx, askPracticePrompt(effect.index, state)) };

    case 'grade-practice': {
      const { output } = await generateText({
        model: modelFor('socratic'),
        system,
        prompt: gradePracticePrompt(effect.index, effect.answer, state),
        output: Output.object({ schema: practiceGradeSchema }),
      });
      return { kind: 'practice-grade', isCorrect: output.isCorrect, feedback: output.feedback };
    }

    case 'critique-explanation': {
      const { output } = await generateText({
        model: modelFor('critique'),
        system,
        prompt: critiquePrompt(effect.text),
        output: Output.object({ schema: critiqueSchema }),
      });
      return { kind: 'critique', critique: output.critique, conceptGaps: output.conceptGaps, englishNotes: output.englishNotes };
    }

    case 'generate-test': {
      const { output } = await generateText({
        model: modelFor('test-gen'),
        system,
        prompt: generateTestPrompt(state),
        output: Output.object({ schema: testQuestionsSchema }),
      });
      return { kind: 'test-questions', questions: output.questions };
    }

    case 'grade-test': {
      const { output } = await generateText({
        model: modelFor('grade'),
        system,
        prompt: gradeTestPrompt(state),
        output: Output.object({ schema: testGradeSchema }),
      });
      return { kind: 'test-grade', score: output.score, mistakes: output.mistakes };
    }

    case 'write-feedback':
      return { kind: 'feedback', summary: await text('feedback', ctx, feedbackPrompt(state)) };

    case 'finalize':
      return { kind: 'finalized' };
  }
}
```

- [ ] **Step 9: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all suites PASS; typecheck clean. If `Output.object` complains about the Zod 4 schema type, upgrade `ai` to the latest 7.x (`npm i ai@latest`) before changing code.

- [ ] **Step 10: Commit**

```bash
git add src/ai
git commit -m "feat: add AI router, structured-output schemas, and session phase runners

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Data access layer

**Files:**
- Create: `src/db/queries.ts`, `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: schema tables and types from `@/db/schema`; `COURSES`, `ENGLISH_SKILLS`, `COMMUNICATION_SKILLS` from `@/db/curriculum`; `initialScores` from `@/domain/skills`; `initialState` from `@/domain/session`.
- Produces (all `async`, all in `src/db/queries.ts`):
  ```ts
  export type OnboardingInput = { name: string; program: string; semester: string; courseSlugs: string[]; englishComfort: number; academicGoals: string; careerGoals: string; preferredStudyTimes: string[]; deadlines: { title: string; courseSlug: string | null; kind: Deadline['kind']; dueAt: Date }[] };
  export function getStudent(): Promise<Student | null>;
  export function createStudent(input: OnboardingInput): Promise<Student>;
  export type SkillWithCourse = Skill & { courseName: string | null };
  export function getSkills(studentId: string): Promise<SkillWithCourse[]>;
  export function getCourses(studentId: string): Promise<Course[]>;
  export function getDeadlines(studentId: string): Promise<Deadline[]>;         // upcoming, soonest first
  export function getDailyPlan(studentId: string, date: string): Promise<DailyPlan | null>;
  export function saveDailyPlan(studentId: string, date: string, greeting: string, items: PlanItem[]): Promise<DailyPlan>;
  export function createSession(skillId: string): Promise<Session>;
  export type LoadedSession = { session: Session; skill: Skill; course: Course | null; student: Student; messages: SessionMessage[] };
  export function loadSession(id: string): Promise<LoadedSession | null>;
  export type NewMessage = { phase: SessionPhase; role: 'coach' | 'student'; content: string };
  export function saveSessionStep(id: string, state: SessionState, messages: NewMessage[]): Promise<void>;
  export function getSessionMessages(id: string): Promise<SessionMessage[]>;
  export function getSkillObservations(skillId: string, limit: number): Promise<SkillObservation[]>; // newest first
  export function getSkillPerformances(skillId: string, limit: number): Promise<number[]>;          // oldest → newest
  export function countEnglishNotesSince(skillId: string, since: Date): Promise<number>;
  export function getEnglishSkillByName(studentId: string, name: string): Promise<Skill | null>;
  export type SessionOutcomeWrite = { sessionId: string; skillId: string; studentId: string; performance: number; score: number; attempts: number; trend: Skill['trend']; confidence: number; selfConfidence: number; summary: string; mistakes: string[]; englishNotes: { skill: string; note: string }[]; now: Date };
  export function applySessionOutcome(w: SessionOutcomeWrite): Promise<void>;
  export function getCompletedSkillIdsOn(studentId: string, dateISO: string): Promise<Set<string>>;
  export type RecentSession = { id: string; skillName: string; courseName: string | null; performance: number | null; endedAt: Date | null };
  export function getRecentSessions(studentId: string, limit: number): Promise<RecentSession[]>;
  export type ObservationWithSkill = SkillObservation & { skillName: string; domain: Domain };
  export function getObservationsSince(studentId: string, since: Date): Promise<ObservationWithSkill[]>;
  ```
  And in `src/lib/format.ts`: `formatDate(d: Date): string` ("Sep 9"), `relativeDays(days: number): string` ("today" / "tomorrow" / "in 3 days" / "3 days ago").

- [ ] **Step 1: Write the failing format test**

Create `src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDate, relativeDays } from './format';

describe('format', () => {
  it('formats a date as short month and day', () => {
    expect(formatDate(new Date('2026-09-09T12:00:00Z'))).toBe('Sep 9');
  });
  it('describes relative days', () => {
    expect(relativeDays(0)).toBe('today');
    expect(relativeDays(1)).toBe('tomorrow');
    expect(relativeDays(3)).toBe('in 3 days');
    expect(relativeDays(-1)).toBe('yesterday');
    expect(relativeDays(-4)).toBe('4 days ago');
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `npm test -- src/lib/format.test.ts` — Expected: FAIL "Cannot find module './format'".

Create `src/lib/format.ts`:

```ts
const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function formatDate(d: Date): string {
  return short.format(d);
}

export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1) return `in ${days} days`;
  return `${-days} days ago`;
}
```

Run: `npm test -- src/lib/format.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 3: Write the queries**

Create `src/db/queries.ts`:

```ts
import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { COMMUNICATION_SKILLS, COURSES, ENGLISH_SKILLS, type Domain } from './curriculum';
import { db } from './client';
import { initialState, type SessionState } from '@/domain/session';
import { initialScores } from '@/domain/skills';
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
  const [row] = await db.insert(sessions).values({ skillId, phaseState: initialState() }).returning();
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

export async function countEnglishNotesSince(skillId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(skillObservations)
    .where(and(eq(skillObservations.skillId, skillId), eq(skillObservations.kind, 'english_note'), gte(skillObservations.createdAt, since)));
  return rows[0]?.n ?? 0;
}

export async function getEnglishSkillByName(studentId: string, name: string): Promise<Skill | null> {
  const rows = await db
    .select()
    .from(skills)
    .where(and(eq(skills.studentId, studentId), eq(skills.domain, 'english'), eq(skills.name, name)))
    .limit(1);
  return rows[0] ?? null;
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
  /** English score nudge per note, already computed by the caller (0 or -2). */
  englishPenalties: number[];
  now: Date;
};

export async function applySessionOutcome(w: SessionOutcomeWrite): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ endedAt: w.now, performance: w.performance, selfConfidence: w.selfConfidence, summary: w.summary, phase: 'done' })
      .where(eq(sessions.id, w.sessionId));

    await tx
      .update(skills)
      .set({ score: w.score, attempts: w.attempts, trend: w.trend, confidence: w.confidence, lastPracticedAt: w.now })
      .where(eq(skills.id, w.skillId));

    if (w.mistakes.length) {
      await tx.insert(skillObservations).values(
        w.mistakes.map((note) => ({ skillId: w.skillId, sessionId: w.sessionId, kind: 'mistake' as const, note })),
      );
    }

    for (let i = 0; i < w.englishNotes.length; i++) {
      const note = w.englishNotes[i];
      const englishSkill = await getEnglishSkillByName(w.studentId, note.skill);
      if (!englishSkill) continue;
      await tx.insert(skillObservations).values({ skillId: englishSkill.id, sessionId: w.sessionId, kind: 'english_note', note: note.note });
      const penalty = w.englishPenalties[i] ?? 0;
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
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. Common fix: if Drizzle complains about `phaseState: initialState()` type, cast with `initialState() as SessionState`.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add data access layer for student, plans, sessions, and outcomes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Responsive app shell and navigation

**Files:**
- Create: `src/components/shell/app-shell.tsx`, `src/components/shell/nav-links.tsx`, `src/app/(shell)/layout.tsx`, `src/app/(shell)/settings/page.tsx`, `src/app/(shell)/courses/page.tsx` (placeholder replaced in Task 16), `src/app/(shell)/progress/page.tsx` (placeholder replaced in Task 15)
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Move: `src/app/page.tsx` → `src/app/(shell)/page.tsx` (rewritten in Task 11)

**Interfaces:**
- Produces: `AppShell({ children })` server component; `NavLinks({ orientation: 'side' | 'bottom' })` client component. Nav items: Dashboard `/`, Courses `/courses`, Progress `/progress`, Settings `/settings`.

- [ ] **Step 1: Root layout and global styles**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'MBA Coach',
  description: 'Your personal MBA coach: knows what you are studying, where you struggle, and what to do next.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
```

Keep the shadcn-generated `src/app/globals.css` as is. Append to the end of it:

```css
/* Calm academic palette: slightly warm neutral ground, ink-blue primary. */
:root {
  --background: oklch(0.985 0.003 80);
  --primary: oklch(0.38 0.09 260);
  --primary-foreground: oklch(0.98 0 0);
}
```

- [ ] **Step 2: Nav links (client)**

Create `src/components/shell/nav-links.tsx`:

```tsx
'use client';

import { BarChart3, BookOpen, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/courses', label: 'Courses', icon: BookOpen },
  { href: '/progress', label: 'Progress', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function NavLinks({ orientation }: { orientation: 'side' | 'bottom' }) {
  const pathname = usePathname();
  return (
    <nav className={cn(orientation === 'side' ? 'flex flex-col gap-1' : 'grid grid-cols-4')} aria-label="Main">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md text-sm transition-colors',
              orientation === 'side' ? 'px-3 py-2' : 'flex-col gap-1 py-2 text-xs',
              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: App shell**

Create `src/components/shell/app-shell.tsx`:

```tsx
import { NavLinks } from './nav-links';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
      <aside className="hidden w-56 shrink-0 border-r border-border p-4 md:block">
        <div className="mb-6 px-3 text-lg font-semibold tracking-tight">MBA Coach</div>
        <NavLinks orientation="side" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur md:hidden">
          <NavLinks orientation="bottom" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Shell route group and placeholder pages**

Create `src/app/(shell)/layout.tsx`:

```tsx
import { AppShell } from '@/components/shell/app-shell';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

Move the scaffolded home page: `git mv src/app/page.tsx "src/app/(shell)/page.tsx"` and replace its content with:

```tsx
export default function DashboardPage() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

Create `src/app/(shell)/courses/page.tsx`, `src/app/(shell)/progress/page.tsx`, `src/app/(shell)/settings/page.tsx`, each with the same shape and its own heading (`Courses`, `Progress`, `Settings`):

```tsx
export default function CoursesPage() {
  return <h1 className="text-2xl font-semibold">Courses</h1>;
}
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev` (use the Browser pane / preview tool, not a bare Bash background). Open `http://localhost:3000`.
Expected: sidebar with four links on desktop; resize to mobile preset → bottom nav with four items, no horizontal scroll; clicking each link highlights it.

- [ ] **Step 6: Commit**

```bash
git add -A src/app src/components/shell
git commit -m "feat: add responsive app shell with sidebar and bottom navigation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Onboarding

**Files:**
- Create: `src/app/onboarding/page.tsx`, `src/app/onboarding/actions.ts`, `src/app/onboarding/schema.ts`, `src/app/onboarding/schema.test.ts`, `src/components/onboarding/onboarding-form.tsx`

**Interfaces:**
- Consumes: `createStudent`, `getStudent`, `OnboardingInput` from `@/db/queries`; `COURSES` from `@/db/curriculum`.
- Produces: `parseOnboarding(form: FormData): { ok: true; value: OnboardingInput } | { ok: false; error: string }` in `schema.ts`; server action `createStudentAction(prev: ActionState, form: FormData): Promise<ActionState>` where `ActionState = { error?: string }`.

- [ ] **Step 1: Write the failing schema test**

Create `src/app/onboarding/schema.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/app/onboarding/schema.test.ts`
Expected: FAIL "Cannot find module './schema'".

- [ ] **Step 3: Implement the schema**

Create `src/app/onboarding/schema.ts`:

```ts
import { z } from 'zod';
import { COURSES } from '@/db/curriculum';
import type { OnboardingInput } from '@/db/queries';

const SLUGS = COURSES.map((c) => c.slug) as [string, ...string[]];
export const MAX_DEADLINES = 3;
export const STUDY_TIMES = ['morning', 'afternoon', 'evening', 'night'] as const;

const deadlineSchema = z.object({
  title: z.string().trim().min(1).max(80),
  courseSlug: z.enum(SLUGS).nullable(),
  kind: z.enum(['exam', 'assignment', 'class', 'presentation']),
  dueAt: z.coerce.date(),
});

const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  program: z.string().trim().min(1, 'Program is required').max(80),
  semester: z.string().trim().min(1, 'Semester is required').max(40),
  courseSlugs: z.array(z.enum(SLUGS)).min(1, 'Pick at least one course'),
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/app/onboarding/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Server action**

Create `src/app/onboarding/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createStudent, getStudent } from '@/db/queries';
import { parseOnboarding } from './schema';

export type ActionState = { error?: string };

export async function createStudentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (await getStudent()) redirect('/');
  const parsed = parseOnboarding(form);
  if (!parsed.ok) return { error: parsed.error };
  await createStudent(parsed.value);
  redirect('/');
}
```

- [ ] **Step 6: Form component (client)**

Create `src/components/onboarding/onboarding-form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { createStudentAction, type ActionState } from '@/app/onboarding/actions';
import { MAX_DEADLINES, STUDY_TIMES } from '@/app/onboarding/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COURSES } from '@/db/curriculum';

const COMFORT = [
  { value: 1, label: 'I struggle to follow lectures' },
  { value: 2, label: 'I understand, but speaking and writing are hard' },
  { value: 3, label: 'Comfortable, with frequent small mistakes' },
  { value: 4, label: 'Confident, occasional mistakes' },
  { value: 5, label: 'Fluent' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function OnboardingForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createStudentAction, {});

  return (
    <form action={action} className="grid gap-6">
      <Section title="About you">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={60} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="program">MBA program</Label>
            <Input id="program" name="program" placeholder="Full-time MBA" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="semester">Current semester</Label>
            <Input id="semester" name="semester" placeholder="Semester 1" required />
          </div>
        </div>
      </Section>

      <Section title="Courses this semester">
        <div className="grid gap-2 sm:grid-cols-2">
          {COURSES.map((c) => (
            <label key={c.slug} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="checkbox" name="courses" value={c.slug} className="size-4 accent-primary" />
              <span className="font-medium">{c.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{c.topics.length} topics</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="English comfort">
        <div className="grid gap-2">
          {COMFORT.map((c) => (
            <label key={c.value} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="radio" name="englishComfort" value={c.value} defaultChecked={c.value === 3} className="accent-primary" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Goals">
        <div className="grid gap-2">
          <Label htmlFor="academicGoals">Academic goals</Label>
          <Textarea id="academicGoals" name="academicGoals" rows={2} maxLength={300} placeholder="Top quartile in Finance; lead a case discussion" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="careerGoals">Career goals</Label>
          <Textarea id="careerGoals" name="careerGoals" rows={2} maxLength={300} placeholder="Strategy consulting" />
        </div>
        <div className="grid gap-2">
          <Label>When do you usually study?</Label>
          <div className="flex flex-wrap gap-2">
            {STUDY_TIMES.map((t) => (
              <label key={t} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm capitalize">
                <input type="checkbox" name="studyTimes" value={t} className="accent-primary" />
                {t}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Upcoming deadlines (optional)">
        {Array.from({ length: MAX_DEADLINES }, (_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <Input name={`deadline.title.${i}`} placeholder="Finance midterm" aria-label={`Deadline ${i + 1} title`} />
            <select name={`deadline.course.${i}`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" aria-label={`Deadline ${i + 1} course`}>
              <option value="">No course</option>
              {COURSES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name={`deadline.kind.${i}`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" aria-label={`Deadline ${i + 1} kind`}>
              <option value="exam">Exam</option>
              <option value="assignment">Assignment</option>
              <option value="class">Class</option>
              <option value="presentation">Presentation</option>
            </select>
            <Input type="date" name={`deadline.date.${i}`} aria-label={`Deadline ${i + 1} date`} />
          </div>
        ))}
      </Section>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? 'Setting up your coach…' : 'Build my dashboard'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Onboarding page and dashboard redirect**

Create `src/app/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { getStudent } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (await getStudent()) redirect('/');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your MBA coach</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Five minutes now. Your coach uses this to decide what you should work on each day.
      </p>
      <OnboardingForm />
    </main>
  );
}
```

Replace `src/app/(shell)/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { getStudent } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');
  return <h1 className="text-2xl font-semibold">Good morning, {student.name}.</h1>;
}
```

- [ ] **Step 8: Verify end to end**

Run `npm run db:reset` (needs `.env.local`), then `npm run dev`. Open `/`.
Expected: redirected to `/onboarding`; submit with two courses and one deadline → lands on `/` greeting you by name. In Supabase Table Editor (or `psql`), `skills` has one row per topic of each picked course plus 7 English and 2 Communication rows; `deadlines` has one row.

- [ ] **Step 9: Commit**

```bash
git add src/app/onboarding src/app/\(shell\)/page.tsx src/components/onboarding
git commit -m "feat: add onboarding that seeds the student's skill graph

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Dashboard with today's plan

**Files:**
- Create: `src/ai/planner-text.ts`, `src/ai/planner-text.test.ts`, `src/domain/summary.ts`, `src/domain/summary.test.ts`, `src/lib/plan.ts`, `src/app/(shell)/actions.ts`, `src/components/skill-bar.tsx`, `src/components/dashboard/today-plan.tsx`, `src/components/dashboard/deadline-list.tsx`, `src/components/dashboard/skill-snapshot.tsx`, `src/components/dashboard/recent-sessions.tsx`
- Modify: `src/app/(shell)/page.tsx`

**Interfaces:**
- Consumes: `buildDailyPlan` (`@/domain/planner`), queries from Task 8, `modelFor` + `trendSchema` (Task 7), `formatDate`/`relativeDays` (`@/lib/format`), `todayISO`/`daysBetween` (`@/lib/today`).
- Produces:
  ```ts
  // planner-text.ts
  export type GreetingInput = { name: string; items: PlanItem[]; deadlines: { title: string; dueAt: Date }[]; todayISO: string };
  export function fallbackGreeting(input: GreetingInput): string;
  export function generateGreeting(input: GreetingInput): Promise<string>;   // Haiku, falls back on error
  export type TrendInput = { skills: { name: string; domain: Domain; score: number; trend: 'up' | 'flat' | 'down' }[]; observations: { skillName: string; kind: string; note: string }[] };
  export function fallbackTrend(input: TrendInput): string[];
  export function generateTrendSentences(input: TrendInput): Promise<string[]>; // Haiku, falls back on error
  // summary.ts
  export type SkillGroup = { label: string; domain: Domain; score: number; count: number };
  export function summarizeSkills(skills: { domain: Domain; courseName: string | null; score: number }[]): SkillGroup[];
  // plan.ts
  export type TodayPlan = { date: string; greeting: string; items: (PlanItem & { done: boolean })[] };
  export function getOrCreateTodayPlan(student: Student): Promise<TodayPlan>;
  // actions.ts
  export function startSessionAction(skillId: string, form: FormData): Promise<void>; // creates a session, redirects to /session/[id]
  // skill-bar.tsx
  export function SkillBar(props: { label: string; score: number; trend?: 'up' | 'flat' | 'down'; meta?: string }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { summarizeSkills } from './summary';

describe('summarizeSkills', () => {
  it('averages per course, then English and Communication', () => {
    const groups = summarizeSkills([
      { domain: 'strategy', courseName: 'Strategy', score: 80 },
      { domain: 'finance', courseName: 'Finance', score: 40 },
      { domain: 'finance', courseName: 'Finance', score: 61 },
      { domain: 'english', courseName: null, score: 50 },
      { domain: 'communication', courseName: null, score: 70 },
    ]);
    expect(groups).toEqual([
      { label: 'Finance', domain: 'finance', score: 51, count: 2 },
      { label: 'Strategy', domain: 'strategy', score: 80, count: 1 },
      { label: 'English', domain: 'english', score: 50, count: 1 },
      { label: 'Communication', domain: 'communication', score: 70, count: 1 },
    ]);
  });
});
```

Create `src/ai/planner-text.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { fallbackGreeting, fallbackTrend, generateGreeting, generateTrendSentences } from './planner-text';
import { setModelResolver } from './router';
import { mockResolver } from './test-utils';

afterEach(() => setModelResolver(null));

const input = {
  name: 'Ansh',
  todayISO: '2026-09-07',
  items: [
    { skillId: '1', skillName: 'WACC', courseName: 'Finance', domain: 'finance' as const, minutes: 35, reason: 'Finance exam in 2 days' },
    { skillId: '2', skillName: 'Articles', courseName: null, domain: 'english' as const, minutes: 10, reason: 'Daily English practice' },
  ],
  deadlines: [{ title: 'Finance exam', dueAt: new Date('2026-09-09T00:00:00Z') }],
};

describe('greeting', () => {
  it('has a deterministic fallback that names the first task and next deadline', () => {
    expect(fallbackGreeting(input)).toBe('Good morning, Ansh. Finance exam is in 2 days. Start with WACC today.');
  });

  it('uses the model when available', async () => {
    setModelResolver(mockResolver({ greeting: 'Good morning. Finance is close; WACC first.' }));
    expect(await generateGreeting(input)).toBe('Good morning. Finance is close; WACC first.');
  });

  it('falls back when the model fails', async () => {
    setModelResolver(() => {
      throw new Error('no key');
    });
    expect(await generateGreeting(input)).toBe(fallbackGreeting(input));
  });
});

describe('trend sentences', () => {
  const trendInput = {
    skills: [
      { name: 'WACC', domain: 'finance' as const, score: 45, trend: 'up' as const },
      { name: 'Speaking', domain: 'english' as const, score: 30, trend: 'flat' as const },
    ],
    observations: [{ skillName: 'Articles', kind: 'english_note', note: 'Missing "the"' }],
  };

  it('falls back to naming the weakest skill', () => {
    expect(fallbackTrend(trendInput)).toEqual(['Your biggest current weakness is Speaking.']);
  });

  it('parses model sentences', async () => {
    setModelResolver(mockResolver({ trend: '{"sentences":["WACC is improving.","Articles need attention."]}' }));
    expect(await generateTrendSentences(trendInput)).toEqual(['WACC is improving.', 'Articles need attention.']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/domain/summary.test.ts src/ai/planner-text.test.ts`
Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement summary and planner text**

Create `src/domain/summary.ts`:

```ts
import { isLanguageDomain, type Domain } from '@/db/curriculum';

export type SkillGroup = { label: string; domain: Domain; score: number; count: number };

/** Average score per course (alphabetical), then English, then Communication. */
export function summarizeSkills(skills: { domain: Domain; courseName: string | null; score: number }[]): SkillGroup[] {
  const acc = new Map<string, { domain: Domain; total: number; count: number }>();
  for (const s of skills) {
    const label = isLanguageDomain(s.domain) ? (s.domain === 'english' ? 'English' : 'Communication') : (s.courseName ?? 'Other');
    const cur = acc.get(label) ?? { domain: s.domain, total: 0, count: 0 };
    acc.set(label, { domain: s.domain, total: cur.total + s.score, count: cur.count + 1 });
  }
  const groups = [...acc.entries()].map(([label, g]) => ({ label, domain: g.domain, score: Math.round(g.total / g.count), count: g.count }));
  const rank = (g: SkillGroup) => (g.domain === 'english' ? 1 : g.domain === 'communication' ? 2 : 0);
  return groups.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}
```

Create `src/ai/planner-text.ts`:

```ts
import { generateText, Output } from 'ai';
import type { Domain } from '@/db/curriculum';
import type { PlanItem } from '@/db/schema';
import { relativeDays } from '@/lib/format';
import { daysBetween } from '@/lib/today';
import { modelFor } from './router';
import { trendSchema } from './schemas';

export type GreetingInput = {
  name: string;
  items: PlanItem[];
  deadlines: { title: string; dueAt: Date }[];
  todayISO: string;
};

function nextDeadline(input: GreetingInput): string | null {
  const upcoming = input.deadlines
    .map((d) => ({ ...d, days: daysBetween(input.todayISO, d.dueAt) }))
    .filter((d) => d.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
  return upcoming ? `${upcoming.title} is ${relativeDays(upcoming.days)}` : null;
}

export function fallbackGreeting(input: GreetingInput): string {
  const parts = [`Good morning, ${input.name}.`];
  const dl = nextDeadline(input);
  if (dl) parts.push(`${dl}.`);
  if (input.items[0]) parts.push(`Start with ${input.items[0].skillName} today.`);
  return parts.join(' ');
}

export async function generateGreeting(input: GreetingInput): Promise<string> {
  try {
    const dl = nextDeadline(input);
    const { text } = await generateText({
      model: modelFor('greeting'),
      system: 'You write a two-sentence morning note for an MBA student from their personal coach. Calm, specific, second person. No emoji, no exclamation marks, no bullet points.',
      prompt: [
        `Student: ${input.name}.`,
        dl ? `Next deadline: ${dl}.` : 'No upcoming deadlines.',
        `Today's plan: ${input.items.map((i) => `${i.skillName} (${i.minutes} min, ${i.reason})`).join('; ')}.`,
        'Write the note. Mention the deadline if there is one and the first task.',
      ].join('\n'),
    });
    const out = text.trim();
    return out.length > 0 ? out : fallbackGreeting(input);
  } catch {
    return fallbackGreeting(input);
  }
}

export type TrendInput = {
  skills: { name: string; domain: Domain; score: number; trend: 'up' | 'flat' | 'down' }[];
  observations: { skillName: string; kind: string; note: string }[];
};

export function fallbackTrend(input: TrendInput): string[] {
  const weakest = [...input.skills].sort((a, b) => a.score - b.score)[0];
  return weakest ? [`Your biggest current weakness is ${weakest.name}.`] : [];
}

export async function generateTrendSentences(input: TrendInput): Promise<string[]> {
  if (input.skills.length === 0) return [];
  try {
    const { output } = await generateText({
      model: modelFor('trend'),
      system: 'You summarise an MBA student\'s learning trends for their personal coach dashboard. Second person, calm, specific. No emoji.',
      prompt: [
        'Skills (name, domain, score /100, trend):',
        ...input.skills.map((s) => `- ${s.name} | ${s.domain} | ${s.score} | ${s.trend}`),
        'Observations from the last 7 days:',
        ...(input.observations.length ? input.observations.map((o) => `- ${o.skillName} (${o.kind}): ${o.note}`) : ['- none']),
        'Write 2 or 3 sentences: one clear improvement if any, the biggest current weakness, and one recurring mistake if any.',
      ].join('\n'),
      output: Output.object({ schema: trendSchema }),
    });
    return output.sentences;
  } catch {
    return fallbackTrend(input);
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/domain/summary.test.ts src/ai/planner-text.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Today's plan loader and start-session action**

Create `src/lib/plan.ts`:

```ts
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
```

Create `src/app/(shell)/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createSession } from '@/db/queries';

export async function startSessionAction(skillId: string, _form: FormData): Promise<void> {
  const session = await createSession(skillId);
  redirect(`/session/${session.id}`);
}
```

- [ ] **Step 6: Components**

Create `src/components/skill-bar.tsx`:

```tsx
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

export function SkillBar({ label, score, trend, meta }: { label: string; score: number; trend?: 'up' | 'flat' | 'down'; meta?: string }) {
  const Icon = trend ? TREND_ICON[trend] : null;
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 font-medium">
          {label}
          {Icon && <Icon className="size-4 text-muted-foreground" aria-label={`trend ${trend}`} />}
        </span>
        <span className="tabular-nums text-muted-foreground">{score}%</span>
      </div>
      <Progress value={score} aria-label={`${label} ${score} percent`} />
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
    </div>
  );
}
```

Create `src/components/dashboard/today-plan.tsx`:

```tsx
import { startSessionAction } from '@/app/(shell)/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TodayPlan } from '@/lib/plan';

export function TodayPlanCard({ plan }: { plan: TodayPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended today</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {plan.items.map((item, i) => (
          <div key={item.skillId} className="flex items-center gap-4 rounded-md border border-border p-3">
            <span className="w-5 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {item.courseName ? `${item.courseName}: ` : ''}
                {item.skillName}
              </div>
              <div className="text-xs text-muted-foreground">
                {item.minutes} min · {item.reason}
              </div>
            </div>
            {item.done ? (
              <Badge variant="secondary">Done</Badge>
            ) : (
              <form action={startSessionAction.bind(null, item.skillId)}>
                <Button type="submit" size="sm">
                  Start
                </Button>
              </form>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/dashboard/deadline-list.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Deadline } from '@/db/schema';
import { formatDate, relativeDays } from '@/lib/format';
import { daysBetween } from '@/lib/today';

export function DeadlineList({ deadlines, todayISO }: { deadlines: Deadline[]; todayISO: string }) {
  const upcoming = deadlines.filter((d) => daysBetween(todayISO, d.dueAt) >= 0).slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming</CardTitle>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deadlines yet.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {upcoming.map((d) => {
              const days = daysBetween(todayISO, d.dueAt);
              return (
                <li key={d.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{d.title}</span>
                    <span className="ml-2 text-xs capitalize text-muted-foreground">{d.kind}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(d.dueAt)} · {relativeDays(days)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/dashboard/skill-snapshot.tsx`:

```tsx
import { SkillBar } from '@/components/skill-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SkillGroup } from '@/domain/summary';

export function SkillSnapshot({ groups }: { groups: SkillGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {groups.map((g) => (
          <SkillBar key={g.label} label={g.label} score={g.score} />
        ))}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/dashboard/recent-sessions.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RecentSession } from '@/db/queries';
import { formatDate } from '@/lib/format';

export function RecentSessions({ sessions }: { sessions: RecentSession[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet. Start one above.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>
                  {s.courseName ? `${s.courseName}: ` : ''}
                  {s.skillName}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.performance ?? '–'}% · {s.endedAt ? formatDate(s.endedAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Dashboard page**

Replace `src/app/(shell)/page.tsx`:

```tsx
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
```

- [ ] **Step 8: Verify**

Run `npm run typecheck && npm test`, then `npm run dev` and open `/`.
Expected: greeting names the student and the nearest deadline; three tasks, the last one English/Communication; deadlines and skill groups render; "Start" navigates to `/session/<uuid>` (404 for now, built in Task 14). If `ANTHROPIC_API_KEY` is missing the fallback greeting shows instead of an error.

- [ ] **Step 9: Commit**

```bash
git add src/ai/planner-text.ts src/ai/planner-text.test.ts src/domain/summary.ts src/domain/summary.test.ts src/lib/plan.ts src/app/\(shell\) src/components/skill-bar.tsx src/components/dashboard
git commit -m "feat: dashboard with generated daily plan, deadlines, and skill snapshot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Transcript and outcome (pure)

**Files:**
- Create: `src/domain/transcript.ts`, `src/domain/transcript.test.ts`, `src/domain/outcome.ts`, `src/domain/outcome.test.ts`
- Modify: `src/lib/today.ts`, `src/lib/today.test.ts` (add `now()`)

**Interfaces:**
- Consumes: `SessionEvent`, `EffectResult`, `SessionState`, `TEST_COUNT` from `@/domain/session`; `computePerformance`, `updateScore`, `computeTrend` from `@/domain/skills`.
- Produces:
  ```ts
  // transcript.ts
  export function studentMessageFor(event: SessionEvent): string | null;
  export function coachMessagesFor(result: EffectResult): string[];
  export function pendingTestQuestion(before: SessionState, after: SessionState): string | null;
  // outcome.ts
  export type Outcome = { performance: number; score: number; attempts: number; trend: 'up' | 'flat' | 'down'; confidence: number };
  export function computeOutcome(state: SessionState, skill: { score: number; attempts: number }, priorPerformances: number[]): Outcome;
  // today.ts
  export function now(): Date; // real time, or COACH_TODAY at 12:00 UTC when set
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/transcript.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialState, type SessionState } from './session';
import { coachMessagesFor, pendingTestQuestion, studentMessageFor } from './transcript';

describe('studentMessageFor', () => {
  it('returns the student text for answer-like events and null otherwise', () => {
    expect(studentMessageFor({ type: 'practice.answer', answer: 'A' })).toBe('A');
    expect(studentMessageFor({ type: 'explain.submit', text: 'E' })).toBe('E');
    expect(studentMessageFor({ type: 'test.answer', answer: 'T' })).toBe('T');
    expect(studentMessageFor({ type: 'learn.followup', question: 'Q' })).toBe('Q');
    expect(studentMessageFor({ type: 'start' })).toBeNull();
    expect(studentMessageFor({ type: 'learn.done' })).toBeNull();
    expect(studentMessageFor({ type: 'feedback.confirm', selfConfidence: 4 })).toBeNull();
  });
});

describe('coachMessagesFor', () => {
  it('renders text results directly', () => {
    expect(coachMessagesFor({ kind: 'explanation', text: 'X' })).toEqual(['X']);
    expect(coachMessagesFor({ kind: 'practice-question', question: 'Q?' })).toEqual(['Q?']);
    expect(coachMessagesFor({ kind: 'practice-grade', isCorrect: true, feedback: 'Nice' })).toEqual(['Nice']);
    expect(coachMessagesFor({ kind: 'critique', critique: 'C', conceptGaps: [], englishNotes: [] })).toEqual(['C']);
    expect(coachMessagesFor({ kind: 'feedback', summary: 'S' })).toEqual(['S']);
  });
  it('shows the first test question when the test is generated', () => {
    expect(coachMessagesFor({ kind: 'test-questions', questions: ['a', 'b', 'c'] })).toEqual(['Question 1 of 3: a']);
  });
  it('appends the English note to a critique', () => {
    const r = coachMessagesFor({ kind: 'critique', critique: 'C', conceptGaps: [], englishNotes: [{ skill: 'Articles', note: 'Use "the"' }] });
    expect(r).toEqual(['C', 'English note (Articles): Use "the"']);
  });
  it('emits nothing for grades and finalize', () => {
    expect(coachMessagesFor({ kind: 'test-grade', score: 50, mistakes: [] })).toEqual([]);
    expect(coachMessagesFor({ kind: 'finalized' })).toEqual([]);
  });
});

describe('pendingTestQuestion', () => {
  const base: SessionState = { ...initialState(), phase: 'test', test: { questions: ['a', 'b', 'c'], answers: [], score: null, mistakes: [] } };
  it('returns the next question after a non-final answer', () => {
    const after = { ...base, test: { ...base.test, answers: ['1'] } };
    expect(pendingTestQuestion(base, after)).toBe('Question 2 of 3: b');
  });
  it('returns null when the test is complete or nothing was answered', () => {
    const done = { ...base, phase: 'feedback' as const, test: { ...base.test, answers: ['1', '2', '3'] } };
    expect(pendingTestQuestion(base, done)).toBeNull();
    expect(pendingTestQuestion(base, base)).toBeNull();
  });
});
```

Create `src/domain/outcome.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeOutcome } from './outcome';
import { initialState, type SessionState } from './session';

const state: SessionState = {
  ...initialState(),
  phase: 'done',
  practice: { questions: ['q1', 'q2'], answers: ['a', 'b'], correct: 1 },
  test: { questions: ['t1', 't2', 't3'], answers: ['1', '2', '3'], score: 80, mistakes: ['missed tax shield'] },
  feedback: { summary: 'ok', selfConfidence: 4 },
};

describe('computeOutcome', () => {
  it('combines test and practice, updates score, trend, and confidence', () => {
    // performance = 0.6*80 + 0.4*50 = 68; first attempt moves halfway: 50 + 0.5*18 = 59
    expect(computeOutcome(state, { score: 50, attempts: 0 }, [])).toEqual({
      performance: 68,
      score: 59,
      attempts: 1,
      trend: 'flat',
      confidence: 80,
    });
  });
  it('uses prior performances for the trend', () => {
    expect(computeOutcome(state, { score: 50, attempts: 2 }, [40, 55]).trend).toBe('up');
  });
  it('defaults confidence to 60 when not reported', () => {
    const noConf = { ...state, feedback: { summary: 'ok', selfConfidence: null } };
    expect(computeOutcome(noConf, { score: 50, attempts: 0 }, []).confidence).toBe(60);
  });
});
```

Append to `src/lib/today.test.ts`:

```ts
describe('now', () => {
  afterEach(() => {
    delete process.env.COACH_TODAY;
  });
  it('is noon UTC on COACH_TODAY when set', () => {
    process.env.COACH_TODAY = '2026-09-10';
    expect(now().toISOString()).toBe('2026-09-10T12:00:00.000Z');
  });
  it('is the current time otherwise', () => {
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
```

and add `now` to the import line: `import { daysBetween, now, startOfDay, todayISO } from './today';`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/domain/transcript.test.ts src/domain/outcome.test.ts src/lib/today.test.ts`
Expected: FAIL (module not found / `now` is not exported).

- [ ] **Step 3: Implement**

Append to `src/lib/today.ts`:

```ts
/** Current time, or noon UTC on COACH_TODAY when that override is set. */
export function now(): Date {
  const override = process.env.COACH_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return new Date(`${override}T12:00:00.000Z`);
  return new Date();
}
```

Create `src/domain/transcript.ts`:

```ts
import { TEST_COUNT, type EffectResult, type SessionEvent, type SessionState } from './session';

export function studentMessageFor(event: SessionEvent): string | null {
  switch (event.type) {
    case 'learn.followup':
      return event.question;
    case 'practice.answer':
    case 'test.answer':
      return event.answer;
    case 'explain.submit':
      return event.text;
    default:
      return null;
  }
}

function testQuestionLabel(index: number, question: string): string {
  return `Question ${index + 1} of ${TEST_COUNT}: ${question}`;
}

export function coachMessagesFor(result: EffectResult): string[] {
  switch (result.kind) {
    case 'explanation':
    case 'followup-answer':
      return [result.text];
    case 'practice-question':
      return [result.question];
    case 'practice-grade':
      return [result.feedback];
    case 'critique':
      return [result.critique, ...result.englishNotes.map((n) => `English note (${n.skill}): ${n.note}`)];
    case 'test-questions':
      return result.questions.length ? [testQuestionLabel(0, result.questions[0])] : [];
    case 'feedback':
      return [result.summary];
    case 'test-grade':
    case 'finalized':
      return [];
  }
}

/** After a non-final test answer, the next question to show. */
export function pendingTestQuestion(before: SessionState, after: SessionState): string | null {
  const n = after.test.answers.length;
  if (after.phase !== 'test' || n === before.test.answers.length || n >= TEST_COUNT) return null;
  const q = after.test.questions[n];
  return q ? testQuestionLabel(n, q) : null;
}
```

Create `src/domain/outcome.ts`:

```ts
import type { SessionState } from './session';
import { computePerformance, computeTrend, updateScore } from './skills';

export type Outcome = {
  performance: number;
  score: number;
  attempts: number;
  trend: 'up' | 'flat' | 'down';
  confidence: number;
};

export function computeOutcome(
  state: SessionState,
  skill: { score: number; attempts: number },
  priorPerformances: number[],
): Outcome {
  const performance = computePerformance(state.test.score ?? 0, state.practice.correct, state.practice.questions.length);
  const { score, attempts } = updateScore(skill, performance);
  const trend = computeTrend([...priorPerformances, performance]);
  const confidence = (state.feedback.selfConfidence ?? 3) * 20;
  return { performance, score, attempts, trend, confidence };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/transcript.ts src/domain/transcript.test.ts src/domain/outcome.ts src/domain/outcome.test.ts src/lib/today.ts src/lib/today.test.ts
git commit -m "feat: add transcript rendering and session outcome math

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Session step route

**Files:**
- Create: `src/app/api/session/[id]/step/route.ts`, `src/app/api/session/[id]/step/event-schema.ts`, `src/app/api/session/[id]/step/event-schema.test.ts`

**Interfaces:**
- Consumes: `next`, `apply`, `InvalidTransition` (`@/domain/session`); `runEffect` (`@/ai/phases`); `levelFor` (`@/ai/context`); transcript + outcome (Task 12); queries (Task 8); `englishPenalty` (`@/domain/skills`); `now` (`@/lib/today`).
- Produces: `POST /api/session/:id/step` with body `{ event: SessionEvent }`. Responses: `200 { state: SessionState; messages: SessionMessage[] }`, `400 { error }` invalid body, `404`, `409` invalid transition, `502 { error }` when the model call fails (nothing persisted). `sessionEventSchema` (zod).

- [ ] **Step 1: Write the failing event-schema test**

Create `src/app/api/session/[id]/step/event-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sessionEventSchema } from './event-schema';

describe('sessionEventSchema', () => {
  it('accepts every event type', () => {
    for (const e of [
      { type: 'start' },
      { type: 'learn.followup', question: 'why' },
      { type: 'learn.done' },
      { type: 'practice.answer', answer: 'a' },
      { type: 'explain.submit', text: 't' },
      { type: 'test.answer', answer: 'x' },
      { type: 'feedback.confirm', selfConfidence: 3 },
    ]) {
      expect(sessionEventSchema.safeParse(e).success).toBe(true);
    }
  });
  it('rejects empty answers, long text, and out-of-range confidence', () => {
    expect(sessionEventSchema.safeParse({ type: 'practice.answer', answer: '   ' }).success).toBe(false);
    expect(sessionEventSchema.safeParse({ type: 'explain.submit', text: 'x'.repeat(3001) }).success).toBe(false);
    expect(sessionEventSchema.safeParse({ type: 'feedback.confirm', selfConfidence: 6 }).success).toBe(false);
    expect(sessionEventSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement the schema**

Run: `npm test -- src/app/api` — Expected: FAIL module not found.

Create `src/app/api/session/[id]/step/event-schema.ts`:

```ts
import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const sessionEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('learn.followup'), question: text(500) }),
  z.object({ type: z.literal('learn.done') }),
  z.object({ type: z.literal('practice.answer'), answer: text(2000) }),
  z.object({ type: z.literal('explain.submit'), text: text(3000) }),
  z.object({ type: z.literal('test.answer'), answer: text(2000) }),
  z.object({ type: z.literal('feedback.confirm'), selfConfidence: z.number().int().min(1).max(5) }),
]);
```

Run: `npm test -- src/app/api` — Expected: PASS (2 tests).

- [ ] **Step 3: Implement the route**

Create `src/app/api/session/[id]/step/route.ts`:

```ts
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { levelFor, type CoachContext } from '@/ai/context';
import { runEffect } from '@/ai/phases';
import {
  applySessionOutcome,
  countEnglishNotesSince,
  getEnglishSkillByName,
  getSessionMessages,
  getSkillObservations,
  getSkillPerformances,
  loadSession,
  saveSessionStep,
  type NewMessage,
} from '@/db/queries';
import { computeOutcome } from '@/domain/outcome';
import { apply, InvalidTransition, next } from '@/domain/session';
import { englishPenalty } from '@/domain/skills';
import { coachMessagesFor, pendingTestQuestion, studentMessageFor } from '@/domain/transcript';
import { now } from '@/lib/today';
import { sessionEventSchema } from './event-schema';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = sessionEventSchema.safeParse(body?.event);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  const event = parsed.data;

  const loaded = await loadSession(id);
  if (!loaded) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const { session, skill, course, student } = loaded;

  const before = session.phaseState;
  let transition: ReturnType<typeof next>;
  try {
    transition = next(before, event);
  } catch (e) {
    if (e instanceof InvalidTransition) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  const observations = await getSkillObservations(skill.id, 5);
  const ctx: CoachContext = {
    studentName: student.name,
    level: levelFor(student.englishComfort),
    courseName: course?.name ?? null,
    topic: skill.name,
    recentMistakes: observations.map((o) => o.note),
  };

  let state = transition.state;
  const newMessages: NewMessage[] = [];
  const studentText = studentMessageFor(event);
  if (studentText) newMessages.push({ phase: before.phase, role: 'student', content: studentText });

  try {
    for (const effect of transition.effects) {
      if (effect.kind === 'finalize') continue;
      const result = await runEffect(effect, ctx, state);
      state = apply(state, result);
      for (const content of coachMessagesFor(result)) {
        newMessages.push({ phase: state.phase, role: 'coach', content });
      }
    }
  } catch (e) {
    console.error('session step failed', { id, event: event.type, error: e });
    return NextResponse.json({ error: 'The coach did not respond. Please try again.' }, { status: 502 });
  }

  const pending = pendingTestQuestion(before, state);
  if (pending) newMessages.push({ phase: 'test', role: 'coach', content: pending });

  await saveSessionStep(id, state, newMessages);

  if (state.phase === 'done') {
    const at = now();
    const prior = await getSkillPerformances(skill.id, 3);
    const outcome = computeOutcome(state, skill, prior);
    const englishPenalties = await Promise.all(
      state.explain.englishNotes.map(async (n) => {
        const englishSkill = await getEnglishSkillByName(student.id, n.skill);
        if (!englishSkill) return 0;
        return englishPenalty(await countEnglishNotesSince(englishSkill.id, new Date(at.getTime() - WEEK_MS)));
      }),
    );
    await applySessionOutcome({
      sessionId: id,
      skillId: skill.id,
      studentId: student.id,
      performance: outcome.performance,
      score: outcome.score,
      attempts: outcome.attempts,
      trend: outcome.trend,
      confidence: outcome.confidence,
      selfConfidence: state.feedback.selfConfidence ?? 3,
      summary: state.feedback.summary ?? '',
      mistakes: [...state.test.mistakes, ...state.explain.conceptGaps].slice(0, 5),
      englishNotes: state.explain.englishNotes,
      englishPenalties,
      now: at,
    });
    revalidatePath('/');
    revalidatePath('/progress');
  }

  const messages = await getSessionMessages(id);
  return NextResponse.json({ state, messages });
}
```

- [ ] **Step 4: Verify with curl**

With `npm run dev` running and a session created from the dashboard (copy its id from the URL):

```bash
curl -s -X POST localhost:3000/api/session/<id>/step -H 'content-type: application/json' -d '{"event":{"type":"start"}}' | head -c 600
```

Expected: JSON with `state.phase: "learn"` and one coach message containing an explanation. A second `start` returns 409. `{"event":{"type":"nope"}}` returns 400.

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit -m "feat: add session step API that runs one phase per request

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Session runner UI

**Files:**
- Create: `src/components/session/phase-stepper.tsx`, `src/components/session/session-runner.tsx`, `src/app/session/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadSession` (Task 8); `SessionState`, `SessionEvent`, `TEST_COUNT` (`@/domain/session`); the step endpoint (Task 13).
- Produces: `SessionRunner({ sessionId, topic, courseName, initialState, initialMessages })` client component; `PhaseStepper({ phase })`.

- [ ] **Step 1: Phase stepper**

Create `src/components/session/phase-stepper.tsx`:

```tsx
import type { Phase } from '@/domain/session';
import { cn } from '@/lib/utils';

const STEPS: { phase: Phase; label: string }[] = [
  { phase: 'learn', label: 'Learn' },
  { phase: 'practice', label: 'Practice' },
  { phase: 'explain', label: 'Explain' },
  { phase: 'test', label: 'Test' },
  { phase: 'feedback', label: 'Feedback' },
];

export function PhaseStepper({ phase }: { phase: Phase }) {
  const current = phase === 'done' ? STEPS.length : STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Session progress">
      {STEPS.map((s, i) => (
        <li key={s.phase} className="grid gap-1 text-center text-xs" aria-current={i === current ? 'step' : undefined}>
          <span className={cn('h-1 rounded-full', i < current ? 'bg-primary' : i === current ? 'bg-primary/60' : 'bg-muted')} />
          <span className={cn(i === current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Session runner**

Create `src/components/session/session-runner.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TEST_COUNT, type SessionEvent, type SessionState } from '@/domain/session';
import { cn } from '@/lib/utils';
import { PhaseStepper } from './phase-stepper';

type Msg = { id: string; role: 'coach' | 'student'; content: string };

type Props = {
  sessionId: string;
  topic: string;
  courseName: string | null;
  initialState: SessionState;
  initialMessages: Msg[];
};

export function SessionRunner({ sessionId, topic, courseName, initialState, initialMessages }: Props) {
  const [state, setState] = useState(initialState);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function send(event: SessionEvent) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      setState(data.state);
      setMessages(data.messages);
      setInput('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialMessages.length === 0 && initialState.phase === 'learn') void send({ type: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  const submitText = (make: (t: string) => SessionEvent) => {
    const t = input.trim();
    if (!t) return;
    void send(make(t));
  };

  return (
    <div className="grid gap-6">
      <PhaseStepper phase={state.phase} />

      <div className="grid gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-prose whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-relaxed',
              m.role === 'coach' ? 'bg-muted' : 'justify-self-end bg-primary/10',
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Coach is thinking…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6">
          {state.phase === 'learn' && (
            <>
              {!state.learn.followUpUsed && (
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask one follow-up question (optional)"
                    disabled={busy}
                    onKeyDown={(e) => e.key === 'Enter' && submitText((q) => ({ type: 'learn.followup', question: q }))}
                  />
                  <Button variant="outline" disabled={busy || !input.trim()} onClick={() => submitText((q) => ({ type: 'learn.followup', question: q }))}>
                    Ask
                  </Button>
                </div>
              )}
              <Button disabled={busy} onClick={() => send({ type: 'learn.done' })}>
                Got it, let&apos;s practice
              </Button>
            </>
          )}

          {(state.phase === 'practice' || state.phase === 'test') && (
            <>
              {state.phase === 'test' && (
                <p className="text-sm text-muted-foreground">
                  Question {Math.min(state.test.answers.length + 1, TEST_COUNT)} of {TEST_COUNT}
                </p>
              )}
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="Your answer" disabled={busy} />
              <Button
                disabled={busy || !input.trim()}
                onClick={() =>
                  submitText((a) => (state.phase === 'practice' ? { type: 'practice.answer', answer: a } : { type: 'test.answer', answer: a }))
                }
              >
                Submit answer
              </Button>
            </>
          )}

          {state.phase === 'explain' && (
            <>
              <p className="text-sm">
                Explain <span className="font-medium">{topic}</span> in your own words, as if to a classmate. Three to six sentences.
              </p>
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} disabled={busy} />
              <Button disabled={busy || !input.trim()} onClick={() => submitText((t) => ({ type: 'explain.submit', text: t }))}>
                Get feedback
              </Button>
            </>
          )}

          {state.phase === 'feedback' && (
            <>
              <p className="text-sm">
                Test score: <span className="font-medium tabular-nums">{state.test.score ?? 0}/100</span>. How confident do you feel about {topic} now?
              </p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button key={n} variant="outline" disabled={busy} onClick={() => send({ type: 'feedback.confirm', selfConfidence: n })}>
                    {n}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">1 = not confident, 5 = very confident</p>
            </>
          )}

          {state.phase === 'done' && (
            <>
              <p className="text-sm">
                Session complete. {courseName ? `${courseName}: ` : ''}
                {topic} updated in your skill profile.
              </p>
              <Button render={<Link href="/" />}>Back to dashboard</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

If the shadcn `Button` in this project does not support the `render` prop, replace the last button with `<Link href="/" className={buttonVariants()}>Back to dashboard</Link>` and import `buttonVariants` from `@/components/ui/button`.

- [ ] **Step 3: Session page**

Create `src/app/session/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SessionRunner } from '@/components/session/session-runner';
import { loadSession } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadSession(id);
  if (!loaded) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{loaded.course?.name ?? 'English'}</p>
          <h1 className="text-xl font-semibold tracking-tight">{loaded.skill.name}</h1>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Exit
        </Link>
      </header>
      <SessionRunner
        sessionId={loaded.session.id}
        topic={loaded.skill.name}
        courseName={loaded.course?.name ?? null}
        initialState={loaded.session.phaseState}
        initialMessages={loaded.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verify the whole loop in the browser**

`npm run typecheck`, then with `npm run dev`: dashboard → Start on task 1.
Expected, in order: explanation appears automatically; optional follow-up works once; "Got it" → question 1; answer → feedback + question 2; answer → phase Explain; submit explanation → critique (plus an English note if the text had errors) and "Question 1 of 3"; three answers → summary and confidence buttons; pick one → "Session complete". Back on the dashboard the task shows "Done" and Recent sessions lists it with a performance. Reload mid-session restores the transcript. On the mobile preset the page has no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add src/components/session src/app/session
git commit -m "feat: add guided focus-session runner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Progress page

**Files:**
- Create: `src/components/progress/skill-group.tsx`
- Modify: `src/app/(shell)/progress/page.tsx`

**Interfaces:**
- Consumes: `getSkills`, `getObservationsSince`, `getStudent` (Task 8); `generateTrendSentences` (Task 11); `SkillBar`; `summarizeSkills`; `formatDate`; `now`.
- Produces: `SkillGroupCard({ label, score, skills, observationsBySkill })`.

- [ ] **Step 1: Group card**

Create `src/components/progress/skill-group.tsx`:

```tsx
import { SkillBar } from '@/components/skill-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SkillWithCourse } from '@/db/queries';
import { formatDate } from '@/lib/format';

export function SkillGroupCard({
  label,
  score,
  skills,
  observationsBySkill,
}: {
  label: string;
  score: number;
  skills: SkillWithCourse[];
  observationsBySkill: Map<string, string[]>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle>{label}</CardTitle>
        <span className="text-sm tabular-nums text-muted-foreground">{score}%</span>
      </CardHeader>
      <CardContent className="grid gap-5">
        {skills.map((s) => {
          const notes = observationsBySkill.get(s.id) ?? [];
          const meta = [
            `${s.attempts} ${s.attempts === 1 ? 'attempt' : 'attempts'}`,
            s.lastPracticedAt ? `last practiced ${formatDate(s.lastPracticedAt)}` : 'not practiced yet',
          ].join(' · ');
          return (
            <div key={s.id} className="grid gap-1">
              <SkillBar label={s.name} score={s.score} trend={s.trend} meta={meta} />
              {notes.length > 0 && (
                <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                  {notes.slice(0, 3).map((n, i) => (
                    <li key={i}>• {n}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Progress page**

Replace `src/app/(shell)/progress/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { generateTrendSentences } from '@/ai/planner-text';
import { SkillGroupCard } from '@/components/progress/skill-group';
import { getObservationsSince, getSkills, getStudent } from '@/db/queries';
import { summarizeSkills } from '@/domain/summary';
import { now } from '@/lib/today';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function ProgressPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');

  const at = now();
  const [skills, recentObs, weekObs] = await Promise.all([
    getSkills(student.id),
    getObservationsSince(student.id, new Date(at.getTime() - 30 * DAY_MS)),
    getObservationsSince(student.id, new Date(at.getTime() - 7 * DAY_MS)),
  ]);

  const sentences = await generateTrendSentences({
    skills: skills.map((s) => ({ name: s.name, domain: s.domain, score: s.score, trend: s.trend })),
    observations: weekObs.map((o) => ({ skillName: o.skillName, kind: o.kind, note: o.note })),
  });

  const observationsBySkill = new Map<string, string[]>();
  for (const o of recentObs) observationsBySkill.set(o.skillId, [...(observationsBySkill.get(o.skillId) ?? []), o.note]);

  const groups = summarizeSkills(skills);
  const skillsFor = (label: string, domain: string) =>
    skills.filter((s) => (domain === 'english' || domain === 'communication' ? s.domain === domain : s.courseName === label));

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        {sentences.length > 0 && (
          <ul className="mt-3 grid max-w-2xl gap-1 text-sm">
            {sentences.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <SkillGroupCard key={g.label} label={g.label} score={g.score} skills={skillsFor(g.label, g.domain)} observationsBySkill={observationsBySkill} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

`npm run typecheck`; open `/progress` after completing one session.
Expected: the practised skill shows a changed score, "1 attempt", "last practiced <date>", and the mistakes recorded; the English skill named in an English note shows that note; the header has 1–3 trend sentences.

- [ ] **Step 4: Commit**

```bash
git add src/components/progress src/app/\(shell\)/progress
git commit -m "feat: add progress page with skill detail and trend sentences

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Courses, settings, README, and final loop verification

**Files:**
- Modify: `src/app/(shell)/courses/page.tsx`, `src/app/(shell)/settings/page.tsx`, `README.md`

- [ ] **Step 1: Courses page**

Replace `src/app/(shell)/courses/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Settings page (read-only profile)**

Replace `src/app/(shell)/settings/page.tsx`:

```tsx
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
```

- [ ] **Step 3: README**

Replace `README.md`:

```markdown
# MBA AI Coach

A personal MBA coach that knows what you are studying, where you struggle, and what to do next.
This is slice 1: the daily loop. Onboard → dashboard with today's tasks → a five-phase focus session
(Learn, Practice, Explain, Test, Feedback) → skill graph update → tomorrow's plan changes.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (Supabase transaction pooler) and `ANTHROPIC_API_KEY`.
3. `npm run db:push` to create the tables.
4. `npm run dev` and open http://localhost:3000. You will be sent to onboarding.

## Scripts

- `npm test` — unit tests for the planner, skill math, session state machine, and AI parsing (models are mocked)
- `npm run typecheck`
- `npm run db:reset` — wipe the single student and start over
- `COACH_TODAY=2026-09-08 npm run dev` — time-travel the planner to see how tomorrow's plan changes

## How it works

- `src/domain/*` — pure logic: `planner.ts` ranks skills by weakness, deadline proximity, and staleness; `session.ts` is the phase state machine; `skills.ts` updates scores and trends.
- `src/ai/*` — one typed Claude call per session phase. `router.ts` maps task kinds to models (Haiku for cheap tasks, Sonnet for coaching).
- `src/db/*` — Drizzle schema and queries on Supabase Postgres.
- `src/app/*` — Next.js App Router pages, one route handler (`/api/session/[id]/step`).

Design spec: `docs/superpowers/specs/2026-09-07-daily-loop-design.md`.
```

- [ ] **Step 4: Full verification pass**

Run, in order, and record the results:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all green. Then `npm run db:reset`, `npm run dev`, and walk the loop in the Browser pane:

1. `/` → redirected to `/onboarding`; submit with Finance + Strategy, English comfort 2, one Finance exam 2 days out.
2. Dashboard: greeting mentions the exam; task 1 is a Finance topic with reason "Finance exam in 2 days"; task 3 is English.
3. Start task 1, complete all five phases; confirm confidence 4.
4. Dashboard: task 1 shows Done; Recent sessions lists it.
5. `/progress`: that topic's score changed from 50, shows 1 attempt, and lists a mistake; any English note appears under English.
6. Stop the dev server, restart with `COACH_TODAY=<tomorrow> npm run dev`: dashboard generates a new plan; the practised topic is no longer first.
7. Mobile preset: dashboard, session, and progress pages have a bottom nav and no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: courses and settings pages, README, and end-to-end loop verification

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
