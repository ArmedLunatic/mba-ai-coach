import { describe, expect, it } from 'vitest';
import {
  clamp100,
  computePerformance,
  computeTrend,
  englishPenalty,
  initialScores,
  updateScore,
} from './skills';

describe('initialScores', () => {
  it('maps English comfort 1..5 to 30..80 and MBA to 50', () => {
    expect(initialScores(1)).toEqual({ english: 30, communication: 30, mba: 50 });
    expect(initialScores(3)).toEqual({ english: 55, communication: 55, mba: 50 });
    expect(initialScores(5)).toEqual({ english: 80, communication: 80, mba: 50 });
  });
});

describe('computePerformance', () => {
  it('weights test 60% and practice 40%', () => {
    expect(computePerformance(100, 2, 2)).toBe(100);
    expect(computePerformance(50, 1, 2)).toBe(50);
    expect(computePerformance(80, 0, 2)).toBe(48);
  });
  it('treats zero practice questions as neutral 50', () => {
    expect(computePerformance(70, 0, 0)).toBe(62);
  });
});

describe('updateScore', () => {
  it('moves halfway on the first attempt', () => {
    expect(updateScore({ score: 50, attempts: 0 }, 90)).toEqual({ score: 70, attempts: 1 });
  });
  it('moves less as attempts grow, floored at k=0.15', () => {
    // attempts 3 → next is 4 → k = 0.5/sqrt(4) = 0.25
    expect(updateScore({ score: 50, attempts: 3 }, 90)).toEqual({ score: 60, attempts: 4 });
    // attempts 24 → next 25 → k = 0.1 → floored to 0.15 → 50 + 0.15*40 = 56
    expect(updateScore({ score: 50, attempts: 24 }, 90)).toEqual({ score: 56, attempts: 25 });
  });
  it('clamps to 0..100', () => {
    expect(updateScore({ score: 98, attempts: 0 }, 100).score).toBe(99);
    expect(updateScore({ score: 2, attempts: 0 }, 0).score).toBe(1);
  });
});

describe('computeTrend', () => {
  it('is flat with fewer than two data points', () => {
    expect(computeTrend([])).toBe('flat');
    expect(computeTrend([70])).toBe('flat');
  });
  it('compares last of the final three to the first of them', () => {
    expect(computeTrend([40, 50, 60])).toBe('up');
    expect(computeTrend([90, 60, 55])).toBe('down');
    expect(computeTrend([60, 61, 62])).toBe('flat');
    // only the last three count
    expect(computeTrend([10, 80, 80, 79])).toBe('flat');
  });
});

describe('englishPenalty', () => {
  it('penalises repeated weaknesses within a week', () => {
    expect(englishPenalty(0)).toBe(0);
    expect(englishPenalty(1)).toBe(-2);
    expect(englishPenalty(4)).toBe(-2);
  });
});

describe('clamp100', () => {
  it('rounds and clamps', () => {
    expect(clamp100(-3)).toBe(0);
    expect(clamp100(101.2)).toBe(100);
    expect(clamp100(49.5)).toBe(50);
  });
});
