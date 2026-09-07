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

## Running with a Claude subscription instead of an API key

Set `COACH_PROVIDER=claude-code` (see `.env.example`) to route every model call in `src/ai/router.ts`
through the local Claude Code CLI (`claude -p`) instead of the Anthropic API. Calls then run under
whatever account the `claude` CLI is logged into on this machine — a Claude subscription (Pro/Max),
not `ANTHROPIC_API_KEY`.

This only works on a machine where the `claude` CLI is installed and already logged in (`claude`
opens the login flow interactively; headless `-p` mode does not). It is meant for local development,
not for deployed environments — a server has no browser to complete the OAuth login, and each call
shells out to a CLI process rather than making an HTTP request.

Smoke-test that the CLI is logged in and working:

```bash
claude -p 'Reply with the word ok' --output-format json --model haiku
```

If that prints a JSON envelope with `"result": "ok"` (or similar), `COACH_PROVIDER=claude-code` will work.
