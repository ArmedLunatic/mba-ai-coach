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
