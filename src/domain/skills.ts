export function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** English comfort 1..5 → 30..80. MBA topics always start at 50. */
export function initialScores(englishComfort: number): { english: number; communication: number; mba: number } {
  const c = Math.max(1, Math.min(5, englishComfort));
  const english = clamp100(30 + (c - 1) * 12.5);
  return { english, communication: english, mba: 50 };
}

/** 60% test score, 40% practice accuracy. No practice questions → practice counts as 50. */
export function computePerformance(testScore: number, practiceCorrect: number, practiceTotal: number): number {
  const practice = practiceTotal === 0 ? 50 : (practiceCorrect / practiceTotal) * 100;
  return clamp100(0.6 * testScore + 0.4 * practice);
}

/** new = old + k·(performance − old), k = 0.5/√attempts clamped to [0.15, 0.5]. */
export function updateScore(
  current: { score: number; attempts: number },
  performance: number,
): { score: number; attempts: number } {
  const attempts = current.attempts + 1;
  const k = Math.max(0.15, Math.min(0.5, 0.5 / Math.sqrt(attempts)));
  return { score: clamp100(current.score + k * (performance - current.score)), attempts };
}

/** Trend over the last three performances (oldest → newest). ±3 points is the flat band. */
export function computeTrend(performances: number[]): 'up' | 'flat' | 'down' {
  const recent = performances.slice(-3);
  if (recent.length < 2) return 'flat';
  const delta = recent[recent.length - 1] - recent[0];
  if (delta >= 3) return 'up';
  if (delta <= -3) return 'down';
  return 'flat';
}

/** −2 when the same English weakness was already noted this week. */
export function englishPenalty(priorNotesThisWeek: number): number {
  return priorNotesThisWeek >= 1 ? -2 : 0;
}
