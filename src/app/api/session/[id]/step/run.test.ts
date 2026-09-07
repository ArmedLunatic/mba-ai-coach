import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedSession, NewMessage, SessionOutcomeWrite } from '@/db/queries';
import type { SessionMessage } from '@/db/schema';
import { initialState, type Effect, type EffectResult, type SessionState } from '@/domain/session';
import { runSessionStep, type StepDeps } from './run';

const AT = new Date('2026-09-07T12:00:00.000Z');

function loadedSession(state: SessionState): LoadedSession {
  return {
    session: {
      id: 'session-1',
      skillId: 'skill-1',
      phase: state.phase,
      startedAt: AT,
      endedAt: null,
      performance: null,
      selfConfidence: null,
      summary: null,
      phaseState: state,
    },
    skill: {
      id: 'skill-1',
      studentId: 'student-1',
      courseId: 'course-1',
      domain: 'finance',
      name: 'WACC',
      score: 40,
      confidence: 50,
      attempts: 2,
      lastPracticedAt: null,
      trend: 'flat',
    },
    course: { id: 'course-1', studentId: 'student-1', name: 'Finance', slug: 'finance', color: '#2563eb' },
    student: {
      id: 'student-1',
      name: 'Ansh',
      program: 'Full-time MBA',
      semester: 'Semester 1',
      englishComfort: 2,
      academicGoals: '',
      careerGoals: '',
      preferredStudyTimes: [],
      createdAt: AT,
    },
    messages: [],
  };
}

/** Canned results per effect kind, so no model (and no schema parsing) is involved. */
const CANNED: Record<Effect['kind'], EffectResult> = {
  'explain-topic': { kind: 'explanation', text: 'WACC is the blended cost of capital.' },
  'answer-followup': { kind: 'followup-answer', text: 'Because debt is cheaper than equity.' },
  'ask-practice': { kind: 'practice-question', question: 'Why does WACC fall when debt rises?' },
  'grade-practice': { kind: 'practice-grade', isCorrect: true, feedback: 'Correct, and note the tax shield.' },
  'critique-explanation': { kind: 'critique', critique: 'Mostly accurate.', conceptGaps: ['tax shield'], englishNotes: [] },
  'generate-test': { kind: 'test-questions', questions: ['Q one', 'Q two', 'Q three'] },
  'grade-test': { kind: 'test-grade', score: 72, mistakes: ['missed the tax shield'] },
  'write-feedback': { kind: 'feedback', summary: 'Solid grasp; work on the tax shield.' },
  finalize: { kind: 'finalized' },
};

type Harness = {
  deps: StepDeps;
  saved: { id: string; state: SessionState; messages: NewMessage[] }[];
  outcomes: SessionOutcomeWrite[];
  effectCalls: { effect: Effect; state: SessionState }[];
};

function harness(overrides: Partial<StepDeps> = {}): Harness {
  const saved: Harness['saved'] = [];
  const outcomes: SessionOutcomeWrite[] = [];
  const effectCalls: Harness['effectCalls'] = [];

  const deps: StepDeps = {
    runEffect: vi.fn(async (effect: Effect, _ctx, state: SessionState) => {
      effectCalls.push({ effect, state: structuredClone(state) });
      return CANNED[effect.kind];
    }) as unknown as StepDeps['runEffect'],
    getSkillObservations: vi.fn(async () => [{ note: 'confused WACC with cost of equity' }]),
    getSkillPerformances: vi.fn(async () => [50, 60]),
    saveSessionStep: vi.fn(async (id: string, state: SessionState, messages: NewMessage[]) => {
      saved.push({ id, state, messages });
    }),
    applySessionOutcome: vi.fn(async (w: SessionOutcomeWrite) => {
      outcomes.push(w);
    }),
    getSessionMessages: vi.fn(async () => [] as SessionMessage[]),
    now: () => AT,
    ...overrides,
  };
  return { deps, saved, outcomes, effectCalls };
}

