const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date as YYYY-MM-DD (UTC). Set COACH_TODAY to time-travel while testing. */
export function todayISO(): string {
  const override = process.env.COACH_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Date().toISOString().slice(0, 10);
}

export function startOfDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Whole days from the start of `fromISO` to `to`. Positive when `to` is later. */
export function daysBetween(fromISO: string, to: Date): number {
  return Math.floor((to.getTime() - startOfDay(fromISO).getTime()) / DAY_MS);
}

/** Current time, or noon UTC on COACH_TODAY when that override is set. */
export function now(): Date {
  const override = process.env.COACH_TODAY;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return new Date(`${override}T12:00:00.000Z`);
  return new Date();
}
