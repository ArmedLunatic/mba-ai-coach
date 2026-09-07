import { afterEach, describe, expect, it } from 'vitest';
import { initialState, type SessionState } from '@/domain/session';
import type { CoachContext } from './context';
import { runEffect } from './phases';
import { explainTopicPrompt, feedbackPrompt } from './prompts';
import { setModelResolver, type TaskKind } from './router';
import { mockModel, mockResolver } from './test-utils';

const ctx: CoachContext = { studentName: 'Ansh', level: 'beginner', courseName: 'Finance', topic: 'WACC', recentMistakes: [], isLanguage: false };

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

describe('language-domain prompts', () => {
  it('asks for a language point with a wrong and a corrected MBA sentence', () => {
    const languageCtx: CoachContext = { ...ctx, courseName: null, topic: 'Articles', isLanguage: true };
    const prompt = explainTopicPrompt(languageCtx);
    expect(prompt).toContain('language point Articles');
    expect(prompt).toContain('under 150 words');
    expect(prompt).toContain('MBA writing');
    expect(prompt).toContain('Corrected:');
    expect(explainTopicPrompt(ctx)).toContain('under 180 words');
  });
});

describe('feedbackPrompt', () => {
  it('includes the test answers and tells the coach not to repeat gaps the test resolved', () => {
    const state: SessionState = {
      ...initialState(),
      phase: 'feedback',
      explain: { conceptGaps: ['CAPM formula not stated'], englishNotes: [] },
      test: {
        questions: ['Write the CAPM formula.', 'Why beta?', 'Two stocks?'],
        answers: ['E(R) = Rf + Beta x (Rm - Rf)', 'Systematic risk only', 'Not diversified'],
        score: 91,
        mistakes: ['missed that CAPM assumes diversification'],
      },
    };
    const prompt = feedbackPrompt(state);
    expect(prompt).toContain('Q1: Write the CAPM formula.');
    expect(prompt).toContain('A1: E(R) = Rf + Beta x (Rm - Rf)');
    expect(prompt).toContain('treat a gap as resolved');
    expect(prompt).toContain('Graded mistakes: missed that CAPM assumes diversification');
    expect(prompt).toContain('the session is over');
  });
});
