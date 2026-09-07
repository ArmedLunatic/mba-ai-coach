import { describe, expect, it } from 'vitest';
import { formatDate, relativeDays } from './format';

describe('format', () => {
  it('formats a date as short month and day', () => {
    expect(formatDate(new Date('2026-09-09T12:00:00Z'))).toBe('Sep 9');
  });
  it('describes relative days', () => {
    expect(relativeDays(0)).toBe('today');
    expect(relativeDays(1)).toBe('tomorrow');
    expect(relativeDays(3)).toBe('in 3 days');
    expect(relativeDays(-1)).toBe('yesterday');
    expect(relativeDays(-4)).toBe('4 days ago');
  });
});
