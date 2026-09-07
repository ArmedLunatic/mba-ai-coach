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
