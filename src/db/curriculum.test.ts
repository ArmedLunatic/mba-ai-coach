import { describe, expect, it } from 'vitest';
import { COMMUNICATION_SKILLS, COURSES, ENGLISH_SKILLS, isLanguageDomain } from './curriculum';

describe('curriculum', () => {
  it('has six courses with unique slugs and 4-6 topics each', () => {
    expect(COURSES).toHaveLength(6);
    expect(new Set(COURSES.map((c) => c.slug)).size).toBe(6);
    for (const c of COURSES) {
      expect(c.topics.length).toBeGreaterThanOrEqual(4);
      expect(c.topics.length).toBeLessThanOrEqual(6);
    }
  });

  it('includes the spec examples', () => {
    const finance = COURSES.find((c) => c.slug === 'finance')!;
    expect(finance.topics).toEqual(expect.arrayContaining(['WACC', 'NPV', 'CAPM', 'Valuation']));
    const strategy = COURSES.find((c) => c.slug === 'strategy')!;
    expect(strategy.topics).toEqual(expect.arrayContaining(["Porter's Five Forces", 'SWOT']));
  });

  it('lists English and Communication skills', () => {
    expect(ENGLISH_SKILLS).toContain('Articles');
    expect(ENGLISH_SKILLS).toContain('Subject-verb agreement');
    expect(COMMUNICATION_SKILLS).toContain('Answer structure');
  });

  it('classifies language domains', () => {
    expect(isLanguageDomain('english')).toBe(true);
    expect(isLanguageDomain('communication')).toBe(true);
    expect(isLanguageDomain('finance')).toBe(false);
  });
});
