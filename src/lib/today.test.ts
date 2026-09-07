import { afterEach, describe, expect, it } from 'vitest';
import { daysBetween, now, startOfDay, todayISO } from './today';

describe('todayISO', () => {
  afterEach(() => {
    delete process.env.COACH_TODAY;
  });

  it('honours COACH_TODAY override', () => {
    process.env.COACH_TODAY = '2026-09-10';
    expect(todayISO()).toBe('2026-09-10');
  });

  it('returns a YYYY-MM-DD string by default', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-09-07', new Date('2026-09-09T15:00:00Z'))).toBe(2);
  });
  it('is negative for past dates', () => {
    expect(daysBetween('2026-09-07', new Date('2026-09-05T00:00:00Z'))).toBe(-2);
  });
});

describe('startOfDay', () => {
  it('returns midnight UTC for the ISO date', () => {
    expect(startOfDay('2026-09-07').toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });
});

describe('now', () => {
  afterEach(() => {
    delete process.env.COACH_TODAY;
  });
  it('is noon UTC on COACH_TODAY when set', () => {
    process.env.COACH_TODAY = '2026-09-10';
    expect(now().toISOString()).toBe('2026-09-10T12:00:00.000Z');
  });
  it('is the current time otherwise', () => {
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