describe('runSessionStep', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('persists the first practice question as a coach message on learn.done', async () => {
    const h = harness();
    const result = await runSessionStep(loadedSession(initialState()), { type: 'learn.done' }, h.deps);

    expect(result.status).toBe(200);
    expect(h.deps.applySessionOutcome).not.toHaveBeenCalled();
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].state.phase).toBe('practice');
    expect(h.saved[0].messages).toEqual([
      { phase: 'practice', role: 'coach', content: 'Why does WACC fall when debt rises?' },
    ]);
  });

  it('runs grade-test then write-feedback, with the score already applied for write-feedback', async () => {
    const state: SessionState = {
      ...initialState(),
      phase: 'test',
      test: { questions: ['Q one', 'Q two', 'Q three'], answers: ['a', 'b'], score: null, mistakes: [] },
    };
    const h = harness();
    const result = await runSessionStep(loadedSession(state), { type: 'test.answer', answer: 'c' }, h.deps);

    expect(result.status).toBe(200);
    expect(h.effectCalls.map((c) => c.effect.kind)).toEqual(['grade-test', 'write-feedback']);
    // Documents the apply-before-next-effect coupling: write-feedback reads grade-test's output.
    expect(h.effectCalls[0].state.test.score).toBeNull();
    expect(h.effectCalls[1].state.test.score).toBe(72);
    expect(h.effectCalls[1].state.test.mistakes).toEqual(['missed the tax shield']);
  });

  it('returns 502 and persists nothing when an effect throws', async () => {
    const h = harness({
      runEffect: vi.fn(async () => {
        throw new Error('model unavailable');
      }) as unknown as StepDeps['runEffect'],
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runSessionStep(loadedSession(initialState()), { type: 'start' }, h.deps);

    expect(result).toEqual({ status: 502, error: 'The coach did not respond. Please try again.' });
    expect(h.deps.saveSessionStep).not.toHaveBeenCalled();
    expect(h.deps.applySessionOutcome).not.toHaveBeenCalled();
  });

  it('finalises through applySessionOutcome alone on feedback.confirm', async () => {
    const state: SessionState = {
      ...initialState(),
      phase: 'feedback',
      practice: { questions: ['p1', 'p2'], answers: ['a', 'b'], correct: 1 },
      explain: { conceptGaps: ['tax shield'], englishNotes: [{ skill: 'Articles', note: 'Say "the company"' }] },
      test: { questions: ['Q one', 'Q two', 'Q three'], answers: ['a', 'b', 'c'], score: 72, mistakes: ['missed the tax shield'] },
      feedback: { summary: 'Solid grasp.', selfConfidence: null },
    };
    const h = harness();
    const result = await runSessionStep(loadedSession(state), { type: 'feedback.confirm', selfConfidence: 4 }, h.deps);

    expect(result.status).toBe(200);
    expect(h.deps.saveSessionStep).not.toHaveBeenCalled();
    expect(h.deps.applySessionOutcome).toHaveBeenCalledTimes(1);
    const w = h.outcomes[0];
    expect(w.state.phase).toBe('done');
    expect(w.englishNotes).toEqual([{ skill: 'Articles', note: 'Say "the company"' }]);
    expect(w.selfConfidence).toBe(4);
    expect(w.at).toBe(AT);
    expect(w.sessionId).toBe('session-1');
  });

  it('returns 409 and persists nothing for an event invalid in the current phase', async () => {
    const h = harness();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runSessionStep(loadedSession(initialState()), { type: 'test.answer', answer: 'a' }, h.deps);

    expect(result).toEqual({ status: 409, error: 'That step is no longer available. Reload the page to continue.' });
    expect(h.deps.saveSessionStep).not.toHaveBeenCalled();
    expect(h.deps.applySessionOutcome).not.toHaveBeenCalled();
    expect(h.deps.runEffect).not.toHaveBeenCalled();
  });

  it('appends the next test question after the student message on a non-final test answer', async () => {
    const state: SessionState = {
      ...initialState(),
      phase: 'test',
      test: { questions: ['Q one', 'Q two', 'Q three'], answers: [], score: null, mistakes: [] },
    };
    const h = harness();
    const result = await runSessionStep(loadedSession(state), { type: 'test.answer', answer: 'my answer' }, h.deps);

    expect(result.status).toBe(200);
    expect(h.saved[0].messages).toEqual([
      { phase: 'test', role: 'student', content: 'my answer' },
      { phase: 'test', role: 'coach', content: 'Question 2 of 3: Q two' },
    ]);
  });
});
