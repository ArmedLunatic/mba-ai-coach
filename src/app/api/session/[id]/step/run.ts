import { levelFor, type CoachContext } from '@/ai/context';
import type { runEffect } from '@/ai/phases';
import type { LoadedSession, NewMessage, SessionOutcomeWrite } from '@/db/queries';
import type { SessionMessage } from '@/db/schema';
import { computeOutcome } from '@/domain/outcome';
import { apply, InvalidTransition, next, type EffectResult, type SessionEvent, type SessionState } from '@/domain/session';
import { coachMessagesFor, pendingTestQuestion, studentMessageFor } from '@/domain/transcript';

export type StepDeps = {
  runEffect: typeof runEffect;
  getSkillObservations: (skillId: string, limit: number) => Promise<{ note: string }[]>;
  getSkillPerformances: (skillId: string, limit: number) => Promise<number[]>;
  saveSessionStep: (id: string, state: SessionState, messages: NewMessage[]) => Promise<void>;
  applySessionOutcome: (w: SessionOutcomeWrite) => Promise<void>;
  getSessionMessages: (id: string) => Promise<SessionMessage[]>;
  now: () => Date;
};

export type StepResult =
  | { status: 200; state: SessionState; messages: SessionMessage[] }
  | { status: 409 | 502; error: string };

/**
 * Advances one session by one event: state machine → model effects → a single persistence write.
 * The final step persists state, transcript and outcome in one transaction via `applySessionOutcome`,
 * so a session is never left at `phase = 'done'` without its outcome.
 */
export async function runSessionStep(loaded: LoadedSession, event: SessionEvent, deps: StepDeps): Promise<StepResult> {
  const { session, skill, course, student } = loaded;
  const id = session.id;
  const before = session.phaseState;

  let transition: ReturnType<typeof next>;
  try {
    transition = next(before, event);
  } catch (e) {
    if (e instanceof InvalidTransition) {
      console.warn('session step rejected', { id, event: event.type, reason: e.message });
      return { status: 409, error: 'That step is no longer available. Reload the page to continue.' };
    }
    throw e;
  }

  const observations = await deps.getSkillObservations(skill.id, 5);
  const ctx: CoachContext = {
    studentName: student.name,
    level: levelFor(student.englishComfort),
    courseName: course?.name ?? null,
    topic: skill.name,
    recentMistakes: observations.map((o) => o.note),
  };

  let state = transition.state;
  const newMessages: NewMessage[] = [];
  const studentText = studentMessageFor(event);
  if (studentText) newMessages.push({ phase: before.phase, role: 'student', content: studentText });

  for (const effect of transition.effects) {
    if (effect.kind === 'finalize') continue;
    let result: EffectResult;
    try {
      result = await deps.runEffect(effect, ctx, state);
    } catch (e) {
      console.error('session step failed', { id, event: event.type, error: e });
      return { status: 502, error: 'The coach did not respond. Please try again.' };
    }
    // `apply` runs before the next effect on purpose: effects within one transition are ordered and
    // later ones read what earlier ones wrote (e.g. `write-feedback` needs the `test.score` that
    // `grade-test` just produced). Do not hoist these applies out of the loop.
    state = apply(state, result);
    for (const content of coachMessagesFor(result)) {
      newMessages.push({ phase: state.phase, role: 'coach', content });
    }
  }

  const pending = pendingTestQuestion(before, state);
  if (pending) newMessages.push({ phase: 'test', role: 'coach', content: pending });

  if (state.phase === 'done') {
    const at = deps.now();
    const prior = await deps.getSkillPerformances(skill.id, 3);
    const outcome = computeOutcome(state, skill, prior);
    await deps.applySessionOutcome({
      sessionId: id,
      skillId: skill.id,
      studentId: student.id,
      performance: outcome.performance,
      score: outcome.score,
      attempts: outcome.attempts,
      trend: outcome.trend,
      confidence: outcome.confidence,
      selfConfidence: state.feedback.selfConfidence ?? 3,
      summary: state.feedback.summary ?? '',
      mistakes: [...state.test.mistakes, ...state.explain.conceptGaps].slice(0, 5),
      englishNotes: state.explain.englishNotes,
      state,
      messages: newMessages,
      at,
    });
  } else {
    await deps.saveSessionStep(id, state, newMessages);
  }

  const messages = await deps.getSessionMessages(id);
  return { status: 200, state, messages };
}
