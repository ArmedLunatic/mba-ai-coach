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
