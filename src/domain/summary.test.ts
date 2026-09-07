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
