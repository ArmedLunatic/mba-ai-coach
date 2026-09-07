# MBA AI Coach — Slice 1: The Daily Loop

## Context

The spec (`~/Downloads/MBA AI Coach Product Specification.pdf`) describes a 13-module "MBA operating system". It is far too large for one build. The spec itself says the most important thing is the **daily loop**: open app → see today's priorities → run a focused session → get feedback → weakness detected → skill profile updated → tomorrow's plan gets smarter.

Slice 1 builds exactly that loop and nothing else. It is a personal/portfolio project, so: single hardcoded student (no login yet), Supabase Postgres for data, Claude as the only AI provider behind a router interface, deployed to Vercel later.

Decisions already made with the user:
- Goal: build a first slice, not critique or full architecture
- Context: personal/portfolio project → speed over hardening
- Slice: daily loop core (no document upload, topics from a seeded curriculum)
- AI: Claude only (Haiku 4.5 for cheap tasks, Sonnet 5 for coaching), behind a provider-agnostic router
- DB: Supabase Postgres via Drizzle; auth skipped, one seeded student row
- Session engine: server-side state machine, one structured-output call per phase

Explicitly **out of scope** for slice 1: documents/RAG, Case Room, Assignment Studio, Speaking Coach, Presentation Studio, English Lab as a standalone module, multi-user auth, Gemini.

## Stack

- Next.js (App Router, TypeScript), Tailwind, shadcn/ui
- Drizzle ORM → Supabase Postgres (server-side only, service key; no RLS yet)
- Vercel AI SDK v6 + `@ai-sdk/anthropic` (user has a direct Anthropic key). Load the `claude-api` skill before writing any model code.
- Vitest for unit tests; AI SDK `MockLanguageModelV2` for tests that touch model calls
- pnpm

## Project layout

```
src/
  app/
    (shell)/layout.tsx          responsive shell: sidebar on desktop, bottom nav on mobile
    page.tsx                    Dashboard
    onboarding/page.tsx
    session/[id]/page.tsx       Focus session runner
    progress/page.tsx
    courses/page.tsx            read-only list of courses + their skills (minimal)
    api/session/[id]/step/route.ts   advance one phase (streams the AI turn)
  db/
    schema.ts  client.ts  seed/curriculum.ts  seed/run.ts
  ai/
    router.ts                   TaskKind → model; provider interface
    prompts/                    one file per phase + planner greeting
    schemas.ts                  zod schemas for structured outputs
  domain/
    skills.ts                   score update + trend (pure)
    planner.ts                  daily plan scoring (pure)
    session.ts                  phase state machine (pure)
  components/                   shell, dashboard cards, session stepper, skill bars
```

## Data model (Drizzle)

- `students` — id, name, program, semester, english_comfort (1–5), academic_goals, career_goals, preferred_study_times (text[]), created_at. Exactly one row.
- `courses` — id, student_id, name, slug, color.
- `skills` — id, student_id, course_id (nullable; null = English/Communication domains), domain (`finance`|`strategy`|…|`english`|`communication`), name, score (0–100), confidence (0–100), attempts, last_practiced_at, trend (`up`|`flat`|`down`).
- `skill_observations` — id, skill_id, session_id, kind (`mistake`|`strength`|`english_note`), note, created_at. Feeds "common mistakes" and the English profile.
- `deadlines` — id, student_id, course_id, title, kind (`exam`|`assignment`|`class`|`presentation`), due_at.
- `daily_plans` — id, student_id, date, greeting, items (jsonb: `{skillId, minutes, reason}[]`). One per day, regenerated if stale.
- `sessions` — id, skill_id, phase (`learn`|`practice`|`explain`|`test`|`feedback`|`done`), started_at, ended_at, performance (0–100), self_confidence (1–5), summary, phase_state (jsonb scratch for the state machine).
- `session_messages` — id, session_id, phase, role, content, created_at.

