import type { SessionState } from './session';
import { computePerformance, computeTrend, updateScore } from './skills';

export type Outcome = {
  performance: number;
  score: number;
  attempts: number;
  trend: 'up' | 'flat' | 'down';
  confidence: number;
};

export function computeOutcome(
  state: SessionState,
  skill: { score: number; attempts: number },
  priorPerformances: number[],
): Outcome {
  const performance = computePerformance(state.test.score ?? 0, state.practice.correct, state.practice.questions.length);
  const { score, attempts } = updateScore(skill, performance);
  const trend = computeTrend([...priorPerformances, performance]);
  const confidence = (state.feedback.selfConfidence ?? 3) * 20;
  return { performance, score, attempts, trend, confidence };
}
