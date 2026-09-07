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
