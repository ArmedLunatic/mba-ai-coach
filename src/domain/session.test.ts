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