Seeded curriculum (`db/seed/curriculum.ts`): courses Finance, Marketing, Strategy, Operations, Economics, Accounting with 4–6 topics each (from the spec: WACC, NPV, CAPM, Valuation, Porter's Five Forces, SWOT, …), plus English (articles, tenses, prepositions, subject-verb agreement, business vocabulary, writing clarity) and Communication (answer structure, confidence). Initial scores are set by onboarding, not hardcoded.

## The loop, component by component

### 1. Onboarding (`/onboarding`)
Single multi-step form: name, program, semester, pick courses from the seed list, English comfort (1–5), goals, 1–3 upcoming deadlines, preferred study times. On submit: create student, courses, skills (initial score from a simple mapping: English comfort → English skills; MBA skills start at 50), deadlines. Redirect to dashboard. If a student row already exists, `/` skips onboarding.

### 2. Planner (`domain/planner.ts`, pure)
Input: skills, deadlines, today. Output: top 3 tasks with minutes and a one-line reason.
Score per skill = `w_weak·(100−score) + w_deadline·proximity(course deadlines) + w_stale·daysSincePracticed − w_recent·practicedToday`. Minutes from a small table (weak → 25–35 min, English → 10 min). Always include one English/Communication item so the loop touches English daily.
Greeting text ("You have Finance tomorrow… weakest topic is WACC…") is produced by a Haiku call given the plan and deadlines. Cached in `daily_plans` per date.

### 3. Dashboard (`/`)
Cards: greeting + today's tasks (each has a Start button → creates a session), upcoming deadlines, skill snapshot (MBA and English bars), recent sessions. Answers "what should I do today?"

### 4. Focus session (`/session/[id]`, `domain/session.ts`, `api/session/[id]/step`)
Fixed phase order: Learn → Practice → Explain → Test → Feedback. UI shows a stepper and a guided chat. Each phase:
- **Learn**: Sonnet explains the topic at a level chosen from the English comfort score (Beginner vs MBA mode), with one business example. Student clicks "Got it" or asks one follow-up.
- **Practice**: Sonnet asks 2 Socratic questions one at a time; after each answer returns structured `{ feedback, isCorrect, hint? }`.
- **Explain**: Student explains the topic in their own words (typed). Sonnet returns `{ critique, conceptGaps[], englishNotes[] }` — englishNotes are at most 2 and become `english_note` observations on the matching English skill (articles, tenses, etc.). This is the cross-feed that makes English improvement tied to MBA work.
- **Test**: 3 short questions (Haiku generates from topic + the mistakes seen so far), student answers, Haiku grades → `{ score, mistakes[] }`.
- **Feedback**: Sonnet writes a short summary; student self-rates confidence 1–5. Session finalized.

The state machine is pure: `next(state, event) → state + effect`. Route handler runs the effect (a model call via the router), persists messages, streams text back. Structured outputs use `generateObject` with zod schemas in `ai/schemas.ts`.

### 5. Skill update (`domain/skills.ts`, pure)
On session finalize: `performance` = 0.6·testScore + 0.4·practiceScore. New skill score = `old + k·(performance − old)` with `k = 0.5 / sqrt(attempts)` clamped to [0.15, 0.5]. Trend = sign of the change over the last 3 sessions. Mistakes → `skill_observations`. English notes → observations on English skills and a small score nudge (−2 per repeated weakness in a week). Deterministic and fully unit-tested.

### 6. Progress (`/progress`)
Skill bars per domain, per-skill detail (attempts, last practiced, trend, common mistakes list from observations), and 2–3 trend sentences generated by Haiku from the last 7 days of observations ("fewer subject-verb agreement errors this week").

### 7. AI router (`ai/router.ts`)
```ts
type TaskKind = 'greeting' | 'test-gen' | 'grade' | 'trend' | 'learn' | 'socratic' | 'critique' | 'feedback'
```
`cheap` tasks (greeting, test-gen, grade, trend) → `claude-haiku-4-5`; coaching tasks → `claude-sonnet-5`. A `Provider` interface wraps the AI SDK model so Gemini can be added later without touching call sites. Every call site passes a `TaskKind`, never a model id.

## Shell and navigation
Desktop: left sidebar with Dashboard, Courses, Progress, Settings (stub). Mobile: bottom nav with the same four. Calm, academic, no gradients or gamification; shadcn defaults with a restrained palette. Session page is full-screen on mobile.

## Build order (each step ends green)
1. Scaffold Next.js + Tailwind + shadcn + Drizzle + Vitest; env for Supabase and Anthropic
2. Schema, migrations, curriculum seed, seed script
3. Pure domain modules with tests: `skills.ts`, `planner.ts`, `session.ts`
4. AI router + zod schemas + prompts; mocked-model tests for one phase
5. Onboarding page → creates student data
6. Dashboard with real planner output and greeting
7. Session runner UI + step API, phase by phase
8. Skill update wired to session finalize; dashboard regenerates plan next day
9. Progress page
10. Responsive shell polish, empty states, README

## Verification
- `pnpm test`: skill math, planner ordering (weak + near-deadline skill ranks first; English item always present), state machine transitions, structured-output parsing with mocked models
- `pnpm dev` then walk the loop in the Browser pane: onboard → dashboard shows 3 tasks → start WACC session → complete all five phases → Progress shows updated WACC score and a mistake → advance the date (env override `COACH_TODAY`) → dashboard plan changes
- Check mobile preset renders bottom nav and session page without horizontal scroll

## Notes for implementation
- Write the design spec to `docs/superpowers/specs/2026-09-07-daily-loop-design.md` from this plan before coding, then use the writing-plans skill for the detailed task list.
- Keep prompts short and pass structured student context (comfort level, recent mistakes), not chat history.
- Never let a phase call return free text where a schema is expected; fail the step and let the UI retry.
